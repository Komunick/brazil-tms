/**
 * QUAIS indicadores do BSC vão para a tela, em que ordem, e com que cor (2026-08-18).
 *
 * Mora fora do componente por um motivo: a primeira versão desta regra era uma lista de seis nomes
 * usada como FILTRO, e o resultado foi o painel mostrar seis indicadores enquanto o banco guardava
 * vinte — sem nada na tela dizendo que faltava algo. Como função pura, a regra fica sob teste.
 */

export type Faixa = "acima" | "atencao" | "abaixo" | "sem_premissa";

export interface Premissa {
  /** Abaixo disto é vermelho no BSC do cliente. */
  minimo: number;
  /** A partir daqui é verde. Entre o mínimo e ele, amarelo. */
  target: number;
  /** Quanto o indicador vale na nota final. Nem todos pesam igual: CMK vale 15, Perfil vale 1,5. */
  peso: number;
  pilar: "PLANNING" | "FIELD" | "MONITORING" | "SAFETY" | "GENERAL";
}

/**
 * Os pisos que a Shopee publica na página "Premissas" do próprio relatório, lidos de lá em
 * 2026-08-18 (a tabela fecha em "1 - 20 / 20", então são todos).
 *
 * Ficam aqui, e não no banco, porque são a REGRA DO CLIENTE e mudam junto com a versão do scorecard
 * (o relatório já se chama "V3"). Guardá-los numa tabela criaria a ilusão de que a operação os
 * controla. Indicador sem premissa conhecida aparece com o número e SEM cor — nunca com alvo
 * inventado, que é o jeito mais fácil de um painel mentir com confiança.
 *
 * A ORDEM É A DO PRÓPRIO BSC, pilar a pilar, quatro por pilar — a mesma sequência dos cartões lá.
 * É deliberado: quem confere os dois lado a lado lê na mesma sequência, e não precisa procurar.
 * A versão anterior punha "os que doem primeiro" na frente, o que fazia sentido quando só seis
 * tinham piso; agora que todos têm, espelhar o cliente vale mais.
 */
export const PREMISSAS: Record<string, Premissa> = {
  // PLANNING
  Scheduling: { minimo: 98, target: 100, peso: 7, pilar: "PLANNING" },
  Tendência: { minimo: 93, target: 95, peso: 8, pilar: "PLANNING" },
  SPOT: { minimo: 77, target: 80, peso: 8.5, pilar: "PLANNING" },
  "Aderência de Perfil": { minimo: 97, target: 99, peso: 1.5, pilar: "PLANNING" },
  // FIELD
  "ETA Origem": { minimo: 97, target: 99, peso: 8.5, pilar: "FIELD" },
  "Performance CPT": { minimo: 97, target: 99, peso: 4.75, pilar: "FIELD" },
  "No Show": { minimo: 97, target: 99, peso: 10.25, pilar: "FIELD" },
  "Plano de Ação": { minimo: 93, target: 95, peso: 1.5, pilar: "FIELD" },
  // MONITORING
  "ETA Destino": { minimo: 93, target: 95, peso: 11, pilar: "MONITORING" },
  Telemetria: { minimo: 97, target: 99, peso: 8.25, pilar: "MONITORING" },
  "Utilização do APP": { minimo: 97, target: 99, peso: 1.25, pilar: "MONITORING" },
  "Report de Ocorrências": { minimo: 93, target: 95, peso: 4.5, pilar: "MONITORING" },
  // SAFETY
  CMK: { minimo: 97, target: 99, peso: 15, pilar: "SAFETY" },
  Training: { minimo: 96, target: 98, peso: 5, pilar: "SAFETY" },
  "Atendimento Check List": { minimo: 96, target: 98, peso: 5, pilar: "SAFETY" },
  // Piso e meta 0,00% — o indicador é publicado como conformidade (100% = nenhum acidente fatal),
  // então a regra normal ("a partir da meta é verde") já o pinta certo. Sem exceção no código.
  "Acidente Fatal": { minimo: 0, target: 0, peso: 0, pilar: "SAFETY" },
  // GENERAL
  "Sinistralidade (pct)": { minimo: 97.9, target: 99.9, peso: 13.5, pilar: "GENERAL" },
  "Bloqueio Driver": { minimo: 97, target: 99, peso: 3.5, pilar: "GENERAL" },
  "Ocorrência - Quebra": { minimo: 97.5, target: 99.5, peso: 4, pilar: "GENERAL" },
  Reversa: { minimo: 97.5, target: 99.5, peso: 4, pilar: "GENERAL" },
};

/** A ordem sai das próprias premissas: uma lista só, impossível de divergir da outra. */
export const ORDEM_BSC = Object.keys(PREMISSAS);

/**
 * As três faixas do BSC, na regra do próprio relatório: a partir da meta é verde, do mínimo até a
 * meta é amarelo, abaixo do mínimo é vermelho.
 *
 * Conferido cartão a cartão contra a tela do cliente (18/08): Scheduling 102,27 verde, Tendência
 * 94,23 amarelo, ETA Destino 83,61 vermelho, Training 98,88 verde, Ocorrência-Quebra 98,68 amarelo.
 * Dezenove dos vinte batem. O vigésimo é o SPOT — o relatório o pinta de VERMELHO com 91,43%, e a
 * premissa publicada diz mínimo 77 / meta 80, que daria verde. Aqui vale a premissa publicada, que é
 * o número contratual; a divergência está anotada para o cliente confirmar qual dos dois envelheceu.
 */
export function faixaDo(valor: number, premissa: Premissa | undefined): Faixa {
  if (!premissa) return "sem_premissa";
  if (valor >= premissa.target) return "acima";
  return valor >= premissa.minimo ? "atencao" : "abaixo";
}

/**
 * Os desta leitura, na ordem acima, seguidos do que o BSC passou a publicar e a ordem não conhece.
 *
 * A lista NÃO é um filtro — é só uma ordenação com uma preferência. A Shopee revisa o scorecard
 * quando quer, e um rótulo novo caindo fora da tela seria o mesmo defeito de novo, desta vez mais
 * difícil de perceber: ninguém procura o que não sabe que existe.
 */
export function indicadoresNaTela(indicators: Record<string, number>): string[] {
  const conhecidos = ORDEM_BSC.filter((nome) => indicators[nome] != null);
  const novos = Object.keys(indicators).filter((nome) => !(nome in PREMISSAS));
  return [...conhecidos, ...novos];
}
