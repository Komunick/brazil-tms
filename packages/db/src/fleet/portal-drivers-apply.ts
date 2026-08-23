import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { PortalDriver } from "@brazil-tms/shared";
import { db } from "../client";
import { drivers } from "../../schema";

/**
 * O CADASTRO DO PORTAL ENTRANDO NO NOSSO (2026-08-23, a pedido).
 *
 * ── CASA PELO ID, DEPOIS PELO NOME, E SÓ ENTÃO CRIA ───────────────────────────────────────────
 *
 * O `portal_driver_id` é a chave certa e é o que esta rotina INSTALA: na primeira passada quase
 * ninguém tem, então o casamento cai para o nome — que é frágil e já custou três motoristas que
 * existiam e o sistema jurava não existirem. Cada casamento por nome grava o id, e a passada
 * seguinte não precisa mais adivinhar.
 *
 * Medido antes de escrever: dos 1.391 do portal, 1.354 casam por nome e 37 não existem aqui.
 *
 * ── NUNCA SOBRESCREVE O QUE UMA PESSOA DIGITOU ────────────────────────────────────────────────
 *
 * Só preenche campo VAZIO. Se alguém corrigiu um telefone à mão porque o do portal estava errado, a
 * próxima leitura não desfaz a correção. A exceção é a validade da CNH: essa vem do documento e o
 * portal é a fonte, então ela é atualizada sempre — é justamente o dado que muda e que dispara o
 * alerta de documentação.
 *
 * ── O QUE NÃO ENTRA ───────────────────────────────────────────────────────────────────────────
 *
 * Nada de conta bancária nem chave de pagamento: não têm uso no TMS, e guardar dado bancário num
 * segundo sistema é responsabilidade sem uso.
 *
 * O CPF entra (2026-08-23, a pedido). É o documento que identifica a pessoa sem depender do nome
 * escrito certo — e é justamente o que faltava para o casamento entre os dois cadastros parar de
 * ser por nome.
 */

export interface ResumoDoCadastro {
  lidos: number;
  casadosPorId: number;
  casadosPorNome: number;
  criados: number;
  camposPreenchidos: number;
}

/** Motorista de quem ainda falta algo que só a revelação traz. */
export interface FaltaRevelar {
  portalDriverId: string;
  campos: ("driver_name" | "phone" | "national_id")[];
}

/**
 * O portal chama de ativo o status 1. O resto é alguma forma de inativo, e a tradução mora aqui em
 * vez de espalhada: se ele criar um código novo, muda uma função.
 */
const situacao = (status: number | null): "active" | "inactive" =>
  status === 1 ? "active" : "inactive";

export async function applyPortalDrivers(entrada: PortalDriver[]): Promise<{
  resumo: ResumoDoCadastro;
  falta: FaltaRevelar[];
}> {
  const resumo: ResumoDoCadastro = {
    lidos: entrada.length,
    casadosPorId: 0,
    casadosPorNome: 0,
    criados: 0,
    camposPreenchidos: 0,
  };
  const falta: FaltaRevelar[] = [];

  for (const p of entrada) {
    const [porId] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.portalDriverId, p.portalDriverId))
      .limit(1);

    let atual = porId;
    if (atual) resumo.casadosPorId += 1;

    if (!atual && p.name) {
      const [porNome] = await db
        .select()
        .from(drivers)
        .where(
          sql`upper(trim(${drivers.name})) = upper(trim(${p.name})) and ${drivers.archivedAt} is null`,
        )
        .limit(1);
      if (porNome) {
        atual = porNome;
        resumo.casadosPorNome += 1;
      }
    }

    if (!atual) {
      /**
       * Só cria com NOME. Sem ele a linha nasceria como "motorista sem nome" e alguém teria de
       * adivinhar quem é — e o nome chega na revelação, na passada seguinte. Enquanto isso, o
       * motorista entra na lista de "falta revelar" e volta completo depois.
       */
      if (!p.name) {
        falta.push({ portalDriverId: p.portalDriverId, campos: ["driver_name"] });
        continue;
      }
      await db.insert(drivers).values({
        name: p.name,
        phone: p.phone,
        cpf: p.cpf,
        licenseNumber: p.licenseNumber,
        licenseCategory: p.licenseCategory,
        licenseExpiry: p.licenseExpiry,
        portalDriverId: p.portalDriverId,
        // O vínculo real é com a transportadora, e o portal não o diz. `owned` é o único valor que
        // a CHECK aceita sem transportadora — quem souber corrige na tela, e a correção fica.
        ownershipType: "owned",
        portalFields: p.bruto,
        portalSyncedAt: new Date(),
        status: situacao(p.status),
        notes: "Cadastro espelhado do portal do cliente.",
      });
      resumo.criados += 1;
      continue;
    }

    const mudanca: Record<string, unknown> = {};
    if (!atual.portalDriverId) mudanca.portalDriverId = p.portalDriverId;
    if (!atual.phone && p.phone) mudanca.phone = p.phone;
    if (!atual.cpf && p.cpf) mudanca.cpf = p.cpf;
    if (!atual.licenseNumber && p.licenseNumber) mudanca.licenseNumber = p.licenseNumber;
    if (!atual.licenseCategory && p.licenseCategory) mudanca.licenseCategory = p.licenseCategory;
    // A validade é a exceção: o portal é a fonte e é o dado que muda.
    if (p.licenseExpiry && atual.licenseExpiry !== p.licenseExpiry) {
      mudanca.licenseExpiry = p.licenseExpiry;
    }

    /**
     * O bruto é REESCRITO a cada leitura, e não mesclado.
     *
     * É um retrato do que o portal diz agora. Mesclar guardaria para sempre um campo que o
     * fornecedor removeu — e aí o cadastro passaria a afirmar coisas que a fonte já não afirma.
     */
    mudanca.portalFields = p.bruto;
    mudanca.portalSyncedAt = new Date();

    if (Object.keys(mudanca).length > 0) {
      // O retrato e o carimbo não contam como campo preenchido: eles mudam em toda leitura.
      resumo.camposPreenchidos += Object.keys(mudanca).length - 2;
      await db
        .update(drivers)
        .set({ ...mudanca, updatedAt: new Date() })
        .where(eq(drivers.id, atual.id));
    }

    const pendentes: ("driver_name" | "phone" | "national_id")[] = [];
    if (!atual.phone && !p.phone) pendentes.push("phone");
    if (!atual.cpf && !p.cpf) pendentes.push("national_id");
    if (pendentes.length > 0) falta.push({ portalDriverId: p.portalDriverId, campos: pendentes });
  }

  return { resumo, falta };
}

