"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * A ESTEIRA DE OFERTAS QUE ANDA SOZINHA (2026-09-01, a pedido).
 *
 * Os cartões acumulam para a direita. Quando não cabem na tela, a faixa desliza devagar para que
 * nenhuma oferta fique escondida atrás da borda — que é o defeito que a fila antiga tinha, só que
 * na horizontal.
 *
 * ── O PROBLEMA QUE ISTO PRECISA RESOLVER ANTES DE FUNCIONAR ──────────────────────────────────
 *
 * Uma esteira que anda FOGE DO CLIQUE. Você mira em Aceitar, ela desliza oito pixels, você erra —
 * ou pior, acerta o botão do cartão vizinho e abre a confirmação da LH errada. Um cartão que não
 * cabe na tela é um problema; um cartão que se move enquanto você mira nele é pior, porque parece
 * defeito do sistema.
 *
 * Por isso ela para em três situações, e as três são "alguém está mirando":
 *
 *   · o mouse entrou na faixa;
 *   · o foco do teclado entrou nela — quem navega por Tab não mexe o mouse, e sem isto a esteira
 *     continuaria andando embaixo de quem está justamente decidindo;
 *   · algum cartão está em confirmação, de aceite ou de ignorar.
 *
 * E ela só volta a andar `ESPERA_MS` depois que tudo isso passa. Voltar no instante em que o mouse
 * sai é quase tão ruim quanto não parar: quem tirou o mouse para ler ainda está lendo.
 *
 * ── E POR QUE `scrollLeft`, E NÃO UMA ANIMAÇÃO DE CSS ────────────────────────────────────────
 *
 * Porque a faixa também tem barra de rolagem: quem quiser arrastar ou usar a roda do mouse tem de
 * conseguir. Uma animação de `transform` roubaria isso — o conteúdo andaria por baixo de uma
 * rolagem que não sabe que ele se moveu.
 */

/** Pixels por quadro. A 60 fps, ~36 px/s: lento o bastante para dar tempo de ler a rota. */
const PASSO_PX = 0.6;

/** Quanto ela espera, depois de a pessoa sair, para voltar a andar. */
const ESPERA_MS = 1500;

export interface Esteira {
  /** `ref` para a faixa que rola. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Chamar quando o mouse ou o foco entram. */
  pausar: () => void;
  /** Chamar quando saem — ela volta a andar depois da espera. */
  soltar: () => void;
}

/**
 * @param travada Algo fora da faixa está segurando a esteira — tipicamente um cartão em
 * confirmação. Fica de fora do gancho de propósito: quem sabe disso é o componente, e passar o
 * fato é mais simples que fazer o gancho descobrir.
 */
export function useEsteira(travada: boolean): Esteira {
  const ref = useRef<HTMLDivElement | null>(null);
  const pausadaRef = useRef(false);
  const voltaEmRef = useRef(0);
  const travadaRef = useRef(travada);

  // O valor mais recente vive num `ref` porque o laço de animação é criado uma vez só: lê-lo da
  // closure devolveria para sempre o primeiro valor.
  travadaRef.current = travada;

  const pausar = useCallback(() => {
    pausadaRef.current = true;
  }, []);

  const soltar = useCallback(() => {
    pausadaRef.current = false;
    voltaEmRef.current = Date.now() + ESPERA_MS;
  }, []);

  useEffect(() => {
    let quadro = 0;

    const passo = () => {
      const faixa = ref.current;
      if (faixa && !pausadaRef.current && !travadaRef.current && Date.now() >= voltaEmRef.current) {
        const cabeTudo = faixa.scrollWidth <= faixa.clientWidth + 2;
        if (!cabeTudo) {
          faixa.scrollLeft += PASSO_PX;
          /*
            Chegou no fim: volta ao começo. Sem isto a esteira encostaria no último cartão e
            pararia — e as ofertas do começo, que são as mais antigas e portanto as mais urgentes,
            nunca mais voltariam à vista.
          */
          if (faixa.scrollLeft >= faixa.scrollWidth - faixa.clientWidth - 1) faixa.scrollLeft = 0;
        }
      }
      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, []);

  return { ref, pausar, soltar };
}
