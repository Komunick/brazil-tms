/**
 * Os alertas de uma viagem, contados como UM problema (2026-08-16).
 *
 * A superfície de alertas era plana e contava alertas. Medido na operação real: 307 alertas em 123
 * viagens — 75 delas com TRÊS. E os três dizem a mesma coisa: não foi atribuída, não chegou na
 * origem, não chegou no destino, porque o caminhão não saiu. Um problema, contado três vezes.
 *
 * Ninguém trata isso como três pendências. A tela parava de ajudar exatamente no dia cheio, que é
 * quando ela mais importa.
 *
 * Vive aqui, e não dentro do componente, para poder ser testado: o agrupamento é a parte que decide
 * o que a pessoa vê, e é onde um erro passaria despercebido.
 */

/** O mínimo que o agrupamento precisa saber — o DTO completo tem mais, e não interessa aqui. */
export interface AlertLike {
  id: string;
  tripId: string;
  externalTripId: string | null;
  customerName: string | null;
  createdAt: string;
  state: string;
}

export interface TripGroup<T extends AlertLike> {
  tripId: string;
  externalTripId: string | null;
  customerName: string | null;
  /** Quando esta viagem começou a pedir atenção — o mais antigo dos seus alertas. */
  firstAt: string;
  items: T[];
  activeItems: T[];
  acknowledgedItems: T[];
}

/**
 * Agrupa por viagem preservando a ordem em que as viagens aparecem na resposta (mais recentes
 * primeiro), e dentro de cada uma a ordem dos próprios alertas. Viagem com algo ainda em aberto vem
 * antes das inteiramente reconhecidas: a lista de trabalho não pode ser empurrada para baixo por
 * linhas que, por definição, já foram tratadas.
 */
export function groupAlertsByTrip<T extends AlertLike>(items: T[]): TripGroup<T>[] {
  const byTrip = new Map<string, TripGroup<T>>();

  for (const a of items) {
    const existing = byTrip.get(a.tripId);
    if (existing) {
      existing.items.push(a);
      if (a.createdAt < existing.firstAt) existing.firstAt = a.createdAt;
      // O nome externo e o cliente chegam repetidos em cada alerta da mesma viagem; o primeiro que
      // vier preenchido vale, para uma linha nunca ficar sem identificação por causa da ordem.
      existing.externalTripId ??= a.externalTripId;
      existing.customerName ??= a.customerName;
      continue;
    }
    byTrip.set(a.tripId, {
      tripId: a.tripId,
      externalTripId: a.externalTripId,
      customerName: a.customerName,
      firstAt: a.createdAt,
      items: [a],
      activeItems: [],
      acknowledgedItems: [],
    });
  }

  const groups = [...byTrip.values()];
  for (const g of groups) {
    g.activeItems = g.items.filter((a) => a.state === "active");
    g.acknowledgedItems = g.items.filter((a) => a.state === "acknowledged");
  }

  return groups.sort(
    (a, b) => Number(a.activeItems.length === 0) - Number(b.activeItems.length === 0),
  );
}

/**
 * Uma página da lista, com a página pedida presa no que existe.
 *
 * A lista encolhe SOZINHA embaixo do pé de quem lê: os avisos se resolvem quando o caminhão chega, e
 * o quadro repolla a cada 30 segundos. Quem estava na página 5 pode acordar num mundo de 3 — e uma
 * fatia fora do fim devolveria vazio, que na tela é indistinguível de "não há avisos". Por isso a
 * página pedida é presa, e não confiada.
 */
export function paginate<T>(items: T[], pagina: number, porPagina: number): {
  visiveis: T[];
  paginaAtual: number;
  totalPaginas: number;
} {
  const totalPaginas = Math.max(1, Math.ceil(items.length / porPagina));
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  return { visiveis: items.slice(inicio, inicio + porPagina), paginaAtual, totalPaginas };
}
