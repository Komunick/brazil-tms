import "dotenv/config";
import { eq, inArray, isNull, sql } from "drizzle-orm";
import { customers, db, locations } from "../src";

/**
 * A REGIÃO OPERACIONAL de cada estação, como o cliente a declara (2026-08-20).
 *
 * Três valores, e são os do vocabulário da operação, não os do IBGE:
 *
 *   NONE     Norte + Nordeste
 *   SUDESTE  Sudeste
 *   SULCO    Sul + Centro-Oeste
 *
 * ── O VALOR É COPIADO, NUNCA DEDUZIDO ──────────────────────────────────────────────────────────
 *
 * Dava para derivar a região da UF que já está no nome da estação: acerta em 71 dos 74 casos e são
 * dez linhas de código. Não serve, e as três exceções são a razão — Palmas/TO e Itaitinga/CE estão
 * em SULCO, Guanambi/BA em SUDESTE, contra a geografia, porque a operação decidiu assim (confirmado
 * pelo usuário em 2026-08-20). Deduzir apagaria decisão tomada de propósito, e ninguém veria.
 *
 * ── POR QUE A TABELA MORA AQUI, E NÃO NUM ARQUIVO DE ENTRADA ───────────────────────────────────
 *
 * O seed vizinho (`shopee-station-ids`) lê um .txt porque aquilo são 111 pares capturados de uma API
 * e recapturáveis a qualquer momento. Isto é diferente: são 74 decisões humanas, vindas de uma
 * planilha que mora no computador de uma pessoa. Versionadas aqui, elas sobrevivem ao computador, e
 * a mudança de uma região aparece no diff — que é onde uma decisão dessas deve aparecer.
 *
 * São 74 linhas da planilha mais 4 origens ditadas depois (ver o bloco no fim da tabela).
 *
 * Idempotente: reescreve a região das estações listadas e reporta as que o TMS não tem.
 *
 *   pnpm --filter @brazil-tms/db db:seed:regioes
 *
 * ── AS CINCO QUE FICARAM DE FORA ───────────────────────────────────────────────────────────────
 *
 * A planilha traz cinco linhas só com o nome, sem código, e sem código não há chave exata para
 * casar — o nome não sobrevive à comparação (é a mesma lição do seed de ids ao lado). Ficam para
 * classificação manual:
 *
 *   • LM HUB_BA_SALVADOR_PIRAJÁ → NONE
 *   • FM HUB_MG_SETE LAGOAS → SUDESTE
 *   • Hub_CE_Juazeiro do Norte_01 → NONE
 *   • SOC_SP_CUMBICA_GUARULHOS → SUDESTE
 *   • FM HUb_SP_EMBU DAS ARTES_35 → SUDESTE
 */

const CUSTOMER_CODE = "SHOPEE";

