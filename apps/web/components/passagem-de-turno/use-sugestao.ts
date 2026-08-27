"use client";

import { useCallback, useRef, useState } from "react";
import { type Setor, type Sugestao, aplicarSugestao } from "@brazil-tms/shared";

/**
 * O PREENCHIMENTO AUTOMÁTICO DO ITEM (2026-08-27, a pedido).
 *
 * Digitou a LH e saiu do campo: origem, destino, ETA da coleta, motorista, placa e rota aparecem.
 * Na planilha isso são seis campos copiados do portal, um por um.
 *
 * ── O GATILHO É SAIR DO CAMPO, NÃO DIGITAR ────────────────────────────────────────────────────
 *
 * Buscar a cada tecla mandaria treze requisições para escrever uma LH, e doze delas com um código
 * incompleto que não existe — a tela ficaria piscando "não encontrei" enquanto a pessoa digita, que
 * é ruído puro. Ao sair do campo há exatamente uma busca, com o valor final.
 *
 * ── E O RESULTADO NUNCA SOBRESCREVE ───────────────────────────────────────────────────────────
 *
 * Quem decide isso é `aplicarSugestao`, no pacote compartilhado, com teste. Aqui só se pergunta e
 * se entrega o que voltou.
 */

export interface ResultadoDaSugestao {
  /** O rascunho já com os campos vazios preenchidos. */
  dados: Record<string, string>;
  /** Quais campos foram preenchidos agora — a tela precisa disso para dizer o que aconteceu. */
  preenchidos: string[];
  /** `true` quando a LH não existe em viagem nem em oferta de spot. Quase sempre é erro de digitação. */
  naoAchou: boolean;
}

export function useSugestao(setor: Setor, secaoChave: string) {
  const [buscando, setBuscando] = useState(false);
  /**
   * A ÚLTIMA BUSCA GANHA.
   *
   * Duas buscas em voo acontecem de verdade: a pessoa corrige a LH e sai do campo antes de a
   * primeira responder. Sem este contador, a resposta ATRASADA da LH errada chegaria por último e
   * preencheria o item com a viagem que ela acabou de descartar — e a tela não teria como saber.
   */
  const geracao = useRef(0);

  const buscar = useCallback(
    async (
      campo: "lh" | "motorista",
      valor: string,
      dados: Record<string, string>,
    ): Promise<ResultadoDaSugestao | null> => {
      const limpo = valor.trim();
      if (limpo === "") return null;

      const minha = ++geracao.current;
      setBuscando(true);
      try {
        const p = new URLSearchParams({ [campo]: limpo });
        const res = await fetch(`/api/passagem-de-turno/sugestao?${p}`);
        if (!res.ok) return null;

        const corpo = (await res.json()) as { sugestao: Sugestao | null };
        // Chegou depois de outra busca ter começado: esta resposta é de um valor já descartado.
        if (minha !== geracao.current) return null;

        if (!corpo.sugestao) {
          /*
           * "Não achei" só vale para a LH.
           *
           * Um nome de motorista que não casa é o normal — o cadastro tem homônimo, e a regra é
           * recusar quando dois batem. Avisar ali seria acusar a pessoa de errar quando ela
           * escreveu certo.
           */
          return { dados, preenchidos: [], naoAchou: campo === "lh" };
        }

        const r = aplicarSugestao(setor, secaoChave, dados, corpo.sugestao);
        return { ...r, naoAchou: false };
      } catch {
        // Rede caída não é erro de quem digitou: o campo continua editável e nada é dito.
        return null;
      } finally {
        if (minha === geracao.current) setBuscando(false);
      }
    },
    [setor, secaoChave],
  );

  return { buscar, buscando };
}
