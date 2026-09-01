"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Gavel, Loader2, TriangleAlert } from "lucide-react";
import type { SpotOfferView } from "@brazil-tms/db";

/**
 * UM CARTÃO DE OFERTA DE SPOT (2026-09-01, fatia 030).
 *
 * Ele saiu de dentro de `oferta-de-spot.tsx` quando o cartão parou de ser um por vez: com vários na
 * tela ao mesmo tempo, cada um precisa do próprio estado de confirmação, e um componente com a fila
 * inteira dentro não tem onde guardar isso sem confundir os cartões entre si.
 *
 * ── AS CORES SÃO AS DA MARCA, e continuam onde estavam ────────────────────────────────────────
 *
 * Fundo azul-marinho, amarelo no que é curto e grande, verde na moldura. A distribuição foi decidida
 * em 2026-08-19 e o porquê está em `oferta-de-spot.tsx` — resumidamente: as três cores do logo juntas
 * erram fácil, e o marinho é o único dos três escuro o bastante para servir de base.
 *
 * O que MUDOU nesta fatia não foi a cor: foi o cartão parar de sair sozinho e passar a ter botões.
 */

const MARCA = {
  fundo: "#0C1A2B",
  fundoTopo: "#12283F",
  verde: "#1B7A3D",
  verdeClaro: "#23A052",
  amarelo: "#F2C230",
  texto: "#EEF3F8",
  rotulo: "#93A9BF",
};

/**
 * A TRADUÇÃO DE UM CÓDIGO SÓ, e a regra que impede o catálogo de envelhecer (2026-09-01).
 *
 * Medido em produção: as 4 recusas de aceite que existem são TODAS `131205003`. Ele responde por
 * 100% dos casos vistos, e é o que significa "essa LH não está mais esperando decisão" — ou porque
 * alguém já a pegou (a corrida do leilão), ou porque ela já era nossa e a tentativa foi repetida.
 *
 * CÓDIGO DESCONHECIDO MOSTRA O TEXTO CRU DO PORTAL, nunca "erro desconhecido". É essa regra que
 * mantém o mapa honesto: ele explica o que já entendemos e sai da frente do que ainda não. Um
 * fallback genérico apagaria a única pista do caso novo, e mandaria a pessoa abrir o portal para
 * descobrir — que é exatamente o passo que esta fatia existe para eliminar.
 */
const EXPLICACAO_DO_PORTAL: Record<string, string> = {
  "131205003": "A viagem não está mais esperando decisão — ela pode já ter sido aceita.",
};

function explicar(erro: string | null): { frase: string | null; cru: string } | null {
  if (!erro) return null;
  const codigo = /(\d{6,})/.exec(erro)?.[1] ?? "";
  return { frase: EXPLICACAO_DO_PORTAL[codigo] ?? null, cru: erro };
}

export interface CartaoDaOfertaProps {
  oferta: SpotOfferView;
  /** Só quem pode aceitar viagem no portal vê o botão. Falso ⇒ o cartão é só informação. */
  podeDecidir: boolean;
  /** Está enviando a ordem AGORA (entre o clique e a resposta). Trava o botão. */
  enviando: boolean;
  onAceitar: () => void;
  onIgnorar: () => void;
  /** Compacto quando há vários na tela: mesma informação, menos respiro. */
  compacto: boolean;
}

