// ==UserScript==
// @name         Brazil TMS — alimentador do portal
// @namespace    braziltransports.com.br
// @version      1.0.0
// @description  Lê as duas listagens do portal do cliente e entrega ao TMS. Somente leitura.
// @match        https://logistics.myagencyservice.com.br/*
// @connect      tmsdev.braziltransports.com.br
// @connect      tms.braziltransports.com.br
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

/**
 * O robô (2026-08-16).
 *
 * Roda numa VM dedicada, dentro do Chrome já logado no portal do cliente. A cada poucos minutos ele
 * pergunta ao portal o que mudou e entrega a resposta CRUA ao TMS, que faz todo o resto. Nada aqui
 * decide o que acontece com uma viagem.
 *
 * Três regras que este arquivo NÃO pode quebrar:
 *
 *   1. SOMENTE LEITURA. Só existe GET, e só para as duas listagens. Nenhum clique, nenhum POST ao
 *      portal, nada de atribuir ou aceitar. Se um dia precisar escrever, não é aqui.
 *   2. BURRO DE PROPÓSITO. Nenhuma regra de negócio: não interpreta status, não decide o que é
 *      atraso, não filtra viagem. Atualizar script em VM é trabalho manual e não tem teste; a
 *      inteligência mora no TMS (`portal-api.ts`, sob teste).
 *   3. NUNCA TRAVA. Um ciclo é agendado a partir do FIM do anterior, todo erro é engolido e
 *      registrado, e nada é recursivo — uma falha de rede atrasa um ciclo, não mata o robô.
 *
 * Instalação: Tampermonkey → novo script → cole este arquivo → ajuste o CONFIG abaixo → salve. O
 * script sobe sozinho junto com a aba do portal.
 */

