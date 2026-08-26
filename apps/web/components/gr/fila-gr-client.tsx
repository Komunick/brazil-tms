"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, Truck } from "lucide-react";
import { formatDateTime } from "@brazil-tms/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { avisar } from "@/lib/ui/avisos";
import { normalizeForSearch } from "@/lib/search-normalize";
import { cn } from "@/lib/utils";

/**
 * A ABA GR — a fila da Pré-SM (2026-08-26, fatia 027).
 *
 * Depois que a atribuição chega ao portal, alguém abria o sistema da gerenciadora Logae e gerava a
 * pré-solicitação à mão. Vimos a tela ao vivo: a Logae **já recebe a LH do portal** com placa,
 * carreta e agendas preenchidas, e a única coisa que a pessoa digitava era o vínculo de cada
 * recurso. O retrabalho não era redigitar a viagem — era sair do TMS para responder três perguntas
 * que o TMS já sabe responder.
 *
 * ── O QUE FALTA É A INFORMAÇÃO PRINCIPAL, NÃO UM DETALHE ──────────────────────────────────────
 *
 * Cada linha diz **todos** os motivos que a impedem, com o caminho para resolver cada um. Isso tem
 * a mesma prioridade que enviar: 19% das viagens não têm CPF do motorista, e sem dizer isso elas
 * ficariam paradas com a pessoa concluindo que a aba não funciona.
 *
 * A ordem dos motivos vem do servidor e não é alfabética: o que **não se resolve na viagem** vem
 * primeiro. Ver `motivosDeNaoEnviar`.
 *
 * ── UMA POR VEZ, SEM LOTE ─────────────────────────────────────────────────────────────────────
 *
 * Decisão do usuário. A gerenciadora cobra por solicitação e não há ambiente de teste: cada envio é
 * uma decisão consciente, e um engano custa uma solicitação — não vinte.
 *
 * ── E A VIAGEM FICA DEPOIS DE ENVIADA ─────────────────────────────────────────────────────────
 *
 * Numa seção separada, com o código e o cancelamento. É ali que se vê que a atribuição mudou depois
 * de a escolta já estar contratada.
 */
interface LinhaGR {
  tripId: string;
  externalTripId: string;
  origem: string | null;
  destino: string | null;
  nomeMotorista: string | null;
  cpfMotorista: string | null;
  nomeSegundoMotorista: string | null;
  placas: { placa: string; vinculo: string | null }[];
  chegadaNaColeta: string | null;
  motivos: string[];
  pronta: boolean;
  preSmStatus: string | null;
  preSmCodigo: string | null;
}

/** Onde cada motivo se resolve. É o que transforma "está travado" em "faça isto". */
const CAMINHO: Record<string, (l: LinhaGR) => { href: string; chave: string } | null> = {
  sem_rota: () => ({ href: "/admin/pre-sm-rotas", chave: "irParaRotas" }),
  sem_cidade_origem: () => ({ href: "/admin/pre-sm-cidades", chave: "irParaCidades" }),
  sem_cidade_destino: () => ({ href: "/admin/pre-sm-cidades", chave: "irParaCidades" }),
  sem_cpf: () => ({ href: "/resources/drivers", chave: "irParaMotoristas" }),
  sem_vinculo_motorista: () => ({ href: "/resources/drivers", chave: "irParaMotoristas" }),
  sem_vinculo_veiculo: () => ({ href: "/resources/vehicles", chave: "irParaVeiculos" }),
  sem_placa: (l) => ({ href: `/trips/${l.tripId}`, chave: "irParaViagem" }),
  sem_janela_coleta: (l) => ({ href: `/trips/${l.tripId}`, chave: "irParaViagem" }),
  sem_janela_entrega: (l) => ({ href: `/trips/${l.tripId}`, chave: "irParaViagem" }),
};

