/**
 * QUAIS indicadores do BSC vão para a tela, e em que ordem (2026-08-18).
 *
 * Mora fora do componente por um motivo: a versão anterior desta regra era uma lista de seis nomes
 * usada como FILTRO, e o resultado foi o painel mostrar seis indicadores enquanto o banco guardava
 * vinte — sem nada na tela dizendo que faltava algo. Como função pura, a regra fica sob teste.
 */

/**
 * A ordem é deliberada e fixa. Primeiro os seis com piso publicado pela Shopee, que são onde o
 * contrato dói; depois os outros catorze na ordem em que o relatório os desenha.
 *
 * Não é ordenado por gravidade de propósito: numa TV ligada o dia inteiro, cartão que troca de lugar
 * sozinho obriga a pessoa a reler tudo a cada olhada.
 */
export const ORDEM_BSC = [
  "SPOT",
  "ETA Origem",
  "ETA Destino",
  "Telemetria",
  "No Show",
  "Reversa",
  "Scheduling",
  "Tendência",
  "Aderência de Perfil",
  "Performance CPT",
  "Plano de Ação",
  "Utilização do APP",
  "Report de Ocorrências",
  "CMK",
  "Training",
  "Atendimento Check List",
  "Acidente Fatal",
  "Sinistralidade (pct)",
  "Bloqueio Driver",
  "Ocorrência - Quebra",
];

/**
 * Os desta leitura, na ordem acima, seguidos do que o BSC passou a publicar e a ordem não conhece.
 *
 * A lista NÃO é um filtro — é só uma ordenação com uma preferência. A Shopee revisa o scorecard
 * quando quer (o relatório já se chama "V3"), e indicador novo sumindo calado da tela seria
 * exatamente o defeito que esta função existe para não repetir.
 */
export function indicadoresNaTela(indicators: Record<string, number>): string[] {
  const conhecidos = ORDEM_BSC.filter((nome) => indicators[nome] != null);
  const novos = Object.keys(indicators).filter((nome) => !ORDEM_BSC.includes(nome));
  return [...conhecidos, ...novos];
}
