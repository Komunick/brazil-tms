"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, ShieldCheck } from "lucide-react";
import { formatDateTime } from "@brazil-tms/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { avisar } from "@/lib/ui/avisos";

/**
 * BLOQUEAR E DESBLOQUEAR ESTE MOTORISTA (2026-08-25, a pedido).
 *
 * Bloqueado, ele não é escalado em viagem nenhuma. A garantia mora no servidor — dentro da
 * transação que trava a viagem, em `enfileirarOrdemDoPortal`. Esta tela é onde a decisão é tomada,
 * não onde ela é cumprida: a lista de atribuição continua mostrando o nome, riscado, e é o servidor
 * que recusa se alguém insistir.
 *
 * ── O MOTIVO É OBRIGATÓRIO, E O BOTÃO NÃO LIGA SEM ELE ────────────────────────────────────────
 *
 * Decisão do usuário, e o CHECK do banco também garante. A razão prática: semanas depois, um nome
 * parado sem motivo escrito não tem como voltar — ou alguém desbloqueia no escuro, ou ele fica
 * parado para sempre porque ninguém se lembra do que houve.
 *
 * ── DESBLOQUEAR NÃO PEDE MOTIVO ───────────────────────────────────────────────────────────────
 *
 * A assimetria é de propósito. Bloquear tira alguém do trabalho e precisa de justificativa;
 * desbloquear devolve ao normal. Pedir texto nos dois lados faria a pessoa escrever "ok" e o campo
 * perderia o sentido nos dois.
 */
export function DriverBlockCard({
  driverId,
  blockedAt,
  blockedReason,
}: {
  driverId: string;
  blockedAt: string | null;
  blockedReason: string | null;
}) {
  const t = useTranslations("Resources.drivers.block");
  const qc = useQueryClient();
  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState("");

  function invalidar() {
    void qc.invalidateQueries({ queryKey: ["master-data", "drivers"] });
  }

  const bloquear = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/master-data/drivers/${driverId}/bloqueio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => {
      setAbrindo(false);
      setMotivo("");
      invalidar();
      avisar({ tipo: "ok", texto: t("bloqueado") });
    },
    onError: () => avisar({ tipo: "erro", texto: t("falhou") }),
  });

  const desbloquear = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/master-data/drivers/${driverId}/bloqueio`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => {
      invalidar();
      avisar({ tipo: "ok", texto: t("desbloqueado") });
    },
    onError: () => avisar({ tipo: "erro", texto: t("falhou") }),
  });

  const bloqueado = blockedAt != null;

  return (
    <Card className={bloqueado ? "border-destructive" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {bloqueado ? (
            <Ban className="h-4 w-4 text-destructive" aria-hidden />
          ) : (
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          {bloqueado ? t("tituloBloqueado") : t("titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {bloqueado ? (
          <>
            {/* O motivo é o que faz o bloqueio poder ser desfeito com consciência. Sem ele à vista,
                desbloquear seria apertar um botão sem saber o que se está revertendo. */}
            <p className="text-sm">{blockedReason}</p>
            <p className="text-xs text-muted-foreground">
              {t("desde", { data: formatDateTime(blockedAt) })}
            </p>
            <Button
              variant="outline"
              disabled={desbloquear.isPending}
              onClick={() => desbloquear.mutate()}
            >
              {t("desbloquear")}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("explicacao")}</p>
            <Button variant="destructive" onClick={() => setAbrindo(true)}>
              {t("bloquear")}
            </Button>
          </>
        )}
      </CardContent>

      <Dialog open={abrindo} onOpenChange={setAbrindo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialogoTitulo")}</DialogTitle>
            <DialogDescription>{t("dialogoAviso")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={t("motivoPlaceholder")}
            rows={3}
            aria-label={t("motivo")}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbrindo(false)}>
              {t("voltar")}
            </Button>
            <Button
              variant="destructive"
              // O botão não liga sem motivo — a mesma regra do banco, dita antes de o servidor
              // precisar recusar. Três letras é o mínimo que distingue texto de tecla apertada sem
              // querer.
              disabled={bloquear.isPending || motivo.trim().length < 3}
              onClick={() => bloquear.mutate()}
            >
              {t("confirmar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
