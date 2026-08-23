"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ESTE NÚMERO ACABOU DE MUDAR? (2026-08-23, a pedido.)
 *
 * O painel se recarrega sozinho de minuto em minuto e os números trocam em SILÊNCIO. Numa tela que
 * fica aberta o dia inteiro — e numa TV, onde ninguém está com a mão no mouse — a troca acontece
 * enquanto a pessoa olha para outro canto, e o que mudou não se distingue do que sempre esteve ali.
 *
 * O realce responde a uma pergunta que a tela não respondia: onde é que a operação andou.
 *
 * ── NÃO ACENDE NA PRIMEIRA PINTURA ─────────────────────────────────────────────────────────────
 *
 * `anterior` começa nulo e a primeira leitura só o preenche. Sem isso, abrir a tela acenderia TODOS
 * os números de uma vez — que é exatamente o oposto de destacar o que mudou, e ensinaria a ignorar o
 * realce já no primeiro uso.
 *
 * ── E APAGA SOZINHO ────────────────────────────────────────────────────────────────────────────
 *
 * Um segundo e dois décimos: tempo de o olho ser puxado, não de virar enfeite piscando. O respeito a
 * "reduzir movimento" mora no CSS (`.realce-aceso`), e não aqui: quem desligou animação continua
 * vendo o número certo, só não vendo o brilho.
 */
export function useMudou(valor: number | string | null | undefined): boolean {
  const anterior = useRef<typeof valor | undefined>(undefined);
  const [aceso, setAceso] = useState(false);

  useEffect(() => {
    if (anterior.current === undefined) {
      anterior.current = valor;
      return;
    }
    if (anterior.current === valor) return;
    anterior.current = valor;
    setAceso(true);
    const relogio = setTimeout(() => setAceso(false), 1200);
    return () => clearTimeout(relogio);
  }, [valor]);

  return aceso;
}
