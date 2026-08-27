"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import type { ServerStatus } from "@brazil-tms/db";
import { portalStatusAgrees, type TripStatus } from "@brazil-tms/shared";
import {
  idadeEmTexto,
  saudeDaFonte,
  saudeDaTarefa,
  type Saude,
  saudeDoCiclo,
} from "@/lib/status/saude";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { TesteDoTelegram } from "@/components/status/teste-do-telegram";
import { AvisosDoSistema } from "@/components/spot/avisos-do-sistema";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A tela de status (2026-08-19).
 *
 * Ela existe por uma falha medida: em 2026-08-18 o robô do portal ficou seis horas sem entregar nada
 * e nada denunciava — navegador aberto, site no ar, painel desenhando números com a cor certa. O
 * único sinal era um 401 num console dentro de uma VM.
 *
 * Duas decisões de desenho, ambas por causa disso:
 *
 *   A IDADE É CONTADA CONTRA O RELÓGIO DO SERVIDOR, que vem no corpo da resposta. Contra o relógio do
 *   navegador, uma máquina com a hora errada — e a TV da sala já esteve — transformaria "chegou
 *   agora" em "atrasado há três horas", ou pior, o contrário.
 *
 *   ATRASO NÃO É ERRO DE PÁGINA. Um robô parado não derruba o TMS; ele só para de trazer novidade. A
 *   tela diz isso com todas as letras em vez de mostrar um "X" que faz pensar que o sistema caiu.
 */

/** 30 s: metade da régua mais curta que existe aqui não faria diferença, e a página é leve. */
const INTERVALO_MS = 30_000;

function useStatus() {
  return useQuery({
    queryKey: ["server-status"],
    queryFn: async (): Promise<ServerStatus> => {
      const r = await fetch("/api/status");
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as ServerStatus;
    },
    refetchInterval: INTERVALO_MS,
    // Igual ao painel da TV: sem foco de janela, a atualização não pode parar.
    refetchIntervalInBackground: true,
  });
}

const CORES: Record<Saude, string> = {
  ok: "border-success/40 bg-success/10 text-success",
  atrasado: "border-destructive/40 bg-destructive/10 text-destructive",
  sem_dado: "border-destructive/40 bg-destructive/10 text-destructive",
  sem_regua: "border-border bg-muted text-muted-foreground",
};

