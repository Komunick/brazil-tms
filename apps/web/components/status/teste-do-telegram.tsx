"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

/**
 * PROVAR QUE O AVISO DE SPOT CHEGA NO GRUPO (2026-08-24, a pedido).
 *
 * Ofertas de spot são raras — de 3 a 21 por dia, e nenhuma em algumas manhãs. Sem um jeito de
 * provocar, a primeira notícia de que o Telegram parou vem no dia em que uma oferta boa passou e o
 * grupo não soube.
 *
 * Mora na tela de Status porque é aqui que se vem quando se desconfia de que algo parou, e ao lado
 * das fontes e do ritmo dos robôs — as três perguntas do mesmo tipo: "isto ainda está funcionando?".
 *
 * ── AS TRÊS RESPOSTAS SÃO DIFERENTES, E ISSO IMPORTA ──────────────────────────────────────────
 *
 * "Enviado", "não configurado" e "falhou" mandam a pessoa para lugares distintos: nada a fazer, pôr
 * as variáveis no servidor, ou olhar o log. Um único "erro" para os três faria alguém procurar
 * defeito onde só falta configuração.
 */
export function TesteDoTelegram() {
  const t = useTranslations("Status.telegram");
  const [estado, setEstado] = useState<"parado" | "enviando" | "ok" | "semConfig" | "falhou">(
    "parado",
  );

  async function testar() {
    setEstado("enviando");
    try {
      const res = await fetch("/api/status/telegram-teste", { method: "POST" });
      if (!res.ok) {
        setEstado("falhou");
        return;
      }
      const corpo = (await res.json()) as { enviado: boolean; configurado: boolean };
      setEstado(corpo.enviado ? "ok" : corpo.configurado ? "falhou" : "semConfig");
    } catch {
      setEstado("falhou");
    }
  }

  return (
    <Card className="p-4">
      <CardTitle className="text-sm font-semibold uppercase tracking-wide">
        {t("titulo")}
      </CardTitle>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("dica")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={testar} disabled={estado === "enviando"}>
          <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
          {estado === "enviando" ? t("enviando") : t("testar")}
        </Button>
        {estado === "ok" ? <span className="text-xs text-success">{t("ok")}</span> : null}
        {estado === "semConfig" ? (
          <span className="text-xs text-warning">{t("semConfig")}</span>
        ) : null}
        {estado === "falhou" ? (
          <span className="text-xs text-destructive">{t("falhou")}</span>
        ) : null}
      </div>
    </Card>
  );
}
