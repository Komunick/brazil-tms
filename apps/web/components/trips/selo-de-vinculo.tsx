"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LinhaDaProgramacao } from "@brazil-tms/db";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * FROTA, AGREGADO OU TERCEIRO — ao lado do nome, e EDITÁVEL ali mesmo (2026-09-02, a pedido).
 *
 * ── POR QUE ELE CABE NA CÉLULA DO MOTORISTA, e não numa coluna ────────────────────────────────
 *
 * Vínculo é um adjetivo do motorista, não um dado da viagem. Uma coluna própria custaria largura em
 * todas as linhas para dizer uma palavra, e afastaria o rótulo justamente do nome a que ele se
 * refere. Ao lado do nome, ele se lê junto.
 *
 * ── E POR QUE ELE PASSOU A EDITAR ─────────────────────────────────────────────────────────────
 *
 * Ele nasceu só de leitura em 02/09, com o argumento de que cadastro se edita no cadastro. O
 * usuário pediu o contrário no mesmo dia, e a razão dele é melhor: **é aqui que se PERCEBE que o
 * vínculo está errado** — olhando a programação do dia, com o nome na frente. Mandar a pessoa
 * procurar o motorista noutra tela é o mesmo passo que o botão de aceitar do spot veio eliminar.
 *
 * A porta é a MESMA do cadastro (`PATCH /api/master-data/drivers/:id`), com a mesma permissão e a
 * mesma regra. Não nasceu um segundo caminho de escrita — só um segundo ponto de partida.
 *
 * ── TERCEIRO FICA APAGADO, E ISSO NÃO É DESCUIDO ──────────────────────────────────────────────
 *
 * Medido em 02/09, na produção: das 137 viagens do dia com motorista, **98 são terceiro**, 24
 * agregado e 18 frota. Se os três tivessem a mesma força visual, a coluna viraria uma parede de
 * selos coloridos e o olho não acharia mais nada — o que se procura ali é a EXCEÇÃO.
 *
 * ── SEM VÍNCULO NÃO DESENHA NADA ──────────────────────────────────────────────────────────────
 *
 * O portal manda o nome de quem dirige e não sabe de quem é o caminhão — o vínculo é do NOSSO
 * cadastro. Motorista que o portal escalou e que ainda não existe aqui não tem vínculo, e a célula
 * fica com o nome puro. Inventar um valor seria pior que a ausência: alguém faturaria pela tarifa
 * errada por causa de um selo que ninguém conferiu.
 */

const CORES_DO_VINCULO = {
  owned: "border-emerald-300 bg-emerald-50 text-emerald-800",
  agregado: "border-sky-300 bg-sky-50 text-sky-800",
  subcontracted: "border-transparent bg-muted text-muted-foreground",
} as const;

type Vinculo = NonNullable<LinhaDaProgramacao["vinculo"]>;

/** Os três, na ordem em que a operação pensa neles: o nosso, o de casa, o de fora. */
const VINCULOS: readonly Vinculo[] = ["owned", "agregado", "subcontracted"];

/** O visual do selo, compartilhado pelo modo leitura e pelo botão — uma definição só. */
const selo = (v: Vinculo): string =>
  `shrink-0 rounded border px-1 py-px text-[0.6rem] font-bold uppercase leading-none tracking-wide ${CORES_DO_VINCULO[v]}`;