function Selo({ saude, texto }: { saude: Saude; texto: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${CORES[saude]}`}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {texto}
    </span>
  );
}

/**
 * Milissegundos em segundos com uma casa. Traço quando o robô não mandou — e traço é honesto: ele
 * diz que a pergunta foi feita e a resposta ainda não veio, o que é diferente de zero.
 */
function segundos(ms: number | null): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

export function ServerStatusClient() {
  const t = useTranslations("ServerStatus");
  // O cartão de avisos da área de trabalho fala a língua do spot, não a do status.
  const tSpot = useTranslations("Spot");
  const { data, isLoading, isError } = useStatus();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-20 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-6">
          <p role="alert" className="text-sm text-destructive">
            {t("loadError")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const agora = new Date(data.agora);
  const fontes = data.fontes.map((f) => ({ ...f, ...saudeDaFonte(f.chave, f.ultimo, agora) }));
  const tarefas = data.tarefas.map((j) => ({ ...j, ...saudeDaTarefa(j.ultimo, agora) }));
  /**
   * O CICLO de cada robô: o que ele promete contra o que entrega (2026-08-21).
   *
   * Robô lento entra no MESMO aviso do topo que as fontes atrasadas. São o mesmo problema visto em
   * dois momentos — um antes de o dado parar, outro depois — e separá-los em dois avisos faria a
   * pessoa aprender a olhar só um deles.
   */
  const ciclos = (data.ciclos ?? []).map((c) => ({
    ...c,
    ...saudeDoCiclo(c.intervalMs, c.durationMs),
  }));
  const algoAtrasado =
    [...fontes, ...tarefas].some((x) => x.saude !== "ok" && x.saude !== "sem_regua") ||
    ciclos.some((c) => c.saude === "lento");
  // A regra do que combina mora no shared, testada sem banco. Aqui só se filtra o que ela reprovou.
  const divergentes = data.paresDoPortal.filter(
    (p) => !portalStatusAgrees(p.portal, p.tms as TripStatus),
  );

  /**
   * O nome da fila vira chave de tradução — e o PONTO tem que sair antes.
   *
   * `sla.sweep` como chave faria o next-intl procurar `job` → `sla` → `sweep`, porque ponto é o
   * separador de aninhamento dele. O repositório tem um teste que proíbe chave com ponto exatamente
   * por isso, e foi ele que pegou este erro. Então `sla.sweep` → `slaSweep`.
   *
   * Uma fila nova no worker não pode derrubar a página só por não ter tradução: cai no próprio nome
   * técnico, que é feio e honesto. `t.has` existe para isto e não lança.
   */
  const rotulo = (nome: string, dicionario: "source" | "sourceHint" | "job"): string => {
    const chave = nome.replace(/\.(\w)/g, (_, c: string) => c.toUpperCase());
    return t.has(`${dicionario}.${chave}`) ? t(`${dicionario}.${chave}`) : nome;
  };

  return (
    <div className="space-y-4">
      {algoAtrasado ? (
        <div
          role="status"
          className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {t("lateExplainer")}
        </div>
      ) : null}

      <Card className="p-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide">
          {t("sourcesTitle")}
        </CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("sourcesHint")}</p>
        <ul className="mt-2">
          {fontes.map((f) => (
            <li
              key={f.chave}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-b-0"
            >
              <div className="min-w-[16rem] flex-1">
                <p className="text-sm font-medium">{rotulo(f.chave, "source")}</p>
                <p className="text-xs text-muted-foreground">{rotulo(f.chave, "sourceHint")}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {idadeEmTexto(f.minutos)
                    ? t("age", { age: idadeEmTexto(f.minutos)! })
                    : t("never")}
                </span>
                <Selo saude={f.saude} texto={t(`health.${f.saude}`)} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/**
       * O RITMO DOS ROBÔS — o aviso que chega ANTES do dado parar.
       *
       * As fontes acima respondem "ainda chega?". Isto responde "chega no ritmo?". Quando a VM
       * começa a sufocar, o ciclo estica muito antes de falhar: configurado 10s, levando 45s. O dado
       * ainda aparece, só que velho — e o carimbo fresco lá em cima diria que está tudo bem.
       *
       * Só aparece quando algum robô já mandou o pulso. Robô antigo, que ainda não foi atualizado,
       * simplesmente não figura — em vez de figurar como "sem dado" e parecer defeito.
       */}
      {ciclos.length > 0 ? (
        <Card className="p-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide">
            {t("cyclesTitle")}
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("cyclesHint")}</p>
          <ul className="mt-2">
            {ciclos.map((c) => (
              <li
                key={c.robot}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-b-0"
              >
                <p className="min-w-[16rem] flex-1 text-sm font-medium">{c.robot}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("cyclePace", {
                      configurado: segundos(c.intervalMs),
                      real: segundos(c.durationMs),
                    })}
                  </span>
                  <Selo
                    saude={c.saude === "lento" ? "atrasado" : c.saude === "ok" ? "ok" : "sem_regua"}
                    texto={t(`cycleHealth.${c.saude}`)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* A COERÊNCIA COM O PORTAL. Duas perguntas diferentes, e as ações que elas pedem também:
          divergência de status quer dizer que um marco não chegou; atribuição pendente quer dizer
          que falta cadastro ou que há um conflito para alguém decidir. */}
      <Card className="p-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide">
          {t("coherenceTitle")}
        </CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("coherenceHint")}</p>
        <ul className="mt-2">
          <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2.5">
            <div className="min-w-[16rem] flex-1">
              <p className="text-sm font-medium">{t("divergences")}</p>
              {divergentes.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {divergentes.map((d) => `${d.portal} → ${d.tms} (${d.total})`).join(" · ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("divergencesNone")}</p>
              )}
            </div>
            <Selo
              saude={divergentes.length > 0 ? "atrasado" : "ok"}
              texto={String(divergentes.reduce((s, d) => s + d.total, 0))}
            />
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-[16rem] flex-1">
              <p className="text-sm font-medium">{t("pendingAssignments")}</p>
              <p className="text-xs text-muted-foreground">{t("pendingAssignmentsHint")}</p>
            </div>
            <Selo
              saude={data.atribuicoesPendentes > 0 ? "atrasado" : "ok"}
              texto={String(data.atribuicoesPendentes)}
            />
          </li>
        </ul>
      </Card>

      <Card className="p-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide">
          {t("jobsTitle")}
        </CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("jobsHint")}</p>
        {tarefas.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("noJobs")}</p>
        ) : (
          <ul className="mt-2">
            {tarefas.map((j) => (
              <li
                key={j.nome}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2.5 last:border-b-0"
              >
                <div className="min-w-[16rem] flex-1">
                  <p className="text-sm font-medium">{rotulo(j.nome, "job")}</p>
                  <p className="text-xs text-muted-foreground">{j.nome}</p>
                  {j.falhas > 0 ? (
                    <p className="text-xs font-medium text-destructive">
                      {t("failures", { count: j.falhas })}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {idadeEmTexto(j.minutos)
                      ? t("age", { age: idadeEmTexto(j.minutos)! })
                      : t("never")}
                  </span>
                  <Selo saude={j.saude} texto={t(`health.${j.saude}`)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* O teste do aviso fica junto das fontes e do ritmo: são as três perguntas do mesmo tipo,
          "isto ainda está funcionando?", e quem desconfia de uma desconfia das outras. */}
      <TesteDoTelegram />

      {/**
       * O OUTRO CAMINHO DO MESMO AVISO (2026-08-27).
       *
       * A oferta de spot avisa por dois caminhos: o Telegram, no celular de quem não está na tela, e
       * a notificação da área de trabalho, para quem está com o TMS numa aba de fundo. Testar um e
       * não o outro responde metade da pergunta.
       *
       * Estes botões moravam no cartão de ofertas do painel, que foi dobrado para dentro do card da
       * frente. Aqui eles ficam uma vez só, e ao lado da pergunta que os motiva.
       */}
      <Card className="p-4">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide">
          {tSpot("systemHeading")}
        </CardTitle>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{tSpot("systemHint")}</p>
        <AvisosDoSistema />
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("measuredAt", {
          time: agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        })}
      </p>
    </div>
  );
}