export function CartaoDaOferta({
  oferta,
  podeDecidir,
  enviando,
  onAceitar,
  onIgnorar,
  compacto,
}: CartaoDaOfertaProps) {
  const t = useTranslations("Spot");

  /**
   * A CONFIRMAÇÃO VIVE NO CARTÃO, e é por isso que ela é estado local (2026-09-01).
   *
   * Ela existe porque o aceite não tem volta: o primeiro clique só ABRE a pergunta, com o número da
   * LH escrito, e o segundo é que manda. Um clique só não pode bastar num botão que aparece sozinho
   * no meio da tela de quem está fazendo outra coisa.
   *
   * Local, e não no componente de cima: com vários cartões, um estado compartilhado faria confirmar
   * um e ver a pergunta aparecer em todos.
   */
  const [confirmando, setConfirmando] = useState(false);

  const erro = explicar(oferta.erroDoPortal);
  const corpo = compacto ? "px-5 py-4 gap-2.5" : "px-8 py-7 gap-4";

  return (
    <div
      style={{
        background: `linear-gradient(160deg, ${MARCA.fundoTopo} 0%, ${MARCA.fundo} 55%)`,
        outline: `4px solid ${MARCA.verde}`,
        color: MARCA.texto,
      }}
      className="pointer-events-auto flex w-full flex-col overflow-hidden rounded-[20px] shadow-[0_26px_56px_-22px_rgba(0,0,0,0.85)]"
      data-oferta={oferta.id}
      data-estado={oferta.estado}
    >
      {/* A assinatura do logo em 4 px: verde virando amarelo. Não carrega texto, então é a única
          cor que pode ser puramente decorativa aqui. */}
      <div
        aria-hidden
        className="h-1 shrink-0"
        style={{ background: `linear-gradient(90deg, ${MARCA.verde}, ${MARCA.amarelo})` }}
      />

      <div className={`flex flex-1 flex-col items-center text-center ${corpo}`}>
        {oferta.tripNumber ? (
          <div className="flex items-center gap-2.5" style={{ color: MARCA.amarelo }}>
            <Gavel className={compacto ? "h-4 w-4" : "h-6 w-6"} aria-hidden />
            <span
              className={`font-black uppercase tracking-[0.13em] tabular-nums ${compacto ? "text-base" : "text-2xl"}`}
            >
              {oferta.tripNumber}
            </span>
          </div>
        ) : null}

        {/*
          A ROTA EM UMA LINHA SÓ, e a letra encolhe conforme ela cresce. Quebrada, ela parte no meio
          do nome da estação ("LM Hub_PB_João / Pessoa_Gramame") e o olho para para remontar a
          palavra — e é ela que decide se alguém corre atrás do frete.
        */}
        <div
          className="w-full overflow-hidden whitespace-nowrap font-bold leading-tight"
          style={{
            fontSize: compacto
              ? `clamp(0.7rem, ${(60 / Math.max(oferta.route.length, 1)).toFixed(2)}vw, 1.05rem)`
              : `clamp(0.8rem, ${(110 / Math.max(oferta.route.length, 1)).toFixed(2)}vw, 1.6rem)`,
          }}
          title={oferta.route}
        >
          {oferta.route}
        </div>

        <div className="flex w-full flex-wrap items-start justify-center gap-x-8 gap-y-2">
          {oferta.originArrival ? (
            <Dado rotulo={t("originArrival")} valor={oferta.originArrival} compacto={compacto} />
          ) : null}
          {oferta.vehicle ? (
            <Dado rotulo={t("vehicle")} valor={oferta.vehicle} compacto={compacto} />
          ) : null}
          {oferta.price ? (
            <Dado rotulo={t("price")} valor={oferta.price} compacto={compacto} />
          ) : null}
        </div>

        {/* ── O QUE MUDA COM O ESTADO ───────────────────────────────────────────────────────── */}

        {oferta.estado === "enviado" ? (
          <div
            className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm"
            style={{
              background: "rgba(27,122,61,0.16)",
              borderColor: "rgba(35,160,82,0.5)",
            }}
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={{ color: MARCA.amarelo }} />
            <span className="leading-snug">
              {t("aguardandoPortal")}
              {oferta.decidiuNome ? (
                <span className="block text-xs" style={{ color: MARCA.rotulo }}>
                  {t("aceitoPor", { nome: oferta.decidiuNome })}
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        {erro && oferta.estado === "recusado" ? (
          <div
            className="flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left"
            style={{ background: "rgba(220,38,38,0.14)", borderColor: "rgba(248,113,113,0.55)" }}
          >
            <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "#FCA5A5" }}>
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
              {t("portalRecusou")}
            </span>
            {/* A frase nossa quando existe; o texto do portal SEMPRE. Ver `EXPLICACAO_DO_PORTAL`. */}
            {erro.frase ? <span className="text-xs leading-snug">{erro.frase}</span> : null}
            <span className="break-words text-[0.68rem] leading-snug" style={{ color: MARCA.rotulo }}>
              {erro.cru}
            </span>
          </div>
        ) : null}

        {oferta.estado === "sem_viagem" ? (
          <p
            className="w-full rounded-lg px-2.5 py-1.5 text-xs leading-snug"
            style={{ background: "rgba(242,194,48,0.08)", color: MARCA.amarelo }}
          >
            {t("semViagemAinda")}
          </p>
        ) : null}

        {/* ── OS GESTOS ─────────────────────────────────────────────────────────────────────── */}

        {podeDecidir && confirmando ? (
          <div
            className="flex w-full flex-col gap-2.5 rounded-xl border p-3"
            style={{ background: "rgba(242,194,48,0.1)", borderColor: "rgba(242,194,48,0.45)" }}
          >
            <p className="m-0 text-sm leading-snug">
              {t.rich("confirmarAceite", {
                lh: oferta.tripNumber ?? "",
                forte: (c) => (
                  <strong style={{ color: MARCA.amarelo }}>{c}</strong>
                ),
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={enviando}
                onClick={() => {
                  setConfirmando(false);
                  onAceitar();
                }}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-extrabold disabled:opacity-60"
                style={{ background: MARCA.amarelo, color: "#2A1F00" }}
              >
                {enviando ? t("enviando") : t("confirmarBotao")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: "rgba(238,243,248,0.24)", color: MARCA.rotulo }}
              >
                {t("voltar")}
              </button>
            </div>
          </div>
        ) : null}

        {!confirmando ? (
          <div className="flex w-full gap-2.5">
            {podeDecidir ? (
              <button
                type="button"
                disabled={!oferta.podeAceitar || enviando}
                onClick={() => setConfirmando(true)}
                title={oferta.podeAceitar ? undefined : t("aceiteIndisponivel")}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white transition-colors disabled:cursor-not-allowed"
                style={{
                  background: oferta.podeAceitar ? MARCA.verde : "#2B3A4B",
                  color: oferta.podeAceitar ? "#fff" : "#7B8B9D",
                }}
                onMouseEnter={(e) => {
                  if (oferta.podeAceitar) e.currentTarget.style.background = MARCA.verdeClaro;
                }}
                onMouseLeave={(e) => {
                  if (oferta.podeAceitar) e.currentTarget.style.background = MARCA.verde;
                }}
              >
                {oferta.estado === "recusado" ? t("tentarDeNovo") : t("aceitar")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onIgnorar}
              className={`rounded-xl border px-5 py-3 text-sm font-semibold ${podeDecidir ? "" : "flex-1"}`}
              style={{ borderColor: "rgba(238,243,248,0.24)", color: MARCA.rotulo }}
            >
              {t("ignorar")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Dado({
  rotulo,
  valor,
  compacto,
}: {
  rotulo: string;
  valor: string;
  compacto: boolean;
}) {
  return (
    <span className="leading-tight">
      {/* Rótulo em cinza-claro e valor em branco: os dois em AMARELO brigariam com o número da
          viagem, e a tela perderia a hierarquia que faz o olho achar a rota primeiro. */}
      <span
        className={`block uppercase tracking-[0.13em] font-bold ${compacto ? "text-[0.6rem]" : "text-[0.68rem]"}`}
        style={{ color: MARCA.rotulo }}
      >
        {rotulo}
      </span>
      <span className={`font-semibold ${compacto ? "text-sm" : "text-lg"}`}>{valor}</span>
    </span>
  );
}
