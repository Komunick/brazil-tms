import "server-only";
import { z } from "zod";
import {
  ALL_PERMISSIONS,
  motivosParaRecusar,
  type MotivoDeRecusaDeCargo,
  type PermissionKey,
} from "@brazil-tms/shared";
import {
  cargosAtivos,
  criarCargo,
  desativarCargo,
  gravarCargo,
  listarCargos,
  moverPessoaDeCargo,
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
export const moverPessoaSchema = z.object({ cargoId: z.string().uuid() });

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

export async function moverPessoa(ctx: AuthContext, userId: string, cargoId: string) {
  const ativos = await cargosAtivos([cargoId]);
  if (!ativos.has(cargoId)) throw new RecusaDeCargo(["PERMISSAO_DESCONHECIDA"]);
  try {
    await moverPessoaDeCargo(userId, cargoId, ctx.userId);
  } catch (e) {
    if (e instanceof SemAdministrador) throw new RecusaDeCargo(["ULTIMO_ADMIN"]);
    throw e;
  }
}

/** Quantos administram hoje — a tela mostra antes de deixar mexer no último. */
export async function quantosAdministramHoje(): Promise<number> {
  return quantosAindaAdministram(db as never);
}
