import "server-only";
import { z } from "zod";
import {
  ALL_PERMISSIONS,
  motivosParaRecusar,
  ROLE_PERMISSIONS,
  type Role,
  type MotivoDeRecusaDeCargo,
  type PermissionKey,
} from "@brazil-tms/shared";
import {
  cargosAtivos,
  criarCargo,
  desativarCargo,
  gravarCargo,
  listarCargos,
  definirCargosDaPessoa,
  quantasPessoasNoCargo,
  quantosAindaAdministram,
  SemAdministrador,
  db,
} from "@brazil-tms/db";
import type { AuthContext } from "@/lib/auth/require-auth";

/**
 * O SERVIÇO DA TELA DE CARGOS — onde a validação acontece antes de a escrita ser tentada.
 *
 * ── AS DUAS METADES DA VALIDAÇÃO, E POR QUE ELAS SÃO DIFERENTES ───────────────────────────────
 *
 * **Aqui** entram as recusas que dá para decidir sem escrever nada: capacidade fora do catálogo,
 * concessão além do próprio alcance, cargo com gente e sem destino. São perguntas sobre a ENTRADA.
 *
 * **No banco**, dentro da transação e depois da escrita, entra a única que não dá: "ainda sobra
 * administrador?". O porquê está em `ainda-tem-admin.ts` — contar antes perde a corrida de duas
 * abas, e essa corrida é de duas pessoas clicando, não de mil requisições por segundo.
 *
 * As duas usam a MESMA função pura (`motivosParaRecusar`); o que muda é de onde vem a contagem.
 */

export class RecusaDeCargo extends Error {
  constructor(readonly motivos: MotivoDeRecusaDeCargo[]) {
    super(motivos.join(", "));
    this.name = "RecusaDeCargo";
  }
}

const nome = z.string().trim().min(2).max(60);
const permissoes = z.array(z.string().trim()).max(ALL_PERMISSIONS.length);

export const criarCargoSchema = z.object({ nome });
export const gravarCargoSchema = z.object({
  nome,
  ativo: z.boolean().default(true),
  permissoes: permissoes.default([]),
});
export const desativarCargoSchema = z.object({ moverPara: z.string().uuid().nullable().default(null) });
/**
 * OS CARGOS DE UMA PESSOA — vários desde 2026-09-01.
 *
 * Lista, e não um id: uma pessoa do setor GR que também cuida do spot precisa dos dois. Lista VAZIA
 * é permitida e significa "sem acesso" — recusá-la obrigaria a inventar um cargo para quem está
 * sendo desligado, e o conjunto vazio já é o estado seguro (ver `sem-cargo.test.ts`).
 *
 * O teto de 10 não é regra de negócio: é o que impede um corpo absurdo de virar uma consulta
 * absurda. Ninguém acumula dez funções.
 */
export const moverPessoaSchema = z.object({
  cargoIds: z.array(z.string().uuid()).max(10),
});

/**
 * Confere o que dá para conferir sem escrever, e lança com TODOS os motivos.
 *
 * `administradoresDepois: null` porque essa contagem não é feita aqui — quem a faz é a transação.
 */
function conferirEntrada(
  ctx: AuthContext,
  concedidas: string[],
  pessoasSemDestino = 0,
): void {
  const motivos = motivosParaRecusar({
    concedidas,
    catalogo: ALL_PERMISSIONS,
    doEditor: ctx.permissoes as ReadonlySet<PermissionKey>,
    administradoresDepois: null,
    pessoasSemDestino,
  });
  if (motivos.length > 0) throw new RecusaDeCargo(motivos);
}

export async function lerCargos() {
  return listarCargos();
}

export async function criar(ctx: AuthContext, entrada: z.infer<typeof criarCargoSchema>) {
  // Nasce vazio, então não há o que conferir além do nome — que o Zod já conferiu.
  const id = await criarCargo(entrada.nome, ctx.userId);
  return { id };
}

export async function gravar(
  ctx: AuthContext,
  cargoId: string,
  entrada: z.infer<typeof gravarCargoSchema>,
) {
  conferirEntrada(ctx, entrada.permissoes);
  try {
    await gravarCargo(cargoId, { ...entrada, permissoes: entrada.permissoes }, ctx.userId);
  } catch (e) {
    if (e instanceof SemAdministrador) throw new RecusaDeCargo(["ULTIMO_ADMIN"]);
    throw e;
  }
  /*
    Devolve O QUE FICOU GUARDADO, e não o que foi mandado (FR / contrato).

    A tela não pode seguir achando que gravou outra coisa — foi assim que `programacao_prefs` ficou
    um dia inteiro respondendo 200 sem gravar nada, e ninguém percebeu.
  */
  const depois = (await listarCargos()).find((c) => c.id === cargoId);
  return { cargo: depois ?? null };
}