/**
 * O valor revelado chegando para UM motorista.
 *
 * Separado do laço acima porque vem em outra ida do robô: ele pergunta, o portal responde um campo,
 * e isso volta aqui. Preenche só se ainda estiver vazio — entre o pedido e a resposta alguém pode
 * ter digitado, e o que a pessoa digitou vale mais.
 *
 * ── O NOME É O QUE DESATA O NÓ, E A PRIMEIRA VERSÃO NÃO DESATAVA ──────────────────────────────
 *
 * Na primeira carga NINGUÉM tem `portal_driver_id` ainda, e a listagem devolve o nome VAZIO — é
 * justamente ele que o portal mascara. Então o laço acima não casava por id (não existe), não casava
 * por nome (não veio) e se recusava a criar sem nome: os 1.391 saíam como "falta revelar" e nada era
 * gravado. A revelação chegava com o nome e procurava a linha `where portal_driver_id = X` — que
 * também não existia. Um esperava pelo outro, e o cadastro ficava parado em zero para sempre
 * (medido em produção 2026-08-23: 1.391 lidos, 0 gravados).
 *
 * Quem quebra o ciclo é o nome revelado: com ele em mãos dá para achar o motorista que JÁ existe
 * aqui e carimbar o id, ou criar o que ainda não existe. A partir daí a listagem casa por id e traz
 * telefone, CPF, CNH e validade sozinha, na passada seguinte.
 */
export async function applyDriverSensitive(
  portalDriverId: string,
  campo: "driver_name" | "phone" | "national_id",
  valor: string,
): Promise<boolean> {
  const limpo = valor.trim();
  if (!limpo) return false;

  /** O nome do campo lá e a coluna daqui — a tradução mora num lugar só. */
  const coluna =
    campo === "phone" ? drivers.phone : campo === "national_id" ? drivers.cpf : drivers.name;
  const nomeDaColuna = campo === "phone" ? "phone" : campo === "national_id" ? "cpf" : "name";
  const resultado = await db
    .update(drivers)
    .set({ [nomeDaColuna]: limpo, updatedAt: new Date() })
    .where(
      sql`${drivers.portalDriverId} = ${portalDriverId} and (${coluna} is null or trim(${coluna}) = '')`,
    )
    .returning({ id: drivers.id });
  if (resultado.length > 0) return true;

  // Telefone e CPF não abrem caminho nenhum: sem o vínculo, não se sabe de quem são.
  if (campo !== "driver_name") return false;

  const [jaVinculado] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.portalDriverId, portalDriverId))
    .limit(1);
  // O vínculo existe e o nome já estava preenchido: o `update` acima não achou por isso, e não há
  // nada a fazer — o nome digitado aqui vale mais que o do portal.
  if (jaVinculado) return false;

  const [porNome] = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(
      sql`upper(trim(${drivers.name})) = upper(trim(${limpo}))
          and ${drivers.archivedAt} is null
          and ${drivers.portalDriverId} is null`,
    )
    .limit(1);

  if (porNome) {
    await db
      .update(drivers)
      .set({ portalDriverId, updatedAt: new Date() })
      .where(eq(drivers.id, porNome.id));
    return true;
  }

  /**
   * Motorista que existe lá e não existe aqui. Nasce só com nome e vínculo de propósito: o resto
   * (telefone, CPF, CNH, validade, o retrato bruto) chega na próxima listagem, que agora casa por
   * id. `status` fica no padrão `active` da coluna — a listagem é quem sabe a situação real, e ela
   * passa aqui em minutos.
   */
  await db.insert(drivers).values({
    name: limpo,
    portalDriverId,
    // Mesma razão do laço acima: `owned` é o único valor que a CHECK aceita sem transportadora.
    ownershipType: "owned",
    notes: "Cadastro espelhado do portal do cliente.",
  });
  return true;
}

/** Quantos ainda estão sem telefone — o número que diz se vale continuar revelando. */
export async function contarSemTelefone(): Promise<number> {
  const [linha] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(drivers)
    // `&&` aqui era JavaScript, não SQL: o `or(...)` é um objeto (sempre verdadeiro), então a
    // expressão inteira virava só a condição da direita e o "sem telefone" sumia do WHERE.
    .where(
      and(
        or(isNull(drivers.phone), sql`trim(${drivers.phone}) = ''`),
        sql`${drivers.portalDriverId} is not null`,
      ),
    );
  return linha?.n ?? 0;
}
