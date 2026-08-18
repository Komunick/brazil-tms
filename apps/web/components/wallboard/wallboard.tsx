"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { TripStatus } from "@brazil-tms/shared";
import type { WallboardSummary, WallboardTrip } from "@brazil-tms/db";
import { useWallboard } from "@/lib/trips/client";
import { useReconexao } from "@/lib/ui/reconexao";

/**
 * O painel da parede (2026-08-16).
 *
 * Escrito para uma TV ligada no meio da sala, e por isso quase nada aqui se parece com o resto do
 * app. Quem lê está a três metros e de passagem, ninguém clica, ninguém rola, e a tela fica ligada
 * o dia inteiro sem alguém para recarregá-la. As decisões que saem disso:
 *
 *  - FUNDO ESCURO. Uma parede branca de 55" a três metros ofusca a sala inteira, e o texto claro
 *    sobre escuro é o que se lê de longe. Também é o que evita marca de tela num painel que passa o
 *    dia mostrando as mesmas caixas.
 *  - NADA DE ROLAGEM. O que não cabe não existe — o servidor já corta e ordena, e o rodapé diz
 *    quantas ficaram de fora. Uma lista que rola numa TV é uma lista que ninguém lê até o fim.
 *  - O RELÓGIO É PARTE DO DADO. Um painel congelado continua bonito, e a sala decide em cima de um
 *    retrato velho sem saber. Então a hora do último dado fica na tela, e passa a avisar sozinha
 *    quando envelhece.
 *  - SEM INTERAÇÃO. Nenhum link, nenhum botão. Não há mouse nessa máquina.
 */

/** Depois de quanto tempo sem dado novo a tela para de fingir que está ao vivo. */
const PARADO_MS = 3 * 60 * 1000;

/** As quatro etapas que a sala acompanha. As demais existem no total, não no destaque. */
const ETAPAS_DESTAQUE: TripStatus[] = ["at_origin", "loading", "in_transit", "at_destination"];

function horaCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function diaEHora(d: Date): { dia: string; hora: string } {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(d);
  return {
    dia: fmt({ day: "2-digit", month: "2-digit" }),
    hora: fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

const estaAtrasada = (t: WallboardTrip): boolean =>
  t.slaStatus === "late" || t.slaStatus === "breached";

/** O relógio da parede, batendo de segundo em segundo — independente do ciclo dos dados. */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return agora;
}

function Numerao({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-[7vw] font-bold leading-none tabular-nums text-white">{valor}</span>
      <span className="mt-[0.6vh] text-[1.15vw] font-medium uppercase tracking-[0.14em] text-slate-400">
        {rotulo}
      </span>
    </div>
  );
}

function Linha({ trip, t }: { trip: WallboardTrip; t: ReturnType<typeof useTranslations> }) {
  const atrasada = estaAtrasada(trip);
  return (
    <tr
      className={
        atrasada ? "border-b border-red-900/50 bg-red-950/40" : "border-b border-slate-800/70"
      }
    >
      <td className="py-[1.05vh] pl-[1.2vw] pr-[0.8vw] text-[1.5vw] font-semibold tabular-nums text-white">
        {trip.externalTripId ?? "—"}
      </td>
      <td className="py-[1.05vh] pr-[0.8vw] text-[1.4vw] text-slate-300">
        {trip.originName ?? trip.originCode ?? "—"}
        <span className="mx-[0.5vw] text-slate-600">→</span>
        <span className="text-white">{trip.destinationName ?? trip.destinationCode ?? "—"}</span>
      </td>
      <td className="py-[1.05vh] pr-[0.8vw] text-[1.35vw] text-slate-400">
        {trip.driverLabel ?? "—"}
      </td>
      <td className="py-[1.05vh] pr-[0.8vw] text-[1.35vw] font-medium text-slate-300">
        {t(`status.${trip.currentStatus}` as Parameters<typeof t>[0])}
      </td>
      <td className="py-[1.05vh] pr-[1.2vw] text-right text-[1.5vw] font-bold tabular-nums">
        <span className={atrasada ? "text-red-400" : "text-slate-200"}>
          {horaCurta(trip.plannedDeliveryAt)}
        </span>
        {atrasada ? (
          <span className="ml-[0.7vw] rounded bg-red-500 px-[0.5vw] py-[0.2vh] text-[1vw] font-bold uppercase tracking-wider text-white">
            {t("late")}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

export function Wallboard() {
  const t = useTranslations("Wallboard");
  const tStatus = useTranslations("Trips");
  const { data, isError } = useWallboard();
  // A tela já sobrevivia à queda mostrando o último retrato; o que faltava era voltar com a versão
  // NOVA depois de um deploy, em vez de rodar o pacote antigo para sempre. Ver `useReconexao`.
  useReconexao(isError);
  const agora = useAgora();
  const { dia, hora } = diaEHora(agora);

  const board: WallboardSummary | undefined = data?.wallboard;
  // A tela nunca mente sobre a própria idade: sem dado novo há três minutos, o ponto verde vira
  // aviso. É o único jeito de a sala saber que está olhando um retrato velho.
  const idadeMs = board ? agora.getTime() - new Date(board.generatedAt).getTime() : Infinity;
  const parado = idadeMs > PARADO_MS;

  const destaque = ETAPAS_DESTAQUE.map((status) => ({
    status,
    count: board?.onTheRoad.find((e) => e.status === status)?.count ?? 0,
  }));
  const listadas = board?.trips.length ?? 0;
  const restantes = Math.max(0, (board?.tripsTotal ?? 0) - listadas);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-sans">
      {/* Cabeçalho: quem, quando, e se o que está na tela ainda vale. */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-[1.6vw] py-[1.6vh]">
        <h1 className="text-[1.7vw] font-bold uppercase tracking-[0.2em] text-white">
          {t("title")}
        </h1>
        <div className="flex items-center gap-[1.6vw]">
          <span className="text-[2.2vw] font-bold tabular-nums text-white">
            <span className="mr-[0.8vw] text-[1.5vw] font-medium text-slate-400">{dia}</span>
            {hora}
          </span>
          <span
            className={`flex items-center gap-[0.5vw] rounded-full px-[1vw] py-[0.5vh] text-[1.1vw] font-semibold uppercase tracking-wider ${
              parado || isError
                ? "bg-amber-500/20 text-amber-300"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            <span
              className={`inline-block h-[0.9vw] w-[0.9vw] rounded-full ${
                parado || isError ? "bg-amber-400" : "animate-pulse bg-emerald-400"
              }`}
            />
            {parado || isError ? t("stale") : t("live")}
          </span>
        </div>
      </header>

      {/* Os quatro números da operação. */}
      <section className="grid shrink-0 grid-cols-4 gap-[1vw] border-b border-slate-800 px-[1.6vw] py-[2.2vh]">
        {destaque.map(({ status, count }) => (
          <Numerao
            key={status}
            valor={count}
            rotulo={tStatus(`status.${status}` as Parameters<typeof tStatus>[0])}
          />
        ))}
      </section>

      {/* A lista: o que está rodando agora, mais urgente primeiro. */}
      <main className="min-h-0 flex-1 overflow-hidden px-[1.6vw] pt-[1.6vh]">
        <h2 className="mb-[0.8vh] text-[1.2vw] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {t("onTheRoad")}
        </h2>
        {board && board.trips.length === 0 ? (
          <p className="pt-[6vh] text-center text-[2vw] text-slate-600">{t("empty")}</p>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[36%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <tbody>
              {board?.trips.map((trip) => (
                <Linha key={trip.id} trip={trip} t={t} />
              ))}
            </tbody>
          </table>
        )}
        {restantes > 0 ? (
          <p className="pt-[1vh] text-center text-[1.2vw] text-slate-600">
            {t("more", { count: restantes })}
          </p>
        ) : null}
      </main>

      {/* O rodapé só carrega o que exige gente. */}
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-800 px-[1.6vw] py-[1.8vh]">
        <div className="flex items-center gap-[2.5vw]">
          <Rodape valor={board?.lateCount ?? 0} rotulo={t("lateTrips")} alerta />
          <Rodape valor={board?.unassignedCount ?? 0} rotulo={t("unassigned")} alerta />
        </div>
        <Rodape valor={board?.tripsTodayCount ?? 0} rotulo={t("today")} />
      </footer>
    </div>
  );
}

function Rodape({ valor, rotulo, alerta }: { valor: number; rotulo: string; alerta?: boolean }) {
  // Zero não é problema: um contador de pendência em zero fica cinza, para o vermelho da tela
  // significar sempre a mesma coisa.
  const acende = alerta && valor > 0;
  return (
    <span className="flex items-baseline gap-[0.7vw]">
      <span
        className={`text-[2.6vw] font-bold tabular-nums ${acende ? "text-red-400" : "text-slate-300"}`}
      >
        {valor}
      </span>
      <span
        className={`text-[1.15vw] font-medium uppercase tracking-[0.14em] ${
          acende ? "text-red-300/80" : "text-slate-500"
        }`}
      >
        {rotulo}
      </span>
    </span>
  );
}