export async function desativar(
  ctx: AuthContext,
  cargoId: string,
  entrada: z.infer<typeof desativarCargoSchema>,
) {
  const dentro = await quantasPessoasNoCargo(cargoId);
  if (dentro > 0 && !entrada.moverPara) conferirEntrada(ctx, [], dentro);
  if (entrada.moverPara) {
    const ativos = await cargosAtivos([entrada.moverPara]);
    if (!ativos.has(entrada.moverPara)) throw new RecusaDeCargo(["CARGO_COM_PESSOAS"]);
  }
  try {
    await desativarCargo(cargoId, entrada.moverPara, ctx.userId);
  } catch (e) {
    if (e instanceof SemAdministrador) throw new RecusaDeCargo(["ULTIMO_ADMIN"]);
    throw e;
  }
}

/**
 * DEFINE O CONJUNTO de cargos de uma pessoa — vários desde 2026-09-01.
 *
 * O nome ficou `moverPessoa` por ser o que a rota já chamava, mas o que ele faz mudou: não move
 * mais de um cargo para outro, e sim substitui a lista inteira.
 */
export async function moverPessoa(ctx: AuthContext, userId: string, cargoIds: string[]) {
  /*
    CARGO DESATIVADO NÃO ENTRA. Ele não concede nada — a leitura da sessão exige `c.ativo` —, e
    deixá-lo entrar criaria um vínculo que a tela mostraria como acesso e a sessão ignoraria. Duas
    telas dizendo coisas diferentes sobre o mesmo acesso é o pior desfecho possível aqui.
  */
  const ativos = await cargosAtivos(cargoIds);
  if (cargoIds.some((id) => !ativos.has(id))) throw new RecusaDeCargo(["PERMISSAO_DESCONHECIDA"]);
  try {
    await definirCargosDaPessoa(userId, cargoIds, ctx.userId);
  } catch (e) {
    if (e instanceof SemAdministrador) throw new RecusaDeCargo(["ULTIMO_ADMIN"]);
    throw e;
  }
}

/** Quantos administram hoje — a tela mostra antes de deixar mexer no último. */
export async function quantosAdministramHoje(): Promise<number> {
  return quantosAindaAdministram(db as never);
}

/**
 * O CARGO EQUIVALENTE A UM PAPEL — a ponte enquanto a tela de usuários ainda pergunta o papel.
 *
 * Ninguém pode nascer sem cargo (FR-011): `users.cargo_id` é NULO no banco de propósito — o app
 * anterior precisava criar usuário durante o deploy sem saber preencher a coluna —, e até o
 * `NOT NULL` de uma fatia futura quem sustenta o invariante é a APLICAÇÃO.
 *
 * ── COMPARA CONJUNTOS, E NÃO NOMES ────────────────────────────────────────────────────────────
 *
 * Os cargos semeados são renomeáveis (FR-016). Procurar "Despachante" pelo nome quebraria no dia em
 * que alguém o chamasse de "Programação" — e quebraria em silêncio, com gente nascendo sem cargo.
 *
 * A ponte é o CONJUNTO de capacidades: o cargo cujo conjunto é exatamente o do papel.
 *
 * ── E QUANDO NÃO BATE, RECUSA — não escolhe um parecido ───────────────────────────────────────
 *
 * Isso acontece assim que alguém editar um cargo semeado, e é esperado. Pôr a pessoa num cargo
 * "próximo" concederia acesso que ninguém pediu, em silêncio, na criação de um usuário — que é o
 * momento em que menos se confere. A recusa diz o que fazer: escolher o cargo.
 */
export async function cargoParaPapel(papel: Role): Promise<string> {
  const doPapel = ROLE_PERMISSIONS[papel];
  const cargos = await listarCargos();
  const igual = cargos.find(
    (c) =>
      c.ativo &&
      c.permissoes.length === doPapel.size &&
      c.permissoes.every((p) => doPapel.has(p as PermissionKey)),
  );
  if (!igual) throw new RecusaDeCargo(["PERMISSAO_DESCONHECIDA"]);
  return igual.id;
}
