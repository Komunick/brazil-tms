"use client";

import { useQuery } from "@tanstack/react-query";
import type { FleetPositionView, FleetSummary } from "@brazil-tms/db";

export interface FleetResponse {
  summary: FleetSummary;
  items: FleetPositionView[];
}

/**
 * 60 s, e não os 30 do quadro (2026-08-20).
 *
 * O robô do rastreador entrega a cada cinco minutos: consultar mais rápido que a fonte só produz a
 * mesma resposta várias vezes. Sessenta segundos é o suficiente para a tela nunca estar mais de um
 * minuto atrás do que o TMS sabe.
 */
const INTERVALO_MS = 60_000;

/**
 * UMA consulta serve as DUAS telas — o quadro resumido da Torre e a página inteira.
 *
 * A resposta traz resumo e lista juntos, e o TanStack Query compartilha o cache pela chave. Assim o
 * número do quadro e as linhas da página vêm sempre do mesmo retrato: se divergissem, quem clica no
 * quadro cairia numa lista que contradiz o número que o trouxe até ali.
 */
export function useFleet() {
  return useQuery({
    queryKey: ["fleet-positions"],
    queryFn: async (): Promise<FleetResponse> => {
      const r = await fetch("/api/fleet");
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as FleetResponse;
    },
    refetchInterval: INTERVALO_MS,
    refetchIntervalInBackground: true,
  });
}