/** Código operacional da estação → região declarada. Copiado de `regioes.xlsx`. */
const REGIOES: ReadonlyArray<readonly [string, string]> = [
  ["FBS-GO3", "SULCO"], // FBS_GO_GOIANIA (HIDROLÂNDIA)
  ["FBS-SP9", "SUDESTE"], // FBS SP_FRANCO DA ROCHA
  ["FMH-AJU-02", "NONE"], // FM HUB_SE_ARACAJU02
  ["FMH-BAU-03", "SUDESTE"], // FM HUB_SP_BAURU
  ["FMH-BHZ-10", "SUDESTE"], // FMH HUB_MG_BELO HORIZONTE
  ["FMH-BHZ-12", "SUDESTE"], // FM HUB_MG_SETELAGOAS
  ["FMH-JDF-03", "SUDESTE"], // FM HUB_MG_JUIZ DE FORA 03
  ["FMH-JPA-03", "NONE"], // FM HUB_PB_JOÃO PESSOA_03
  ["FMH-NFU-01", "SUDESTE"], // FM HUB_RJ_DUAS PEDRAS (N. FRIBURGO)
  ["FMH-RIO-04", "SUDESTE"], // FM HUB_RJ_CAMPO GRANDE
  ["FMH-SAO-31", "SUDESTE"], // FM HUB_SP_BARUERI_31
  ["FMH-SAO-32", "SUDESTE"], // FM HUB_SP_PQ. NOVO MUNDO
  ["FMH-UMU-01", "SULCO"], // FM HUB_PR_UMUARAMA_PQ_INDUST_II
  ["FMH-UMU-02", "SULCO"], // FM HUB_PR_UMUARAMA_PQ_INDUST_II
  ["FMH-VAG-03", "SUDESTE"], // FM HUB_MG_VARGINHA_03
  ["FMH-VIX-05", "SUDESTE"], // FM HUB_ES_VILA VELHA (VIANA)
  ["HUB-LBA-12", "NONE"], // LM HUB_BA_ALAGOINHAS
  ["HUB-LBA-17", "NONE"], // LM HUB_BA_SIMOES FILHO
  ["HUB-LBA-33", "NONE"], // LM HUB_BA_BARREIRAS
  ["HUB-LES-01", "SUDESTE"], // LM HUB_ES_CACHOEIRO DE ITAP
  ["HUB-LES-04", "SUDESTE"], // LM HUB_ES_GUARAPARI
  ["HUB-LGO-02", "SULCO"], // LM Hub_GO_GOIANIA_ ST. EMPR_02
  ["HUB-LGO-06", "SULCO"], // LM HUB_GO_GOIÂNIA_AEROPORTO
  ["HUB-LMA-01", "NONE"], // LM HUB_MA_SAO LUIS_01
  ["HUB-LMA-02", "NONE"], // LM HUB_MA_SAO LUIS_02
  ["HUB-LMG-01", "SUDESTE"], // LM HUB_MG_SETE LAGOAS
  ["HUB-LMG-50", "SUDESTE"], // LM HUB_MG_BELO HORIZONTE_02
  ["HUB-LPB-03", "NONE"], // LM HUB_PB_JOÃO PESSOA_03
  ["HUB-LPE-03", "NONE"], // LM HUB_PE_RECIFE_OLINDA
  ["HUB-LPE-04", "NONE"], // LM HUB_PE_CARUARU_CIDADE_ALTA
  ["HUB-LPE-07", "NONE"], // LM HUB_PE_RECIFE_JABOATÃO
  ["HUB-LPE-11", "NONE"], // LM HUB_PE_RECIFE_MURIBECA
  ["HUB-LRN-01", "NONE"], // LM HUB_RN_NATAL_01
  ["HUB-LRN-03", "NONE"], // LM HUB_RN_NATAL_03
  ["HUB-LSE-01", "NONE"], // LM HUB_SE_ARACAJU
  ["HUB-LSE-03", "NONE"], // LM HUB_SE_ARACAJU_02
  ["HUB-LSP-06", "SUDESTE"], // LM HUB_SP_GUARUJÁ
  ["HUB-LSP-105", "SUDESTE"], // LM HUB_SP_CAMPINAS_PQ CIDADE
  ["HUB-LSP-93", "SUDESTE"], // LM HUB_SP_SANTO ANDRE
  ["HUB-LTO-01", "SULCO"], // LM HUB_TO_PALMAS
  ["SOC-BA2", "NONE"], // SOC_BA_SIMOES FILHO
  ["SOC-CE3", "SULCO"], // SOC_CE_ITAITINGA
  ["SOC-GO1", "SULCO"], // SOC_GO_GOIANIA (HIDROLÂNDIA)
  ["SOC-GO2", "SULCO"], // SOC_GO_GOIANIA_02 (AEROPORTO)
  ["SOC-MG2", "SUDESTE"], // SOC_MG_BETIM
  ["SOC-PE2", "NONE"], // SOC_PE_JABOATÃO DOS GUARARAPES
  ["SOC-RJ1", "SUDESTE"], // SOC_RJ_RIO DE JANEIRO (S. J. MERITI)
  ["SOC-RJ2", "SUDESTE"], // SOC_RJ_DUQUE DE CAXIAS
  ["SOC-SP10", "SUDESTE"], // SOC_SP_IBITINGA
  ["SOC-SP2", "SUDESTE"], // SOC_SP_SANTANA
  ["SOC-SP5", "SUDESTE"], // SOC_SP_CRAVINHOS
  ["SOC-SP6", "SUDESTE"], // SOC_SP_GUARULHOS
  ["SOC-SP7", "SUDESTE"], // SOC_SP_LOUVEIRA
  ["SOC-SP8", "SUDESTE"], // SOC_SP_SÃO B. DO CAMPO
  ["XPT-LBA-79", "NONE"], // XPT_BA_PORTO SEGURO_04
  ["XPT-LBA-81", "NONE"], // XPT_BA_BAIXA GRANDE
  ["XPT-LBA-86", "NONE"], // XPT_BA_RIBEIRA DO POMBAL
  ["XPT-LBA-88", "SUDESTE"], // XPT_BA_GUANAMBI_02
  ["XPT-LBA-91", "NONE"], // XPT_BA_JEQUIÉ_02
  ["XPT-LBA-94", "NONE"], // XPT_BA_SENHOR DO BONFIM
  ["XPT-LGO-89", "SULCO"], // XPT_GO_FORMOSA
  ["XPT-LGO-95", "SULCO"], // XPT_GO_ÁGUAS LINDAS GOIÁS_02
  ["XPT-LMG-111", "SUDESTE"], // XPT_MG_GUANHAES
  ["XPT-LMG-113", "SUDESTE"], // XPT_MG_SAO JOAO DEL REI_02
  ["XPT-LMG-76", "SUDESTE"], // XPT_MG_JANUÁRIA
  ["XPT-LMG-77", "SUDESTE"], // XPT_MG_LEOPOLDINA_03
  ["XPT-LMG-78", "SUDESTE"], // XPT_MG_POÇOS DE CALDAS
  ["XPT-LMG-85", "SUDESTE"], // XPT_MG_CURVELO
  ["XPT-LMG-88", "SUDESTE"], // XPT_MG_DIAMANTINA
  ["XPT-LMG-89", "SUDESTE"], // XPT_MG_CARATINGA
  ["XPT-LMG-95", "SUDESTE"], // XPT_MG_OURO PRETO_02
  ["XPT-LPB-90", "NONE"], // XPT_PB_PATOS
  ["XPT-LSE-89", "NONE"], // XPT_SE_ITABAIANA
  ["XPT-NSG-01", "NONE"], // XPT_SE_ITABAIANA

  /**
   * QUATRO ORIGENS QUE A PLANILHA NÃO TINHA (2026-08-20, ditadas pelo usuário).
   *
   * Não vieram do arquivo: vieram de uma pergunta direta depois que a conferência mostrou 13 viagens
   * ACEITAS saindo de estações sem classificação — com motorista, repetindo semana a semana, e duas
   * na estrada naquele momento. Eram rotas da operação cuja ponta de saída ficou de fora do arquivo.
   *
   * DUAS DELAS CONTRARIAM A GEOGRAFIA, e é por isso que estão escritas aqui em vez de deduzidas:
   * Caldas Novas fica em Goiás e é NONE; Bom Jesus da Lapa fica na Bahia e é SUDESTE. Qualquer regra
   * por UF teria errado as duas.
   */
  ["XPT-LBA-73", "SUDESTE"], // XPT_BA_BOM JESUS DA LAPA_02 — Bahia, mas opera no Sudeste
  ["XPT-LGO-97", "NONE"], // XPT_GO_CALDAS NOVAS — Goiás, mas opera no Norte-Nordeste
  ["FMH-CPS-01", "SUDESTE"], // FM Hub_SP_Campinas
  ["SOC-PR1", "SULCO"], // SoC_PR_Curitiba
];

