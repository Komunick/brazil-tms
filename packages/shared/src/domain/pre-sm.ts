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

// ---------------------------------------------------------------------------
// A decisão: criar, ou não criar e dizer por quê (FR-012, FR-013)
// ---------------------------------------------------------------------------

/**
 * POR QUE A PRÉ-SM NÃO PODE SER CRIADA.
 *
 * Cada motivo manda a pessoa para um lugar diferente, e é por isso que eles são separados em vez de
 * um "faltam dados" genérico:
 *
 *   `sem_cpf`               → cadastro do motorista (19% das viagens medidas)
 *   `sem_modelo`            → cadastro de modelos na gerenciadora, ou a tela de conferência (16%)
 *   `sem_vinculo_veiculo`   → o diálogo de atribuição, na próxima escala daquele veículo
 *   `sem_vinculo_motorista` → idem, para o motorista
 *   `sem_janela_coleta`     → o plano da viagem
 */
/**
 * `"2015-07-17 16:00"` — o formato do exemplo da própria Integra 14.2.
 *
 * Sem `T`, sem segundos, sem fuso. E a conversão é para o horário de **São Paulo**, não UTC: a
 * gerenciadora agenda escolta em hora local, e mandar UTC deslocaria toda coleta em três horas —
 * um erro que passaria despercebido no teste e apareceria na estrada.
 */
export function paraDataHoraDaIntegra(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  // `sv-SE` já entrega `YYYY-MM-DD HH:mm` — é o formato ISO-ish sueco, e usá-lo evita montar a
  // string à mão a partir de partes, que é onde o fuso costuma se perder.
  return p.replace(",", "");
}

// ---------------------------------------------------------------------------
// A divergência: a atribuição mudou depois da Pré-SM criada (FR-018)
// ---------------------------------------------------------------------------

/**
 * O QUE MUDOU desde que a Pré-SM foi criada.
 *
 * ── POR QUE ISTO É UM AVISO E NÃO UMA CORREÇÃO ────────────────────────────────────────────────
 *
 * Trocar motorista depois de escalar é rotina — passou mal, o veículo quebrou. A Pré-SM, porém, já
 * está na gerenciadora com o nome antigo: a escolta espera uma pessoa e vai encontrar outra.
 *
 * Alterar a Pré-SM existente ficou FORA desta fatia (spec, Out of Scope), então o que se pode fazer
 * é dizer. Um aviso que a pessoa vê é melhor que uma divergência que ninguém nota — e é honesto
 * sobre o que o sistema faz e o que ainda não faz.
 *
 * ── COMPARA PLACA E CPF, NÃO O OBJETO INTEIRO ─────────────────────────────────────────────────
 *
 * O corpo enviado tem campos que mudam sozinhos (horário reescrito pelo portal, por exemplo) e que
 * não interessam a quem faz escolta. Só duas coisas mudam quem vai estar no caminhão: **quem
 * dirige** e **qual veículo**. Comparar o objeto todo produziria avisos que ninguém sabe o que
 * fazer com — e um aviso desses ensina a ignorar todos.
 */
export type Divergencia = "motorista" | "placas";

export function divergenciasDaPreSm(
  enviado: Record<string, unknown> | null | undefined,
  atual: { cpfMotorista?: string | null; placas?: readonly string[] } | null | undefined,
): Divergencia[] {
  if (!enviado || !atual) return [];
  const saida: Divergencia[] = [];

  const cpfEnviado = apenasDigitos(enviado.CPFMotorista1);
  const cpfAtual = apenasDigitos(atual.cpfMotorista);
  // Só acusa quando os DOIS lados têm o dado. Sem o de agora, não se sabe se mudou — e "não sei"
  // não é "mudou".
  if (cpfEnviado && cpfAtual && cpfEnviado !== cpfAtual) saida.push("motorista");

  const placasEnviadas = [enviado.PlacaVeiculo, enviado.PlacaCarreta1, enviado.PlacaCarreta2]
    .map(normalizar)
    .filter(Boolean);
  const placasAtuais = (atual.placas ?? []).map(normalizar).filter(Boolean);

  // Ordenadas antes de comparar: trocar cavalo e carreta de campo no formulário não muda quem está
  // na estrada, e acusar isso seria um aviso sobre nada.
  if (
    placasEnviadas.length > 0 &&
    placasAtuais.length > 0 &&
    [...placasEnviadas].sort().join(",") !== [...placasAtuais].sort().join(",")
  ) {
    saida.push("placas");
  }

  return saida;
}

function apenasDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function normalizar(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
