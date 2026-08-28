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

/**
 * O ESTADO DO VEÍCULO, que é o que a COR passa a dizer (2026-08-28, a pedido).
 *
 * Antes eram dois tons — azul e vermelho — e eles diziam apenas QUAL LINHA DA LISTA estava
 * selecionada. Do lado de fora isso não significava nada: o pedido foi literalmente "o que
 * significam esses pontos azuis e vermelhos, está sem sentido".
 *
 * Agora a cor responde a pergunta que alguém faz olhando um mapa de caminhões: este aqui está
 * andando? A resposta vem da ignição JUNTO da velocidade (ver `VeiculoNoMapa.velocidade`), e a
 * seleção deixou de ser cor — virou anel, que é o certo: selecionar é estado da TELA, mover é
 * estado do MUNDO, e os dois disputando o mesmo canal foi o que tornou o mapa ilegível.
 */
export type EstadoNoMapa =
  /** Ignição ligada e com velocidade: está rodando. */
  | "rodando"
  /** Ignição ligada e sem velocidade: motor rodando e parado — carga, fila, marcha lenta. */
  | "ligado_parado"
  /** Ignição desligada. */
  | "desligado"
  /** Sem sinal de ignição, ou posição velha demais para valer. */
  | "sem_sinal";

export interface PontoNoMapa {
  id: string;
  latitude: number;
  longitude: number;
  /** O que aparece ao clicar no alfinete. Texto simples — nada de HTML de fora. */
  titulo: string;
  detalhe?: string;
  /** As linhas do balão, uma por linha. Texto simples: elas são escapadas antes de virar HTML. */
  linhas?: readonly string[];
  estado?: EstadoNoMapa;
  /** Destacado: alfinete maior e com anel. Para a linha selecionada na lista ao lado. */
  destaque?: boolean;
}

/**
 * As cores do estado.
 *
 * Verde anda, âmbar está ligado e parado, cinza está desligado, cinza claro perdeu o sinal. É a
 * mesma escala de um painel de frota, e nenhuma delas quer dizer "bom" ou "ruim" — um caminhão
 * desligado às três da manhã está certo.
 */
const COR: Record<EstadoNoMapa, { borda: string; dentro: string }> = {
  rodando: { borda: "#15803d", dentro: "#22c55e" },
  ligado_parado: { borda: "#b45309", dentro: "#f59e0b" },
  desligado: { borda: "#475569", dentro: "#94a3b8" },
  sem_sinal: { borda: "#94a3b8", dentro: "#e2e8f0" },
};

