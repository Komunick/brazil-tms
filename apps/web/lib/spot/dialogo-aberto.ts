"use client";

import { useEffect, useState } from "react";

/**
 * HÁ UM DIÁLOGO ABERTO AGORA? — o sinal de "estou no meio de um gesto" (2026-09-01).
 *
 * ── POR QUE OLHAR O DOM, e não uma lista de telas ─────────────────────────────────────────────
 *
 * O pedido foi que o cartão de spot nascesse recolhido "na tela de atribuição". Atribuir não é uma
 * tela: é o `portal-assign-dialog`, que abre de dentro da Expedição, da Torre e da lista de viagens.
 * Uma lista de rotas erraria nas três, e erraria de novo na próxima tela que ganhasse o botão.
 *
 * O que se quer saber é mais simples e mais estável: **tem alguém no meio de alguma coisa?** Todo
 * diálogo do TMS passa pelo mesmo `DialogContent`, e o Radix marca o aberto com `data-state="open"`.
 * Uma pergunta ao DOM responde por todos, inclusive os que ainda não existem.
 *
 * ── O CUSTO, e como ele fica pequeno ──────────────────────────────────────────────────────────
 *
 * Observar o `body` inteiro parece caro: a leitura do plano reescreve tabelas a cada cinco segundos
 * e cada linha vira mutação. Por isso a conferência é adiada para o quadro seguinte e há no máximo
 * uma por quadro — uma rajada de trezentas mutações custa um `querySelector`, não trezentos.
 *
 * O filtro de atributos ajuda no mesmo sentido: só `data-state` interessa, e não as classes que
 * mudam a cada render.
 */

/** Todo diálogo do TMS passa pelo `DialogContent`, e o Radix o marca assim. */
const ABERTO = '[role="dialog"][data-state="open"]';

export function useDialogoAberto(): boolean {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let agendado = false;

    const conferir = () => {
      agendado = false;
      setAberto(document.querySelector(ABERTO) !== null);
    };

    /* No máximo uma conferência por quadro, por mais mutações que cheguem juntas. */
    const agendar = () => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(conferir);
    };

    conferir();
    const observador = new MutationObserver(agendar);
    observador.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    return () => observador.disconnect();
  }, []);

  return aberto;
}