async function main(): Promise<void> {
  const cliente = (
    await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.customerCode, CUSTOMER_CODE))
      .limit(1)
  )[0];
  if (!cliente) throw new Error(`Cliente ${CUSTOMER_CODE} não encontrado.`);

  const codigos = REGIOES.map(([codigo]) => codigo);
  const existentes = new Map(
    (
      await db
        .select({ code: locations.code, region: locations.region })
        .from(locations)
        .where(inArray(locations.code, codigos))
    ).map((l) => [l.code, l.region]),
  );

  let gravadas = 0;
  const ausentes: string[] = [];
  for (const [codigo, regiao] of REGIOES) {
    if (!existentes.has(codigo)) {
      ausentes.push(codigo);
      continue;
    }
    if (existentes.get(codigo) === regiao) continue;
    await db
      .update(locations)
      .set({ region: regiao, updatedAt: new Date() })
      .where(eq(locations.code, codigo));
    gravadas += 1;
  }

  const semRegiao = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(locations)
    .where(isNull(locations.region));

  console.log(`Regiões na planilha: ${REGIOES.length}`);
  console.log(`Gravadas agora: ${gravadas} (as demais já estavam com o valor certo)`);
  console.log(`Estações da planilha que o TMS NÃO tem: ${ausentes.length}`);
  if (ausentes.length) console.log(`  ${ausentes.join(", ")}`);
  console.log(`Estações do TMS ainda SEM região: ${semRegiao[0]?.n ?? 0}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