export function FilaGrClient() {
  const t = useTranslations("GR");
  const [busca, setBusca] = useState("");

  const consulta = useQuery({
    queryKey: ["gr-fila"],
    queryFn: async () => {
      const res = await fetch("/api/gr");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { items: LinhaGR[]; configurada: boolean };
    },
    /**
     * O estado muda POR FORA — quem cria a Pré-SM é o worker, e quem resolve os motivos são outras
     * telas. Sem polling, a fila diria "falta CPF" para sempre depois de alguém preencher o CPF.
     */
    refetchInterval: 20_000,
  });

  const itens = consulta.data?.items ?? [];

  const { pendentes, enviadas } = useMemo(() => {
    const termo = normalizeForSearch(busca);
    const casa = (l: LinhaGR) =>
      !termo ||
      [l.externalTripId, l.origem, l.destino, l.nomeMotorista, ...l.placas.map((p) => p.placa)]
        .filter(Boolean)
        .some((c) => normalizeForSearch(String(c)).includes(termo));

    const vistas = itens.filter(casa);
    return {
      pendentes: vistas.filter((l) => l.preSmStatus !== "criada"),
      enviadas: vistas.filter((l) => l.preSmStatus === "criada"),
    };
  }, [itens, busca]);

  const prontas = pendentes.filter((l) => l.pronta).length;

  if (consulta.isPending) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      {/* A integração sem configuração é defeito de INSTALAÇÃO, não trabalho de cadastro. Dizer isso
          separado evita que alguém saia procurando o que preencher no cadastro. */}
      {consulta.data && !consulta.data.configurada ? (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{t("semConfiguracao")}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("buscar")}
            className="max-w-xs"
          />
          {/* Os dois números que interessam: o que dá para fazer agora, e o tamanho da fila. */}
          <span className="text-sm text-muted-foreground">
            {t("prontas", { n: prontas })} · {t("naFila", { n: pendentes.length })}
          </span>
        </CardContent>
      </Card>

      {pendentes.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">{t("filaVazia")}</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pendentes.map((l) => (
            <LinhaDaFila key={l.tripId} l={l} />
          ))}
        </div>
      )}

      {enviadas.length > 0 ? (
        <section className="space-y-2 pt-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("jaEnviadas", { n: enviadas.length })}
          </h2>
          {enviadas.map((l) => (
            <LinhaDaFila key={l.tripId} l={l} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function LinhaDaFila({ l }: { l: LinhaGR }) {
  const t = useTranslations("GR");
  const qc = useQueryClient();
  const criada = l.preSmStatus === "criada";
  const emAndamento = l.preSmStatus === "pendente";

  const enviar = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/gr/${l.tripId}/enviar`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gr-fila"] });
      /**
       * "Pedida", não "criada". Quem cria de verdade é a gerenciadora, e a resposta vem depois —
       * dizer "criada" no instante do clique seria mentir sobre algo que ainda não existe.
       */
      avisar({ tipo: "ok", texto: t("pedida") });
    },
    onError: () => avisar({ tipo: "erro", texto: t("envioFalhou") }),
  });

  return (
    <Card className={cn(!criada && !l.pronta && "border-warning/50")}>
      <CardContent className="space-y-2 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          {criada ? (
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
          ) : (
            <Truck className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          <Link href={`/trips/${l.tripId}`} className="font-medium hover:underline">
            {l.externalTripId}
          </Link>
          <span className="text-sm text-muted-foreground">
            {l.origem} → {l.destino}
          </span>
          {l.chegadaNaColeta ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("coletaEm", { data: formatDateTime(l.chegadaNaColeta) })}
            </span>
          ) : null}

          {criada && l.preSmCodigo ? (
            <Badge variant="secondary" className="ml-auto font-mono tabular-nums">
              {l.preSmCodigo}
            </Badge>
          ) : emAndamento ? (
            /* O pedido saiu e a gerenciadora ainda não respondeu. Distinguir isso de "falhou" é o
               que impede alguém de apertar de novo e gerar uma segunda solicitação cobrada. */
            <Badge variant="secondary" className="ml-auto">
              {t("enviando")}
            </Badge>
          ) : (
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              disabled={!l.pronta || enviar.isPending}
              onClick={() => enviar.mutate()}
            >
              {t("enviar")}
            </Button>
          )}
        </div>

        {/* O que SERÁ enviado, à vista. Quem aperta precisa poder conferir sem abrir a viagem. */}
        <p className="text-sm">
          {l.placas.map((p) => p.placa).join(" + ") || "—"}
          {l.nomeMotorista ? ` · ${l.nomeMotorista}` : ""}
          {l.nomeSegundoMotorista ? ` + ${l.nomeSegundoMotorista}` : ""}
        </p>

        {/* TODOS os motivos, cada um com o caminho. Ver o comentário do topo. */}
        {l.motivos.length > 0 ? (
          <ul className="space-y-1">
            {l.motivos.map((m) => {
              const caminho = CAMINHO[m]?.(l);
              return (
                <li key={m} className="flex items-center gap-2 text-xs text-warning">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                  <span>{t(`motivo.${m}`)}</span>
                  {caminho ? (
                    <Link href={caminho.href} className="underline hover:no-underline">
                      {t(caminho.chave)}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
