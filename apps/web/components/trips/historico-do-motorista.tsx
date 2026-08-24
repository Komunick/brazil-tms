"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Clock, ThumbsUp, TriangleAlert } from "lucide-react";
import { useHistoricoDoMotorista, useRegistrarNoMotorista } from "@/lib/trips/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * O HISTÓRICO DO MOTORISTA — o que ele rodou, e o que aconteceu com ele (2026-08-24, a pedido).
 *
 * A nota do ranking mede UMA coisa: entrega no prazo. Um motorista de 95% que levou duas
 * advertências no mês aparece igualzinho a um de 95% sem nenhuma — e a diferença é exatamente o que
 * decide na hora de escalar. Este painel é o outro lado.
 *
 * ── AS ROTAS NÃO SÃO DIGITADAS ────────────────────────────────────────────────────────────────
 *
 * Saem das atribuições que já existem: quantas vezes ele fez cada trecho e quando foi a última. "Já
 * fez essa rota?" é a primeira pergunta de quem escala, e a resposta sempre esteve no banco — só
 * não estava na tela.
 *
 * ── OS FATOS SÃO, PORQUE NÃO HÁ COMO DERIVAR ──────────────────────────────────────────────────
 *
 * Nenhuma coluna do TMS sabe que o cliente ligou reclamando. Quatro categorias fixas, escolhidas
 * pelo usuário: reclamação, atraso, elogio, advertência — fixas para poder CONTAR depois. E texto
 * obrigatório junto, porque categoria sem explicação não ajuda ninguém a decidir nada.
 *
 * ── NÃO SE APAGA NEM SE EDITA ─────────────────────────────────────────────────────────────────
 *
 * Não há botão de excluir, e não é esquecimento: registro que se reescreve deixa de servir como
 * registro. Quem errou acrescenta outro dizendo que errou — como sempre funcionou um caderno de
 * ocorrências.
 */

const TIPOS = [
  { chave: "reclamacao", Icone: AlertTriangle, cor: "text-destructive" },
  { chave: "atraso", Icone: Clock, cor: "text-warning" },
  { chave: "elogio", Icone: ThumbsUp, cor: "text-success" },
  { chave: "advertencia", Icone: TriangleAlert, cor: "text-destructive" },
] as const;

export function HistoricoDoMotorista({
  driverId,
  nome,
  aberto,
  aoFechar,
  tripId,
}: {
  driverId: string | null;
  nome: string | null;
  aberto: boolean;
  aoFechar: () => void;
  /** A viagem de onde o painel foi aberto: o registro nasce apontando para ela. */
  tripId?: string;
}) {
  const t = useTranslations("HistoricoMotorista");
  const consulta = useHistoricoDoMotorista(driverId ?? "", aberto);
  const registrar = useRegistrarNoMotorista(driverId ?? "");

  const [tipo, setTipo] = useState<string>("reclamacao");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const rotas = consulta.data?.rotas ?? [];
  const registros = consulta.data?.registros ?? [];

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (texto.trim() === "") {
      setErro(t("escrevaOQueHouve"));
      return;
    }
    registrar.mutate(
      { tipo, texto, tripId: tripId ?? null },
      {
        onSuccess: () => setTexto(""),
        onError: () => setErro(t("naoDeuParaRegistrar")),
      },
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => (!v ? aoFechar() : undefined)}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{nome ?? t("titulo")}</DialogTitle>
          <DialogDescription>{t("subtitulo")}</DialogDescription>
        </DialogHeader>

        {consulta.isPending ? <Skeleton className="h-48 w-full" /> : null}

        {!consulta.isPending ? (
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("rotas")}
              </h3>
              {rotas.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("semRotas")}</p>
              ) : (
                <ul className="space-y-1">
                  {rotas.map((r, i) => (
                    <li key={`${r.origem}-${r.destino}-${i}`} className="flex justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate">
                        {r.origem ?? "—"}
                        <span className="px-1 text-muted-foreground">→</span>
                        {r.destino ?? "—"}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {t("vezes", { n: r.viagens })} · {r.ultima ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("ocorrencias")}
              </h3>

              {/* O formulário fica ANTES da lista: quem abre para registrar não deve rolar 200
                  linhas até achar onde escrever. */}
              <form onSubmit={enviar} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap gap-1.5">
                  {TIPOS.map(({ chave, Icone, cor }) => (
                    <button
                      key={chave}
                      type="button"
                      aria-pressed={tipo === chave}
                      onClick={() => setTipo(chave)}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                        tipo === chave
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icone className={cn("h-3 w-3", tipo === chave ? "" : cor)} aria-hidden />
                      {t(`tipo.${chave}` as Parameters<typeof t>[0])}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={t("placeholder")}
                  rows={2}
                  maxLength={2000}
                />
                {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
                <Button type="submit" size="sm" disabled={registrar.isPending}>
                  {t("registrar")}
                </Button>
              </form>

              {registros.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("semOcorrencias")}</p>
              ) : (
                <ul className="space-y-2">
                  {registros.map((r) => {
                    const meta = TIPOS.find((x) => x.chave === r.tipo);
                    const Icone = meta?.Icone ?? AlertTriangle;
                    return (
                      <li key={r.id} className="rounded-md border p-2.5">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Icone className={cn("h-3.5 w-3.5", meta?.cor)} aria-hidden />
                          <span className="font-medium">
                            {t(`tipo.${r.tipo}` as Parameters<typeof t>[0])}
                          </span>
                          <span className="ml-auto text-muted-foreground">{r.criadoEm}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{r.texto}</p>
                        <p className="mt-1 text-[0.68rem] text-muted-foreground">
                          {r.autor ?? "—"}
                          {r.externalTripId ? ` · ${r.externalTripId}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
