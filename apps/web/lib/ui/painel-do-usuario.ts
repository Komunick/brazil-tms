"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * O PAINEL DE CADA UM (2026-08-23, a pedido): o que esta pessoa escondeu e o que deixou encolhido.
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
  minimized: string[];
}

async function ler(): Promise<Resposta> {
  const res = await fetch("/api/me/dashboard-prefs");
  if (!res.ok) throw new Error("PREFS_READ_FAILED");
  const corpo = (await res.json()) as Partial<Resposta>;
  return { hidden: corpo.hidden ?? [], minimized: corpo.minimized ?? [] };
}

export interface PainelDoUsuario {
  /** As chaves escondidas. Vazio enquanto carrega — o padrão é MOSTRAR tudo. */
  escondidos: Set<string>;
  /** As chaves encolhidas. Vazio enquanto carrega — o padrão é o cartão INTEIRO. */
  minimizados: Set<string>;
  /** Já sabemos o que esta pessoa escolheu? Antes disso a tela não deve piscar cartões. */
  carregado: boolean;
  alternar: (chave: string) => void;
  alternarMinimizado: (chave: string) => void;
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
  const minimizados = useMemo(() => new Set(data?.minimized ?? []), [data]);

  /**
   * Grava o estado inteiro e pinta a tela ANTES da resposta.
   *
   * Marcar um cartão e esperar o servidor para ver o efeito faria a pessoa clicar duas vezes. Se a
   * gravação falhar, o `onError` devolve o que estava valendo — a tela volta ao que o banco tem, em
   * vez de mentir que guardou.
   */
  const salvar = useMutation({
    mutationFn: async (proximo: Resposta) => {
      const res = await fetch("/api/me/dashboard-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proximo),
      });
      if (!res.ok) throw new Error("PREFS_WRITE_FAILED");
      return (await res.json()) as Resposta;
    },
    onMutate: async (proximo: Resposta) => {
      await queryClient.cancelQueries({ queryKey: CHAVE });
      const anterior = queryClient.getQueryData<Resposta>(CHAVE);
      queryClient.setQueryData<Resposta>(CHAVE, proximo);
      return { anterior };
    },
    onError: (_erro, _novo, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData<Resposta>(CHAVE, contexto.anterior);
    },
    onSuccess: (resposta) => queryClient.setQueryData<Resposta>(CHAVE, resposta),
  });

  /**
   * Uma chave entra ou sai de UMA das listas, e a outra vai junto sem mudar.
   *
   * O PUT grava o estado inteiro, então mandar só a lista mexida apagaria a outra — o tipo de perda
   * que ninguém liga ao clique que a causou.
   */
  const alternarEm = useCallback(
    (campo: "hidden" | "minimized", chave: string) => {
      const atual: Resposta = { hidden: [...escondidos], minimized: [...minimizados] };
      const conjunto = new Set(atual[campo]);
      if (conjunto.has(chave)) conjunto.delete(chave);
      else conjunto.add(chave);
      salvar.mutate({ ...atual, [campo]: [...conjunto] });
    },
    [escondidos, minimizados, salvar],
  );

  const alternar = useCallback((chave: string) => alternarEm("hidden", chave), [alternarEm]);
  const alternarMinimizado = useCallback(
    (chave: string) => alternarEm("minimized", chave),
    [alternarEm],
  );

  /** Restaura só o que o editor mostra: os escondidos. O encolhido tem o próprio botão no cartão. */
  const restaurarPadrao = useCallback(
    () => salvar.mutate({ hidden: [], minimized: [...minimizados] }),
    [minimizados, salvar],
  );

  return {
    escondidos,
    minimizados,
    carregado: isSuccess,
    alternar,
    alternarMinimizado,
    restaurarPadrao,
  };
}