export function SeloDeVinculo({
  vinculo,
  driverId,
  podeEditar,
}: {
  vinculo: LinhaDaProgramacao["vinculo"];
  driverId: string | null;
  podeEditar: boolean;
}) {
  const t = useTranslations("Programacao");
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<Vinculo | null>(null);
  const [transportadora, setTransportadora] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /*
    AS TRANSPORTADORAS SÓ SÃO BUSCADAS QUANDO O MENU ABRE.

    Elas não servem para nada enquanto ninguém edita, e a programação recarrega sozinha de minuto em
    minuto — pendurar essa lista na carga da tela seria uma requisição por minuto, em toda tela
    aberta, para um menu que quase nunca abre.
  */
  const carriers = useQuery({
    queryKey: ["transportadoras-do-vinculo"],
    enabled: aberto,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetch("/api/master-data/carriers?limit=500", { credentials: "include" });
      const j = (await r.json()) as { items?: Array<{ id: string; name: string; status?: string }> };
      return (j.items ?? []).filter((c) => c.status !== "inactive");
    },
  });

  if (!vinculo) return null;

  const somenteLeitura = <span className={selo(vinculo)}>{t(`vinculo_${vinculo}`)}</span>;

  /*
    SEM ID OU SEM PERMISSÃO, O SELO CONTINUA — só não vira botão.

    Sem id é o motorista que o portal escalou e que ainda não existe no nosso cadastro: não há a quem
    endereçar a alteração. Sem permissão é decisão de acesso. Nos dois casos a INFORMAÇÃO continua à
    vista e some o gesto — oferecer um botão que vai falhar é pior que não oferecer.
  */
  if (!driverId || !podeEditar) return somenteLeitura;

  const precisaTransportadora = escolhido !== null && escolhido !== "owned";

  async function salvar(destino: Vinculo) {
    setSalvando(true);
    setErro(null);
    try {
      /*
        A REGRA DO CADASTRO VALE AQUI TAMBÉM (`isOwnershipCarrierValid`): próprio NÃO pode ter
        transportadora; agregado e terceiro EXIGEM uma.

        O `carrierId: ""` no caso do próprio é o que LIMPA a transportadora anterior. Omitir o campo
        deixaria a antiga no lugar e o servidor recusaria a alteração — com uma mensagem sobre um
        campo que esta tela nem mostra.
      */
      const corpo =
        destino === "owned"
          ? { ownershipType: destino, carrierId: "" }
          : { ownershipType: destino, carrierId: transportadora };

      const r = await fetch(`/api/master-data/drivers/${driverId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) {
        const c = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(c.message ?? c.error ?? `FALHOU (HTTP ${r.status})`);
      }
      setAberto(false);
      setEscolhido(null);
      setTransportadora("");
      /*
        A linha inteira vem da programação, então é ELA que precisa ser relida — sem isto o selo só
        mudaria no ciclo seguinte, e quem acabou de clicar acharia que não salvou.
      */
      await qc.invalidateQueries({ queryKey: ["programacao"] });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "FALHOU");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <DropdownMenu
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) {
          setEscolhido(null);
          setTransportadora("");
          setErro(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${selo(vinculo)} cursor-pointer hover:brightness-95`}>
          {t(`vinculo_${vinculo}`)}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64 p-2">
        <p className="px-1 pb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
          {t("vinculoDoMotorista")}
        </p>

        <div className="flex gap-1.5">
          {VINCULOS.map((v) => (
            <button
              key={v}
              type="button"
              disabled={salvando}
              /*
                PRÓPRIO SALVA DIRETO; os outros dois abrem o seletor. É a regra do servidor virando
                gesto: o que não precisa de transportadora não pede uma.
              */
              onClick={() => (v === "owned" ? void salvar(v) : setEscolhido(v))}
              className={`flex-1 rounded border px-1.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide disabled:opacity-50 ${
                (escolhido ?? vinculo) === v
                  ? CORES_DO_VINCULO[v]
                  : "border-input text-muted-foreground"
              }`}
            >
              {t(`vinculo_${v}`)}
            </button>
          ))}
        </div>

        {/*
          A TRANSPORTADORA APARECE PORQUE A REGRA A EXIGE, e não por enfeite.

          Era exatamente ela que faltava na aba de Motoristas: lá o seletor só aparecia para
          `subcontracted`, e por isso escolher Agregado nunca salvava — o único campo capaz de
          satisfazer a regra não estava na tela.
        */}
        {precisaTransportadora ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <select
              value={transportadora}
              onChange={(e) => setTransportadora(e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
            >
              <option value="">
                {carriers.isLoading ? t("carregando") : t("escolhaTransportadora")}
              </option>
              {(carriers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              className="h-7"
              disabled={!transportadora || salvando}
              onClick={() => escolhido && void salvar(escolhido)}
            >
              {salvando ? t("salvando") : t("salvar")}
            </Button>
          </div>
        ) : null}

        {erro ? <p className="mt-2 text-[0.7rem] text-destructive">{erro}</p> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
