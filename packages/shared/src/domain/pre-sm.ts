import type { OwnershipType, VinculoEscolhivel } from "../schemas/master-data";

/**
 * O VÍNCULO QUE A GERENCIADORA EXIGE (2026-08-25, fatia 026).
 *
 * Toda solicitação de monitoramento na Logae precisa dizer, para cada veículo, carreta e motorista,
 * o que ele é. São três letras, e elas não têm nada de óbvio:
 *
 *   F  frota      — é nosso
 *   A  agregado   — de terceiro, mas roda fixo para nós
 *   T  terceiro   — autônomo, viagem eventual
 *
 * Tudo neste arquivo é PURO: sem banco, sem rede, sem relógio. É o que permite provar a decisão
 * inteira por teste, num caminho em que a validação de verdade não existe — a gerenciadora não tem
 * ambiente de homologação para nós (`CodErro 100`, medido em 25/08).
 */

/** As três letras que a Integra aceita nos campos `Vinc*`. */
export type VinculoLogae = "F" | "A" | "T";

const PARA_LOGAE: Record<VinculoEscolhivel, VinculoLogae> = {
  owned: "F",
  agregado: "A",
  terceiro: "T",
};

/**
 * Traduz o nosso `ownership_type` para a letra dela — ou `null` quando não dá.
 *
 * `subcontracted` devolve **`null`**, e isso é o ponto: ele significa "ainda não classificado", não
 * um quarto tipo. Chutar `A` para ele seria mandar informação errada para quem faz escolta, e o
 * erro ficaria invisível — a Pré-SM sairia, o veículo rodaria, e ninguém saberia que a classificação
 * era um palpite nosso.
 *
 * Quem recebe `null` não cria a Pré-SM e diz o que falta (FR-012, FR-013).
 */
export function vinculoParaLogae(v: OwnershipType | null | undefined): VinculoLogae | null {
  if (v == null || v === "subcontracted") return null;
  return PARA_LOGAE[v] ?? null;
}

/**
 * O QUE O DONO SUGERE, quando sugere (2026-08-25).
 *
 * `getVeiculo` e `getCarreta` devolvem `CNPJProprietario` por placa. Medido em 40 placas que mais
 * rodaram: **32 donos distintos** — frota pulverizada, como se espera de agregados. E dois padrões
 * úteis apareceram:
 *
 *   O CNPJ da PRÓPRIA empresa aparece nos veículos que são nossos. É `owned` sem ninguém decidir.
 *
 *   Valores que começam com zeros são **CPF preenchido até 14 dígitos** — pessoa física. Nove dos
 *   32 eram assim. Pessoa física nunca é frota própria, então `owned` está descartado; o que sobra
 *   é `agregado` ou `terceiro`, e essa escolha é de quem atribui.
 *
 * ── POR QUE ISTO SUGERE E NÃO DECIDE ──────────────────────────────────────────────────────────
 *
 * A diferença entre agregado e terceiro é de RELAÇÃO, não de documento: quem roda fixo para nós
 * contra quem pegou uma viagem. Nenhum dado da gerenciadora responde isso. A primeira versão desta
 * fatia ia inventar uma régua ("a partir de N viagens vira agregado"); o usuário apontou que quem
 * atribui simplesmente sabe, e ele está certo — régua inventada erra em silêncio.
 *
 * O nosso CNPJ vem por parâmetro, não embutido: é dado de configuração, e código de domínio que
 * carrega o CNPJ da empresa é código que não serve para a próxima.
 */
export function vinculoSugerido(
  cnpjProprietario: string | null | undefined,
  cnpjDaEmpresa: string | null | undefined,
): VinculoEscolhivel | null {
  const dono = so_digitos(cnpjProprietario);
  if (!dono) return null;

  const nosso = so_digitos(cnpjDaEmpresa);
  // Compara pela RAIZ (os 8 primeiros dígitos): filiais têm a mesma raiz e ordens diferentes, e um
  // caminhão da filial continua sendo nosso.
  if (nosso && dono.slice(0, 8) === nosso.slice(0, 8)) return "owned";

  // CPF preenchido com zeros à esquerda até 14 dígitos: pessoa física. Nunca é frota própria — mas
  // entre agregado e terceiro, quem decide é a pessoa. Sem sugestão é melhor que sugestão errada.
  return null;
}

/**
 * Pessoa física? Serve para a tela DESCARTAR "frota própria" em vez de sugerir algo.
 *
 * Um dono de 14 dígitos começando em zeros é CPF: `00001932653546` é o CPF `019.326.535-46`. Foi
 * assim em 9 dos 32 donos medidos.
 */
export function donoEhPessoaFisica(cnpjProprietario: string | null | undefined): boolean {
  const d = so_digitos(cnpjProprietario);
  if (!d) return false;
  return d.length === 14 && d.startsWith("000");
}

function so_digitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}
