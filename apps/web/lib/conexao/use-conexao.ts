"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { classificarConexao, type EstadoDaConexao } from "./diagnostico";

/**
 * A SONDA. É a única parte que fala com a rede; a régua que interpreta mora em `diagnostico.ts`.
 *
 * ── OS DOIS ALVOS, E POR QUE ESTES ───────────────────────────────────────────────────────────
 *
 * `/saude` é servido pelo CADDY, sem passar pelo Next (ver o Caddyfile da VM). É o que faz a sonda
 * continuar respondendo justamente quando o aplicativo é quem caiu — perguntar ao Next se o Next
 * está vivo só funciona enquanto ele está vivo, que é quando ninguém precisa perguntar.
 *
 * O alvo de fora existe porque sem um terceiro ponto não há como separar "o servidor caiu" de "a
 * minha internet caiu": os dois chegam aqui como o mesmo `fetch` que não voltou. `no-cors` de
 * propósito — a resposta vem opaca e não dá para ler nada dela, e é tudo que se quer: a pergunta é
 * "o pacote saiu da rede local e voltou?", não "o que o Google respondeu?".
 */
const ALVO_TMS = "/saude";
const ALVO_INTERNET = "https://www.gstatic.com/generate_204";

const TEMPO_LIMITE_MS = 5_000;

/**
 * De um minuto em um minuto quando está tudo bem, de quinze em quinze quando não está.
 *
 * Um minuto não é agressivo perto do que a tela já faz: o painel repete consultas de verdade a cada
 * poucos segundos (`refetchInterval`), e esta sonda é um arquivo estático de 52 ms que o Caddy
 * responde sem tocar em banco. Quando algo está errado o passo cai para quinze segundos, porque aí
 * a pergunta que importa é "já voltou?" e a resposta velha não serve.
 */
const PASSO_NORMAL_MS = 60_000;
const PASSO_DEGRADADO_MS = 15_000;

async function sondar(url: string, init: RequestInit): Promise<{ ok: boolean; ms: number }> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  const inicio = performance.now();
  try {
    const resposta = await fetch(url, { ...init, cache: "no-store", signal: controle.signal });
    // No `no-cors` a resposta é opaca (`type: "opaque"`, `ok: false` sempre): ter voltado já é a
    // prova que se procura. Na sonda do TMS, que é da mesma origem, dá para exigir o 200.
    const chegou = init.mode === "no-cors" ? true : resposta.ok;
    return { ok: chegou, ms: Math.round(performance.now() - inicio) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - inicio) };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * O estado da conexão para a barra de topo.
 *
 * Começa em `indefinido` e NÃO em `ok`: antes da primeira medição não se sabe de nada, e `ok` seria
 * uma afirmação que ninguém verificou. Como `indefinido` também não desenha nada, a tela fica
 * calada até ter o que dizer — que é o comportamento desejado nos dois casos.
 */
export function useConexao(): EstadoDaConexao {
  const [estado, setEstado] = useState<EstadoDaConexao>("indefinido");
  const rodando = useRef(false);
  const client = useQueryClient();

  const diagnosticar = useCallback(async () => {
    // Uma medição por vez. Sem isto, um erro em rajada (o painel tem várias consultas, e elas caem
    // juntas) dispararia uma sonda por consulta, justamente quando a rede está ruim.
    if (rodando.current) return;
    rodando.current = true;
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setEstado("sem_internet");
        return;
      }

      const tms = await sondar(ALVO_TMS, {});
      if (tms.ok) {
        setEstado(
          classificarConexao({
            temLink: true,
            tmsRespondeu: true,
            tmsMs: tms.ms,
            internetRespondeu: null,
          }),
        );
        return;
      }

      // O TMS falhou. Só agora o terceiro é consultado — e só aqui ele é necessário.
      const fora = await sondar(ALVO_INTERNET, { mode: "no-cors" });
      setEstado(
        classificarConexao({
          temLink: true,
          tmsRespondeu: false,
          tmsMs: null,
          internetRespondeu: fora.ok,
        }),
      );
    } finally {
      rodando.current = false;
    }
  }, []);

  // O navegador avisando que o link caiu ou voltou. É o sinal mais rápido que existe; medir logo
  // depois é o que transforma "voltou o cabo" em "voltou o sistema" sem a pessoa recarregar a aba.
  useEffect(() => {
    const aoMudar = () => void diagnosticar();
    window.addEventListener("online", aoMudar);
    window.addEventListener("offline", aoMudar);
    return () => {
      window.removeEventListener("online", aoMudar);
      window.removeEventListener("offline", aoMudar);
    };
  }, [diagnosticar]);

  /**
   * Uma consulta que falhou é o melhor gatilho que existe: é exatamente o momento em que a pessoa
   * viu algo não carregar e quer saber de quem é a culpa. Chegar ao aviso por aqui é mais rápido
   * que esperar o próximo passo do relógio.
   */
  useEffect(() => {
    return client.getQueryCache().subscribe((evento) => {
      if (evento.type === "updated" && evento.query.state.status === "error") {
        void diagnosticar();
      }
    });
  }, [client, diagnosticar]);

  /**
   * O passo do relógio muda com o estado, mas o relógio NÃO pode depender do estado.
   *
   * Pôr `estado` nas dependências do efeito abaixo parece natural e está errado: cada mudança
   * desmontaria o timer, remontaria e mediria de novo na hora — uma sonda extra a cada transição,
   * exatamente quando a rede está ruim e as transições são muitas. O ref dá o valor novo para o
   * cálculo do passo sem reexecutar o efeito.
   */
  const estadoRef = useRef(estado);
  estadoRef.current = estado;

  // O relógio. Não mede com a aba escondida: ninguém está lendo o aviso, e a sonda gastaria rede de
  // quem já pode estar com pouca. Ao voltar para a aba, mede na hora.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let vivo = true;

    const agendar = () => {
      const atual = estadoRef.current;
      const passo = atual === "ok" || atual === "indefinido" ? PASSO_NORMAL_MS : PASSO_DEGRADADO_MS;
      timer = setTimeout(async () => {
        if (!vivo) return;
        if (document.visibilityState === "visible") await diagnosticar();
        if (vivo) agendar();
      }, passo);
    };

    const aoVoltar = () => {
      if (document.visibilityState === "visible") void diagnosticar();
    };

    void diagnosticar();
    agendar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [diagnosticar]);

  return estado;
}
