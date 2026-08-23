"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * O PAINEL DE CADA UM (2026-08-23, a pedido): quais cartões esta pessoa escondeu.
 *
 * NO BANCO, e não em cookie — que é o que o menu recolhido usa. A diferença importa aqui: cookie é
 * do NAVEGADOR, e a operação compartilha máquina. Dois operadores no mesmo computador veriam o
 * painel um do outro, e o segundo desfaria a escolha do primeiro sem perceber. A preferência é da
 * pessoa, então segue a pessoa — inclusive quando ela senta em outra máquina.
 *
 * O preço é uma requisição a mais no carregamento, e ele é pago com `staleTime: Infinity`: a
 * escolha só muda quando é esta tela que a muda, então não há motivo para reconsultar.
 */

const CHAVE = ["painel-do-usuario"] as const;

interface Resposta {
  hidden: string[];
}

async function ler(): Promise<Resposta> {
  const res = await fetch("/api/me/dashboard-prefs");
  if (!res.ok) throw new Error("PREFS_READ_FAILED");
  return (await res.json()) as Resposta;
}

export interface PainelDoUsuario {
  /** As chaves escondidas. Vazio enquanto carrega — o padrão é MOSTRAR tudo. */
  escondidos: Set<string>;
  /** Já sabemos o que esta pessoa escondeu? Antes disso a tela não deve piscar cartões. */
  carregado: boolean;
  alternar: (chave: string) => void;
  restaurarPadrao: () => void;
}

export function usePainelDoUsuario(): PainelDoUsuario {
  const queryClient = useQueryClient();
  const { data, isSuccess } = useQuery({
    queryKey: CHAVE,
    queryFn: ler,
    staleTime: Infinity,
    /**
     * Falhou a leitura? O painel aparece INTEIRO. É o desfecho certo: um cartão a mais é ruído, um
     * cartão a menos é informação perdida sem aviso — e ninguém desconfia de um painel que parece
     * completo.
     */
    retry: 1,
  });

  const escondidos = useMemo(() => new Set(data?.hidden ?? []), [data]);

  /**
   * Grava a lista inteira e pinta a tela ANTES da resposta.
   *
   * Marcar um cartão e esperar o servidor para ver o efeito faria a pessoa clicar duas vezes. Se a
   * gravação falhar, o `onError` devolve a lista que estava valendo — a tela volta ao que o banco
   * tem, em vez de mentir que guardou.
   */
  const salvar = useMutation({
    mutationFn: async (hidden: string[]) => {
      const res = await fetch("/api/me/dashboard-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      if (!res.ok) throw new Error("PREFS_WRITE_FAILED");
      return (await res.json()) as Resposta;
    },
    onMutate: async (hidden: string[]) => {
      await queryClient.cancelQueries({ queryKey: CHAVE });
      const anterior = queryClient.getQueryData<Resposta>(CHAVE);
      queryClient.setQueryData<Resposta>(CHAVE, { hidden });
      return { anterior };
    },
    onError: (_erro, _novo, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData<Resposta>(CHAVE, contexto.anterior);
    },
    onSuccess: (resposta) => queryClient.setQueryData<Resposta>(CHAVE, resposta),
  });

  const alternar = useCallback(
    (chave: string) => {
      const proximo = new Set(escondidos);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      salvar.mutate([...proximo]);
    },
    [escondidos, salvar],
  );

  const restaurarPadrao = useCallback(() => salvar.mutate([]), [salvar]);

  return { escondidos, carregado: isSuccess, alternar, restaurarPadrao };
}