/* global GM_xmlhttpRequest */
(function () {
  "use strict";

  const CONFIG = {
    /** Endereço do TMS. Troque para o de produção quando for a hora. */
    tms: "https://tmsdev.braziltransports.com.br",
    /** O mesmo valor de PORTAL_FEED_TOKEN no servidor. Trocar aqui e lá ao mesmo tempo. */
    token: "COLE_AQUI_O_TOKEN",
    /** Código do cliente no TMS. */
    customerCode: "SHOPEE",
    /** De quanto em quanto tempo perguntar ao portal. */
    intervaloPlanoMs: 15 * 60 * 1000,
    intervaloExecucaoMs: 5 * 60 * 1000,
    /** Viagens por página. O portal aceita 100; o TMS aplica uma página por vez. */
    porPagina: 100,
    /** Quantas páginas no máximo por ciclo — trava de segurança contra laço infinito. */
    maxPaginas: 10,
    /** Janela do plano: de ontem até uma semana à frente. */
    planoDiasAtras: 1,
    planoDiasAdiante: 7,
    /** Janela da execução: o que mudou nas últimas horas (o portal filtra por mtime). */
    execucaoHorasAtras: 6,
  };

  const log = (...a) => console.log("[TMS robô]", ...a);
  const erro = (...a) => console.warn("[TMS robô]", ...a);

  /** O id da estação que o próprio portal guarda — nunca fixo no código. */
  function estacao() {
    const id = localStorage.getItem("stationId");
    if (!id) throw new Error("stationId não encontrado: a sessão do portal caiu?");
    return id;
  }

  const agora = () => Math.floor(Date.now() / 1000);
  const DIA = 86400;

  /** Uma página de uma das duas listagens. Somente GET, com a sessão do próprio navegador. */
  async function buscarPagina(caminho, filtro, pagina) {
    const u = new URL(caminho, location.origin);
    for (const [k, v] of Object.entries(filtro)) u.searchParams.set(k, String(v));
    u.searchParams.set("pageno", String(pagina));
    u.searchParams.set("count", String(CONFIG.porPagina));
    u.searchParams.set("agency_current_station_id", estacao());

    const r = await fetch(u.toString(), { credentials: "include" });
    if (!r.ok) throw new Error(`portal respondeu HTTP ${r.status}`);
    return r.json();
  }

  /**
   * Entrega uma página ao TMS. `GM_xmlhttpRequest` em vez de `fetch` porque a chamada é
   * cross-origin: assim o TMS não precisa abrir CORS para o domínio do cliente.
   */
  function entregar(modo, payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.tms}/api/imports/portal-feed`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.token}`,
        },
        data: JSON.stringify({ mode: modo, customerCode: CONFIG.customerCode, payload }),
        timeout: 120000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            let corpo = {};
            try { corpo = JSON.parse(res.responseText); } catch { /* resumo é opcional */ }
            resolve(corpo);
          } else {
            reject(new Error(`TMS respondeu ${res.status}: ${String(res.responseText).slice(0, 200)}`));
          }
        },
        onerror: () => reject(new Error("falha de rede ao falar com o TMS")),
        ontimeout: () => reject(new Error("TMS não respondeu a tempo")),
      });
    });
  }

  /** Um ciclo: pagina a listagem e entrega cada página. Devolve o que aconteceu, para o log. */
  async function ciclo(modo, caminho, filtro) {
    let paginas = 0;
    let viagens = 0;
    const estacoesDesconhecidas = new Set();

    for (let pagina = 1; pagina <= CONFIG.maxPaginas; pagina += 1) {
      const payload = await buscarPagina(caminho, filtro, pagina);
      const lista = payload?.data?.list ?? [];
      if (lista.length === 0) break;

      const resumo = await entregar(modo, payload);
      paginas += 1;
      viagens += lista.length;
      for (const e of resumo?.unknownStations ?? []) estacoesDesconhecidas.add(e);

      // Última página: o portal já disse quantas existem no total.
      const total = payload?.data?.total ?? 0;
      if (pagina * CONFIG.porPagina >= total) break;
    }

    return { paginas, viagens, estacoesDesconhecidas: [...estacoesDesconhecidas] };
  }

  /**
   * Agenda o próximo ciclo A PARTIR DO FIM deste — nunca em paralelo com ele mesmo. Se um ciclo
   * demora mais que o intervalo, o seguinte simplesmente começa depois; nada se acumula, nada
   * recursa, e um erro não interrompe a corrente.
   */
  function repetir(nome, intervaloMs, tarefa) {
    let rodando = false;
    const passo = async () => {
      if (rodando) return;
      rodando = true;
      const t0 = Date.now();
      try {
        const r = await tarefa();
        log(`${nome}: ${r.viagens} viagens em ${r.paginas} página(s), ${Math.round((Date.now() - t0) / 1000)}s`);
        if (r.estacoesDesconhecidas.length) {
          erro(`${nome}: estações sem cadastro no TMS →`, r.estacoesDesconhecidas.join(", "));
        }
      } catch (e) {
        erro(`${nome} falhou (tenta de novo no próximo ciclo):`, e?.message ?? e);
      } finally {
        rodando = false;
        setTimeout(passo, intervaloMs);
      }
    };
    setTimeout(passo, 5000); // deixa a página assentar antes do primeiro ciclo
  }

  log("ativo. Somente leitura: duas listagens, nenhum clique.");

  repetir("plano", CONFIG.intervaloPlanoMs, () =>
    ciclo("plan", "/api/line_haul/agency/trip/list", {
      query_type: 1,
      sta: `${agora() - CONFIG.planoDiasAtras * DIA},${agora() + CONFIG.planoDiasAdiante * DIA}`,
    }),
  );

  repetir("execução", CONFIG.intervaloExecucaoMs, () =>
    ciclo("execution", "/api/line_haul/agency/trip/history/list", {
      mtime: `${agora() - CONFIG.execucaoHorasAtras * 3600},${agora()}`,
    }),
  );
})();
