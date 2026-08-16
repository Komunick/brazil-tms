// ==UserScript==
// @name         Brazil TMS — alimentador do portal
// @namespace    braziltransports.com.br
// @version      1.5.0
// @description  Lê as três listagens do portal do cliente e entrega ao TMS. Somente leitura.
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
 *   1. SOMENTE LEITURA. Só existe GET, e só para as três listagens — planejado, em curso e
 *      concluído. Nenhum clique, nenhum POST ao portal, nada de atribuir ou aceitar. Se um dia
 *      precisar escrever, não é aqui.
 *   2. BURRO DE PROPÓSITO. Nenhuma regra de negócio: não interpreta status, não decide o que é
 *      atraso, não filtra viagem. Atualizar script em VM é trabalho manual e não tem teste; a
 *      inteligência mora no TMS (`portal-api.ts`, sob teste).
 *   3. NUNCA TRAVA E SE CURA. Um ciclo é agendado a partir do FIM do anterior, todo erro é engolido
 *      e registrado, e nada é recursivo. A primeira varredura de execução olha 30 dias para trás,
 *      então qualquer interrupção se resolve sozinha no arranque seguinte.
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
    /**
     * Teto de páginas por ciclo — trava contra laço infinito. Precisa caber a varredura de arranque
     * (30 dias ≈ 2.400 viagens no histórico observado), com folga. Bater o teto NÃO é silencioso.
     */
    maxPaginas: 40,
    /** Janela do plano: de ontem até uma semana à frente. */
    planoDiasAtras: 1,
    planoDiasAdiante: 7,
    /**
     * A aba "Aceito" — as viagens que estão ACONTECENDO agora (2026-08-16).
     *
     * O portal tem três abas e o robô lia duas. As 73 viagens em curso ficavam invisíveis: elas saem
     * do Planejado assim que são aceitas e só reaparecem no Concluído quando terminam. Enquanto
     * isso, o TMS achava que 73 caminhões nunca tinham chegado para carregar — e alertava por isso,
     * embora o portal registrasse chegada, carga e partida de cada um.
     *
     * Entra como `in_progress` (1.5.0). Entrava como execução, e aí o TMS não podia criar viagem a
     * partir daqui: 49 das 73 nem existiam nele, porque foram aceitas antes de alguém olhar o
     * Planejado. Iam rodar e terminar fora do sistema.
     */
    intervaloEmCursoMs: 5 * 60 * 1000,
    emCursoDiasAtras: 3,
    emCursoDiasAdiante: 7,
    /** Janela da execução: o que mudou nas últimas horas (o portal filtra por mtime). */
    execucaoHorasAtras: 6,
    /**
     * A PRIMEIRA execução depois que o robô sobe olha muito mais para trás — 30 dias.
     *
     * Uma janela de 6 horas é ótima em regime, e péssima depois de qualquer interrupção: o robô
     * fora do ar por sete horas (reinício, queda de rede, VM reiniciada) perderia para sempre tudo
     * o que aconteceu no intervalo, porque o portal filtra por data de MODIFICAÇÃO e uma viagem
     * concluída não é modificada de novo. Uma varredura larga no arranque faz o robô se curar
     * sozinho, e é barata: acontece uma vez por sessão.
     */
    execucaoHorasPrimeiroCiclo: 24 * 30,
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
            try {
              corpo = JSON.parse(res.responseText);
            } catch {
              /* resumo é opcional */
            }
            resolve(corpo);
          } else {
            reject(
              new Error(`TMS respondeu ${res.status}: ${String(res.responseText).slice(0, 200)}`),
            );
          }
        },
        onerror: () => reject(new Error("falha de rede ao falar com o TMS")),
        ontimeout: () => reject(new Error("TMS não respondeu a tempo")),
      });
    });
  }

  /**
   * O detalhe de UMA viagem — a única coisa que exige uma chamada por viagem.
   *
   * Só o detalhe traz o "Operador de atribuição". Buscar isso para as 500 viagens de cada ciclo
   * seria absurdo; então o TMS responde quais ainda faltam (`needDetail`) e o robô busca só essas.
   * A lista encolhe sozinha até zerar.
   */
  async function detalharViagens(numerosLH, lista) {
    // O detalhe é buscado pelo id NUMÉRICO do portal, e o TMS só conhece o número da LH. A ponte
    // entre os dois está na própria página que acabou de ser lida.
    const idPorNumero = new Map((lista ?? []).map((t) => [t.trip_number, t.id]));
    let feitos = 0;
    // Toda falha aqui é CONTADA e dita no fim. A primeira versão engolia tudo em silêncio, e o
    // resultado foi um "zero gravados" sem nenhuma pista de onde a corrente arrebentava.
    const falhas = { semId: 0, httpDoPortal: 0, retcodeDoPortal: 0, aoEntregar: 0 };
    let ultimoErro = "";
    for (const numero of numerosLH) {
      const id = idPorNumero.get(numero);
      if (!id) {
        falhas.semId += 1;
        continue;
      }
      try {
        const u = new URL("/api/line_haul/agency/trip/detail", location.origin);
        u.searchParams.set("trip_id", String(id));
        u.searchParams.set("agency_current_station_id", estacao());
        const r = await fetch(u.toString(), { credentials: "include" });
        if (!r.ok) {
          falhas.httpDoPortal += 1;
          ultimoErro = `portal HTTP ${r.status}`;
          continue;
        }
        const payload = await r.json();
        if (payload?.retcode !== 0) {
          falhas.retcodeDoPortal += 1;
          ultimoErro = `portal retcode ${payload?.retcode}`;
          continue;
        }
        await entregar("detail", payload);
        feitos += 1;
      } catch (e) {
        falhas.aoEntregar += 1;
        ultimoErro = String(e?.message ?? e).slice(0, 160);
      }
    }
    const totalFalhas =
      falhas.semId + falhas.httpDoPortal + falhas.retcodeDoPortal + falhas.aoEntregar;
    if (totalFalhas > 0) {
      erro(
        `detalhe: ${feitos} ok, ${totalFalhas} falharam ` +
          `(sem id ${falhas.semId}, http ${falhas.httpDoPortal}, retcode ${falhas.retcodeDoPortal}, ` +
          `entrega ${falhas.aoEntregar}) — último: ${ultimoErro}`,
      );
    }
    return feitos;
  }

  /** Um ciclo: pagina a listagem e entrega cada página. Devolve o que aconteceu, para o log. */
  async function ciclo(modo, caminho, filtro) {
    let paginas = 0;
    let viagens = 0;
    let truncou = 0;
    let detalhes = 0;
    const estacoesDesconhecidas = new Set();

    for (let pagina = 1; pagina <= CONFIG.maxPaginas; pagina += 1) {
      const payload = await buscarPagina(caminho, filtro, pagina);
      const lista = payload?.data?.list ?? [];
      if (lista.length === 0) break;

      const resumo = await entregar(modo, payload);
      paginas += 1;
      viagens += lista.length;
      for (const e of resumo?.unknownStations ?? []) estacoesDesconhecidas.add(e);

      // O TMS diz quais viagens ainda estão sem o operador de atribuição; só essas custam uma
      // chamada extra, e a lista some sozinha conforme elas são preenchidas.
      if (resumo?.needDetail?.length) {
        log(`${modo}: TMS pediu detalhe de ${resumo.needDetail.length} viagem(ns)`);
        detalhes += await detalharViagens(resumo.needDetail, lista);
      }

      // Última página: o portal já disse quantas existem no total.
      const total = payload?.data?.total ?? 0;
      if (pagina * CONFIG.porPagina >= total) break;
      // Bateu o teto com viagens ainda por ler: diz quantas ficaram, em vez de fingir que acabou.
      if (pagina === CONFIG.maxPaginas) truncou = total - pagina * CONFIG.porPagina;
    }

    return {
      paginas,
      viagens,
      truncou,
      detalhes,
      estacoesDesconhecidas: [...estacoesDesconhecidas],
    };
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
        log(
          `${nome}: ${r.viagens} viagens em ${r.paginas} página(s)${r.detalhes ? `, ${r.detalhes} detalhe(s)` : ""}, ${Math.round((Date.now() - t0) / 1000)}s`,
        );
        if (r.truncou > 0) {
          erro(`${nome}: teto de páginas atingido — ${r.truncou} viagens NÃO foram lidas`);
        }
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

  // A aba "Aceito": o que está na estrada agora. Mesmo endpoint do plano, outro `query_type`.
  //
  // Vai como `in_progress` desde a 1.5.0, e não mais como execução. Ia como execução por prudência —
  // "o robô nunca cria viagem" — e o preço apareceu na medição: 49 das 73 viagens em curso não
  // existiam no TMS. Foram aceitas antes de o robô começar a olhar o Planejado, então nunca passaram
  // por lá enquanto olhávamos, e o caminho de execução, por regra, não cria. Iam rodar e terminar
  // fora do sistema. Quem decide o que cada aba pode fazer é o TMS; aqui só se diz de onde veio.
  repetir("em curso", CONFIG.intervaloEmCursoMs, () =>
    ciclo("in_progress", "/api/line_haul/agency/trip/list", {
      query_type: 2,
      sta: `${agora() - CONFIG.emCursoDiasAtras * DIA},${agora() + CONFIG.emCursoDiasAdiante * DIA}`,
    }),
  );

  let primeiraExecucao = true;
  repetir("execução", CONFIG.intervaloExecucaoMs, () => {
    const horas = primeiraExecucao ? CONFIG.execucaoHorasPrimeiroCiclo : CONFIG.execucaoHorasAtras;
    primeiraExecucao = false;
    return ciclo("execution", "/api/line_haul/agency/trip/history/list", {
      mtime: `${agora() - horas * 3600},${agora()}`,
    });
  });
})();
