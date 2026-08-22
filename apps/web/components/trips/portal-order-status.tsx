"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useOrdensDoPortal } from "@/lib/trips/client";

/**
 * O QUE ACONTECEU COM O QUE VOCÊ ACABOU DE MANDAR (2026-08-22, a pedido).
 *
 * O caminho tem três tempos: o TMS enfileira a ordem, o robô a pega no ciclo dele, o portal
 * responde. A tela não mostrava nenhum deles. O usuário apertou "Atribuir no portal", o diálogo
 * fechou, e pronto — nada na tela dizia se tinha ido. Ele foi conferir no portal, que é exatamente
 * o passo que este recurso inteiro existe para eliminar. (Tinha ido: `retcode 0`, 27 segundos
 * depois do clique.)
 *
 * ── POR QUE NÃO UM "ATRIBUÍDO!" NA HORA ────────────────────────────────────────────────────────
 *
 * Seria mentira por alguns segundos, e mentira do pior tipo: a que só se descobre quando o
 * caminhão não aparece. O portal pode recusar — motorista sem cadastro lá, viagem que alguém pegou
 * antes, placa que não bate. Quem afirma "efetuada" é o portal, e este componente espera ele
 * afirmar.
 *
 * Enquanto espera, diz que está esperando. Terminou, diz o que deu — e, quando dá errado, mostra a
 * palavra do portal em vez de um "falhou" que não ajuda ninguém a consertar.
 *
 * ── E ELE SOME SOZINHO ─────────────────────────────────────────────────────────────────────────
 *
 * Não some no sucesso: some quando a lista recarrega e a viagem já vem do portal com o motorista
 * novo. Até lá, a confirmação verde é a única coisa na tela que prova que o trabalho foi feito —
 * porque a linha ainda mostra o estado que o robô leitor trouxe da última passada.
 */
export function PortalOrderStatus({ tripId }: { tripId: string }) {
  const t = useTranslations("Trips.portalOrder");
  const consulta = useOrdensDoPortal(tripId, true);
  const ordem = consulta.data?.items?.[0];

  if (!ordem) return null;

  if (ordem.status === "pending" || ordem.status === "sent") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-warning">
        <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
        {ordem.status === "pending" ? t("queued") : t("running")}
      </span>
    );
  }

  if (ordem.status === "done") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
        {t(ordem.action === "assign" ? "doneAssign" : "doneDecision")}
      </span>
    );
  }

  return (
    <span role="alert" className="flex items-center gap-1.5 text-xs font-medium text-destructive">
      <XCircle aria-hidden className="h-3.5 w-3.5" />
      {/* A palavra do PORTAL, não a nossa: é ela que diz o que consertar. */}
      {ordem.lastError?.trim() ? t("failedWith", { erro: ordem.lastError }) : t("failed")}
    </span>
  );
}
