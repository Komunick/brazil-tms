"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { normalizarPlaca } from "@brazil-tms/shared";
import { usePortalDrivers, usePrevisto, useSalvarPrevisto } from "@/lib/trips/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

/**
 * O PREVISTO DA VIAGEM — quem VAI dirigir, antes de a ordem existir (2026-08-26, a pedido).
 *
 * ── POR QUE ISTO NÃO PODE PARECER O BOTÃO DE ATRIBUIR ─────────────────────────────────────────
 *
 * Em 25/08 a escala interna foi RETIRADA desta janela porque gravava só no TMS e não ia ao portal:
 * a pessoa trocava o motorista, ia conferir no portal e não achava nada. O defeito não era o
 * recurso — era haver dois botões escritos "Atribuir", um que saía e outro que ficava.
 *
 * O previsto é a mesma ideia com o engano desarmado: ele DIZ que não vai ao portal, na própria
 * tela, e some da linha da programação assim que a atribuição de verdade chega. Se um dia alguém
 * redesenhar isto e tirar essa frase, o defeito volta inteiro.
 *
 * ── O MOTORISTA VEM DA LISTA DO PORTAL ────────────────────────────────────────────────────────
 *
 * A mesma lista e a mesma chave do diálogo de atribuição. É o que permite ao previsto pré-preencher
 * aquele formulário mais tarde, e o que evita traduzir por nome entre os dois cadastros — tradução
 * que é frágil e já custou caro nesta base.
 */
export function PrevistoDaViagem({ tripId, podeMexer }: { tripId: string; podeMexer: boolean }) {
  const t = useTranslations("Programacao");
  const consulta = usePrevisto(tripId);
  const salvar = useSalvarPrevisto(tripId);
  const motoristas = usePortalDrivers();

  const previsto = consulta.data?.previsto ?? null;
  const [editando, setEditando] = useState(false);

  if (consulta.isPending) return null;

  // Fechado: uma linha que diz o que está previsto, ou o convite para prever.
  if (!editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{t("previsto")}</span>
        {previsto ? (
          <span className="text-xs">
            {previsto.motorista ?? previsto.portalDriverId ?? "—"}
            {previsto.placa ? <span className="ml-2 font-mono">{previsto.placa}</span> : null}
            {previsto.definidoPor ? (
              <span className="ml-2 text-muted-foreground">
                {t("previstoPor", { nome: previsto.definidoPor })}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t("semPrevisto")}</span>
        )}
        {podeMexer ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setEditando(true)}
          >
            {previsto ? t("trocarPrevisto") : t("definirPrevisto")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Editor
      tripId={tripId}
      inicial={previsto}
      opcoes={(motoristas.data?.items ?? []).map((m) => ({
        id: String(m.portalDriverId),
        label: m.name,
        // Bloqueado aparece e não dá para escolher — a mesma régua do diálogo de atribuição.
        // Prever alguém que não pode rodar é planejar um problema para daqui a três horas.
        disabled: m.bloqueio != null,
      }))}
      carregando={motoristas.isLoading}
      salvando={salvar.isPending}
      aoSalvar={(dados) => {
        salvar.mutate(dados, { onSuccess: () => setEditando(false) });
      }}
      aoCancelar={() => setEditando(false)}
    />
  );
}

/**
 * O FORMULÁRIO É COMPONENTE SEPARADO por causa do estado inicial.
 *
 * Ele nasce preenchido com o que já estava previsto, e nascer é a única hora em que isso pode ser
 * decidido sem efeito. Um `useEffect` sincronizando os campos com a consulta seria o mesmo laço que
 * derrubou o diálogo de atribuição em 22/08 — efeito muda estado, estado re-renderiza, efeito roda
 * de novo, "Maximum update depth". Montado só quando se abre a edição, não há o que sincronizar.
 */
function Editor({
  tripId,
  inicial,
  opcoes,
  carregando,
  salvando,
  aoSalvar,
  aoCancelar,
}: {
  tripId: string;
  inicial: { portalDriverId: string | null; placa: string | null } | null;
  opcoes: { id: string; label: string; disabled?: boolean }[];
  carregando: boolean;
  salvando: boolean;
  aoSalvar: (dados: { portalDriverId: string | null; placa: string | null }) => void;
  aoCancelar: () => void;
}) {
  const t = useTranslations("Programacao");
  const [driverId, setDriverId] = useState(inicial?.portalDriverId ?? "");
  const [placa, setPlaca] = useState(inicial?.placa ?? "");

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="space-y-1">
        <p className="text-xs font-medium">{t("previstoTitulo")}</p>
        {/* A frase é o desarme do engano, não decoração. Ver o comentário do topo do arquivo. */}
        <p className="text-xs text-muted-foreground">{t("previstoExplicacao")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`previsto-motorista-${tripId}`}>{t("motorista")}</Label>
          <SearchableSelect
            id={`previsto-motorista-${tripId}`}
            value={driverId}
            onChange={setDriverId}
            options={opcoes}
            placeholder={carregando ? t("carregandoMotoristas") : t("escolherMotorista")}
            emptyText={t("nenhumMotorista")}
            clearable
            clearLabel={t("semMotorista")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`previsto-placa-${tripId}`}>{t("placa")}</Label>
          <Input
            id={`previsto-placa-${tripId}`}
            value={placa}
            onChange={(e) => setPlaca(e.target.value)}
            placeholder={t("placaPlaceholder")}
            className="font-mono"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={salvando}
          onClick={() =>
            aoSalvar({
              portalDriverId: driverId || null,
              /**
               * A PLACA É NORMALIZADA CAMPO A CAMPO, e a vírgula sobrevive.
               *
               * Uma carreta chega como "PXW0I78,EMU0J25" — cavalo e reboque no mesmo campo.
               * `normalizarPlaca` apaga tudo que não é letra nem número, então aplicá-la à string
               * inteira grudaria as duas numa placa só. Foi exatamente o defeito do diálogo de
               * atribuição em 22/08, e não vale a pena descobri-lo de novo aqui.
               */
              placa:
                placa
                  .split(",")
                  .map((p) => normalizarPlaca(p))
                  .filter(Boolean)
                  .join(",") || null,
            })
          }
        >
          {salvando ? t("salvando") : t("salvarPrevisto")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={aoCancelar}>
          {t("cancelar")}
        </Button>
        {/* Limpar os dois campos e salvar JÁ É desmarcar — o servidor apaga a linha. Este botão é
            só o atalho para o mesmo gesto, e não um segundo caminho para outro estado. */}
        {inicial ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            disabled={salvando}
            onClick={() => aoSalvar({ portalDriverId: null, placa: null })}
          >
            {t("removerPrevisto")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
