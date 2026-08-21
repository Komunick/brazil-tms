import { TRIP_STATUSES, type TripStatus } from "@brazil-tms/shared";
import type { TripDetailView } from "@/lib/trips/trips-read";

type Evento = TripDetailView["events"][number];

/**
 * A LINHA DO TEMPO DA VIAGEM, arrumada (2026-08-21, a pedido: "está embaralhada").
 *
 * Olhando uma viagem real, o embaralhamento eram três coisas somadas:
 *
 * ── 1. CADA MARCO APARECIA DUAS VEZES ──────────────────────────────────────────────────────────
 *
 * O TMS grava dois eventos para o mesmo fato: o MARCO (`unloaded`, `departed`, `origin_arrived`) e a
 * MUDANÇA DE STATUS que ele provocou (`status_change` → `unloaded`). Mesmo instante, mesma verdade,
 * duas linhas. Numa viagem completa isso dobra a lista, e o que a pessoa lê é uma sequência que
 * parece repetir sem motivo.
 *
 * Os dois se completam em vez de se repetir: o marco tem o NOME do que aconteceu, a mudança tem a
 * TRANSIÇÃO (de onde para onde). Juntar os dois numa linha não perde nada — mostra mais.
 *
 * ── 2. EMPATES SAÍAM EM ORDEM ALEATÓRIA ────────────────────────────────────────────────────────
 *
 * Marco e mudança carimbam o mesmo instante, então a comparação por hora devolve empate e a ordem
 * final vinha do banco — às vezes o marco primeiro, às vezes a mudança. Em viagens com carregamento
 * e descarga no mesmo minuto, blocos inteiros trocavam de lugar entre uma atualização e outra.
 *
 * O desempate é a ORDEM DO CICLO DE VIDA: entre duas coisas do mesmo instante, a etapa mais avançada
 * vem primeiro (a lista é do mais recente para o mais antigo). É a única ordem que não muda.
 *
 * ── 3. O QUE NÃO TEM HORA REAL ─────────────────────────────────────────────────────────────────
 *
 * `confirmed` e as etapas de faturamento não vêm do portal e não têm `eventTimestamp`; elas caem pela
 * hora em que o TMS gravou. Isso FICA como está, e é deliberado: é a única hora que existe para elas,
 * e inventar uma posição pelo ciclo de vida seria afirmar um horário que ninguém registrou.
 */
export interface LinhaDoTempo {
  id: string;
  /** O instante que a linha mostra: a hora real quando existe, a de gravação quando não. */
  instante: string;
  /** O nome do que aconteceu — do marco quando há um, senão da mudança de status. */
  eventType: string;
  statusBefore: string | null;
  statusAfter: string | null;
  /** A hora real, quando o cliente a registrou. Nula em etapa que só existe aqui dentro. */
  eventTimestamp: string | null;
  notes: string | null;
}

/** Posição da etapa no ciclo de vida. Desconhecida vai para o fim, nunca some. */
function posicao(status: string | null): number {
  if (!status) return -1;
  const i = (TRIP_STATUSES as readonly string[]).indexOf(status);
  return i === -1 ? -1 : i;
}

/**
 * A chave que identifica "o mesmo fato": instante + status resultante.
 *
 * NÃO usa só o instante: duas coisas diferentes podem cair no mesmo segundo (o portal carimba
 * carregamento e partida juntos quando o caminhão sai logo depois de carregar), e juntá-las
 * esconderia uma delas.
 */
function chave(e: Evento): string {
  return `${e.eventTimestamp ?? e.createdAt}|${e.statusAfter ?? ""}`;
}

export function montarLinhaDoTempo(eventos: readonly Evento[]): LinhaDoTempo[] {
  const grupos = new Map<string, Evento[]>();
  for (const e of eventos) {
    const k = chave(e);
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }

  const linhas: LinhaDoTempo[] = [...grupos.values()].map((grupo) => {
    // O marco nomeia; a mudança de status descreve a transição. Quando há os dois, cada um contribui
    // com o que sabe. Nota vem de quem tiver — só uma das duas costuma trazer.
    const marco = grupo.find((e) => e.eventType !== "status_change") ?? grupo[0]!;
    const mudanca = grupo.find((e) => e.eventType === "status_change") ?? grupo[0]!;
    return {
      id: marco.id,
      instante: marco.eventTimestamp ?? marco.createdAt,
      eventType: marco.eventType,
      statusBefore: mudanca.statusBefore,
      statusAfter: mudanca.statusAfter ?? marco.statusAfter,
      eventTimestamp: marco.eventTimestamp,
      notes: grupo.map((e) => e.notes).find((n) => n != null && n !== "") ?? null,
    };
  });

  return linhas.sort((a, b) => {
    const porHora = b.instante.localeCompare(a.instante);
    if (porHora !== 0) return porHora;
    return posicao(b.statusAfter) - posicao(a.statusAfter);
  });
}

export type { TripStatus };
