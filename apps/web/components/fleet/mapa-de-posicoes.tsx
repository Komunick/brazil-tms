"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
/**
 * A FOLHA DO LEAFLET VAI NO TOPO, e o JS não.
 *
 * O JS toca `window` ao carregar e precisa esperar o navegador (ver o comentário abaixo); o CSS
 * não executa nada e o Next sabe empacotá-lo a partir de um componente de cliente. Tentar carregá-lo
 * junto, com `await import`, não compila: TypeScript não tem tipo para módulo CSS.
 *
 * Sem esta linha o mapa aparece, e aparece QUEBRADO — tiles empilhados fora de lugar, controles sem
 * moldura. Parece defeito de código e é folha de estilo faltando.
 */
import "leaflet/dist/leaflet.css";

/**
 * O MAPA DAS POSIÇÕES — o alfinete de cada caminhão (2026-08-26, a pedido).
 *
 * Nasceu de uma tela do eTorre que o usuário mostrou: ao atribuir, a gerenciadora exibe os veículos
 * disponíveis num mapa, com a distância até a origem ao lado. Este é o mesmo mapa, com os dados que
 * o `getPosicoes` da Integra já nos dá.
 *
 * ── LEAFLET DIRETO, SEM `react-leaflet` ───────────────────────────────────────────────────────
 *
 * Uma dependência a menos, e a que ficou é a que faz o trabalho. `react-leaflet` existe para tratar
 * o mapa como árvore de componentes; aqui o mapa tem UMA camada e uma lista de alfinetes, e o
 * proveito não paga o pacote a mais numa base que até hoje não tinha nenhuma biblioteca visual.
 *
 * ── O IMPORT É DINÂMICO, E NÃO É CAPRICHO ─────────────────────────────────────────────────────
 *
 * O Leaflet toca `window` ao ser carregado. Importado no topo, ele quebra a renderização de
 * servidor do Next com `window is not defined` — e quebra no BUILD, não em execução. Carregado
 * dentro do efeito, só existe no navegador, que é onde ele faz sentido.
 *
 * ── OS TILES SÃO DO OPENSTREETMAP ─────────────────────────────────────────────────────────────
 *
 * O mesmo servidor que a gerenciadora usa. É um serviço voluntário, com política que pede uso
 * modesto — meia dúzia de pessoas olhando o mapa está dentro, e a atribuição no rodapé é exigência
 * da licença, não enfeite.
 *
 * Se um dia houver CSP neste app, `tile.openstreetmap.org` precisa entrar na lista de `img-src`.
 * Sem isso o mapa fica cinza e nada explica por quê.
 */

export interface PontoNoMapa {
  id: string;
  latitude: number;
  longitude: number;
  /** O que aparece ao clicar no alfinete. Texto simples — nada de HTML de fora. */
  titulo: string;
  detalhe?: string;
  /** Destacado: alfinete maior e em cor de destaque. Para a linha selecionada na lista ao lado. */
  destaque?: boolean;
}

export function MapaDePosicoes({
  pontos,
  altura = "24rem",
  aoClicar,
}: {
  pontos: readonly PontoNoMapa[];
  altura?: string;
  aoClicar?: (id: string) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const alfinetes = useRef<Marker[]>([]);

  useEffect(() => {
    let vivo = true;
    let limpar: (() => void) | undefined;

    void (async () => {
      const L = await import("leaflet");
      if (!vivo || !caixa.current) return;

      if (!mapa.current) {
        // Centro no Brasil, afastado: o primeiro `fitBounds` corrige assim que houver pontos, e um
        // mapa que abre no oceano por um instante parece defeito.
        mapa.current = L.map(caixa.current, { attributionControl: true }).setView(
          [-15.8, -47.9],
          4,
        );
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(mapa.current);
      }

      const m = mapa.current;
      for (const a of alfinetes.current) a.remove();
      alfinetes.current = [];

      for (const p of pontos) {
        /**
         * CÍRCULO, e não o alfinete padrão do Leaflet.
         *
         * O ícone padrão vem de um PNG que o Leaflet monta por caminho relativo, e sob o bundler do
         * Next esse caminho quebra — o resultado é um mapa de alfinetes invisíveis, um clássico. O
         * `circleMarker` é desenhado, não carregado, e não depende de arquivo nenhum.
         */
        const alfinete = L.circleMarker([p.latitude, p.longitude], {
          radius: p.destaque ? 9 : 6,
          weight: 2,
          color: p.destaque ? "#b91c1c" : "#1d4ed8",
          fillColor: p.destaque ? "#ef4444" : "#3b82f6",
          fillOpacity: 0.85,
        }).addTo(m);

        // `bindPopup` com string montada por nós, nunca com dado cru: o texto vem do banco, e
        // interpolar sem escapar seria injeção de HTML no mapa.
        alfinete.bindPopup(
          `<b>${escapar(p.titulo)}</b>${p.detalhe ? `<br>${escapar(p.detalhe)}` : ""}`,
        );
        if (aoClicar) alfinete.on("click", () => aoClicar(p.id));
        alfinetes.current.push(alfinete as unknown as Marker);
      }

      if (pontos.length > 0) {
        m.fitBounds(
          L.latLngBounds(pontos.map((p) => [p.latitude, p.longitude] as [number, number])),
          { padding: [30, 30], maxZoom: 12 },
        );
      }

      /**
       * O mapa precisa se REMEDIR quando o contêiner muda de tamanho.
       *
       * Aberto dentro de um diálogo ou de uma aba, ele nasce com altura zero e desenha os tiles
       * errados — o sintoma é meio mapa cinza que só conserta ao redimensionar a janela.
       */
      const observador = new ResizeObserver(() => m.invalidateSize());
      observador.observe(caixa.current);
      limpar = () => observador.disconnect();
    })();

    return () => {
      vivo = false;
      limpar?.();
    };
  }, [pontos, aoClicar]);

  /**
   * O mapa NÃO é destruído a cada mudança de pontos — só quando o componente sai.
   *
   * Recriá-lo redefiniria o enquadramento a cada carga, e como a lista recarrega sozinha, o mapa
   * daria um pulo de dez em dez segundos enquanto alguém tenta olhar.
   */
  useEffect(() => {
    return () => {
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []);

  return <div ref={caixa} style={{ height: altura }} className="w-full rounded-md border" />;
}

/** O texto vem do banco e entra em HTML. Escapar é obrigatório, não zelo. */
function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