export function MapaDePosicoes({
  pontos,
  altura = "24rem",
  aoClicar,
  focoNoId,
}: {
  pontos: readonly PontoNoMapa[];
  altura?: string;
  aoClicar?: (id: string) => void;
  /**
   * O ponto para onde o mapa deve VOAR, e cujo balão deve abrir (2026-08-28, a pedido).
   *
   * O pedido foi "quando clicar no nome do cara, direcionar onde ele está no mapa". Sem isto, a
   * lista e o mapa eram duas coisas ao lado uma da outra: clicar destacava um ponto que podia
   * estar fora do enquadramento, e a pessoa tinha de caçá-lo.
   *
   * Vem de FORA como id, e não como uma função imperativa `irPara()`: assim a lista não precisa
   * de referência ao mapa, e o estado de "quem está selecionado" mora num lugar só.
   */
  focoNoId?: string | null;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const alfinetes = useRef<Marker[]>([]);
  /** Por id, para o efeito do foco achar o alfinete sem varrer a lista toda. */
  const porId = useRef(new Map<string, Marker>());
  /**
   * O ENQUADRAMENTO INICIAL ACONTECE UMA VEZ.
   *
   * A lista recarrega sozinha, e reenquadrar a cada carga desfaria o zoom de quem está olhando —
   * ou pior, cancelaria o voo que o clique acabou de fazer.
   */
  const jaEnquadrou = useRef(false);

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
      porId.current.clear();

      for (const p of pontos) {
        /**
         * CÍRCULO, e não o alfinete padrão do Leaflet.
         *
         * O ícone padrão vem de um PNG que o Leaflet monta por caminho relativo, e sob o bundler do
         * Next esse caminho quebra — o resultado é um mapa de alfinetes invisíveis, um clássico. O
         * `circleMarker` é desenhado, não carregado, e não depende de arquivo nenhum.
         */
        /*
         * A COR DIZ O ESTADO; a SELEÇÃO é o anel.
         *
         * Antes as duas coisas dividiam o mesmo canal — azul virava vermelho ao selecionar —, e o
         * resultado era um mapa em que a cor não significava nada do mundo real. Agora o preenchimento
         * responde "está andando?" e o contorno grosso responde "é este que você clicou".
         */
        const cor = COR[p.estado ?? "sem_sinal"];
        const alfinete = L.circleMarker([p.latitude, p.longitude], {
          radius: p.destaque ? 10 : 6,
          weight: p.destaque ? 4 : 2,
          color: p.destaque ? "#0f172a" : cor.borda,
          fillColor: cor.dentro,
          fillOpacity: 0.9,
        }).addTo(m);

        /*
         * O BALÃO COM TUDO O QUE A GERENCIADORA MOSTRA (2026-08-28, a pedido).
         *
         * Era título e uma linha. O pedido foi ver "as informações que a Logae fala ao clicar no
         * ícone dele" — placa, motorista, se está andando e a quantos, onde, e de quando é a posição.
         *
         * Cada pedaço é ESCAPADO. O texto vem do banco, e interpolar cru aqui seria injeção de HTML
         * dentro do mapa — o `escapar` não é zelo, é a única defesa deste caminho.
         */
        const corpo = (p.linhas ?? (p.detalhe ? [p.detalhe] : []))
          .filter(Boolean)
          .map((linha) => escapar(linha))
          .join("<br>");
        alfinete.bindPopup(
          `<b>${escapar(p.titulo)}</b>${corpo ? `<br>${corpo}` : ""}`,
          { maxWidth: 260 },
        );
        if (aoClicar) alfinete.on("click", () => aoClicar(p.id));
        alfinetes.current.push(alfinete as unknown as Marker);
        porId.current.set(p.id, alfinete as unknown as Marker);
      }

      /*
       * ENQUADRA UMA VEZ SÓ.
       *
       * A lista recarrega sozinha. Reenquadrar a cada carga desfaria o zoom de quem está olhando e
       * cancelaria o voo que o clique na lista acabou de fazer — o mapa "pulava de volta" sozinho.
       */
      if (pontos.length > 0 && !jaEnquadrou.current) {
        jaEnquadrou.current = true;
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
   * VOAR ATÉ O ESCOLHIDO E ABRIR O BALÃO DELE (2026-08-28, a pedido).
   *
   * Efeito separado, dependendo só do id: junto do desenho dos alfinetes, ele voaria de novo a cada
   * recarga da lista, e o mapa ficaria puxando a tela de volta enquanto alguém tenta arrastar.
   *
   * `flyTo` e não `setView`: a animação mostra PARA ONDE o mapa foi. Um salto instantâneo entre dois
   * pontos distantes do país faz quem olha perder a referência de onde estava.
   *
   * O zoom vai a 11 no máximo — perto o bastante para ver a cidade, longe o bastante para não
   * cair numa rua sem contexto.
   */
  useEffect(() => {
    if (!focoNoId) return;
    const m = mapa.current;
    const alvo = porId.current.get(focoNoId);
    if (!m || !alvo) return;
    m.flyTo(alvo.getLatLng(), Math.max(m.getZoom(), 11), { duration: 0.6 });
    alvo.openPopup();
  }, [focoNoId, pontos]);

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
