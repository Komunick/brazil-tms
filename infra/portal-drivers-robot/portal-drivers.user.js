// ==UserScript==
// @name         Brazil TMS — cadastro de motoristas
// @namespace    braziltransports.com.br
// @version      1.0.1
// @description  Lê o cadastro de motoristas do portal do cliente e entrega ao TMS. Somente leitura.
// @match        https://logistics.myagencyservice.com.br/*
// @connect      tms.braziltransports.com.br
// @connect      tmsdev.braziltransports.com.br
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @updateURL    http://127.0.0.1:8899/portal-drivers.user.js
// @downloadURL  http://127.0.0.1:8899/portal-drivers.user.js
// ==/UserScript==

/**
 * O LEITOR DO CADASTRO DE MOTORISTAS (2026-08-23, a pedido).
 *
 * Nasceu de um problema concreto: a tela de atribuição acusa "documentação ausente" porque o cadastro
 * do TMS está incompleto — 396 telefones em 1.378 motoristas —, enquanto o portal tem 1.391 com CNH,
 * validade, placa e contato. O export manual da tela do portal não resolve: traz os campos pessoais
 * de apenas 366, e envelhece no dia seguinte. Motorista novo, então, nunca aparece.
 *
 * ── DUAS CHAMADAS, PORQUE O PORTAL MASCARA ────────────────────────────────────────────────────
 *
 * A listagem devolve tudo menos o que é pessoal: nome, telefone e CPF voltam VAZIOS (medido: 24 de
 * 24 com validade de CNH, 0 de 24 com telefone). O que falta sai de uma segunda rota, um campo por
 * chamada:
 *
 *   GET /api/driverservice/agency/driver/sensitive/data?driver_id=<id>&data_field=phone
 *
 * ── E É O TMS QUEM DIZ O QUE REVELAR ──────────────────────────────────────────────────────────
 *
 * Cada página entregue volta com a lista de quem ainda está sem nome, telefone ou CPF. Sem isso o
 * robô revelaria ~4.000 campos por rodada para reescrever o que já temos — e cada revelação fica
 * registrada no log do fornecedor. Depois da primeira carga sobram dezenas por semana: o motorista
 * que entrou ontem.
 *
 * É o mesmo desenho do `needDetail` do robô de viagens, e pela mesma razão.
 *
 * ── SOMENTE LEITURA ───────────────────────────────────────────────────────────────────────────
 *
 * Este script não escreve nada no portal: GET na listagem, GET na revelação, e POST só para o TMS.
 */

/* global GM_xmlhttpRequest */
(function () {
  "use strict";

  const CONFIG = {
    /**
     * Endereço do TMS. PRODUÇÃO — o arquivo do repositório é o que se instala, e tem de nascer
     * apontando para onde vai rodar. O contrário já custou caro: um robô de produção apontado para o
     * dev não dá sinal nenhum de erro.
     */
    tms: "https://tms.braziltransports.com.br",
    /** O mesmo valor de PORTAL_FEED_TOKEN no servidor. Trocar aqui e lá ao mesmo tempo. */
    token: "COLE_AQUI_O_TOKEN",
    /**
     * De quinze em quinze minutos. O cadastro muda devagar — entram alguns motoristas por semana — e
     * o que justifica um ciclo curto é só a primeira carga, que precisa drenar as revelações.
     */
    intervaloMs: 15 * 60 * 1000,
    /** Registros por página da listagem. */
    porPagina: 100,
    /**
     * TETO DE REVELAÇÕES POR CICLO, e ele é o freio deste robô.
     *
     * Revelar é pedir dado pessoal, e fica no log do fornecedor. Duzentas por ciclo drenam a primeira
     * carga (~3.000) em uma tarde, sem nenhum momento em que o portal veja uma rajada. Depois disso o
     * número cai para o que de fato faltou.
     */
    revelacoesPorCiclo: 200,
    /** Uma pausa entre revelações: o portal responde rápido, e não há pressa nenhuma aqui. */
    pausaEntreRevelacoesMs: 250,
  };

  const registro = (...args) => console.log("[TMS motoristas 1.0.0]", ...args);
  const erro = (...args) => console.error("[TMS motoristas 1.0.0]", ...args);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  /** A estação sob a qual a aba está logada — o portal exige em toda listagem. */
  function estacao() {
    const id = localStorage.getItem("stationId");
    if (!id) throw new Error("stationId não encontrado: a sessão do portal caiu?");
    return id;
  }

  /**
   * A LISTAGEM É POST, e isso custou o primeiro ciclo inteiro em branco.
   *
   * Nasceu escrita como GET com os parâmetros na URL — que é como a revelação, logo abaixo, de fato
   * funciona — e o portal devolveu `HTTP 405` a cada rodada: o robô subia, dizia "no ar" e não trazia
   * motorista nenhum. As duas rotas do MESMO serviço não seguem a mesma convenção. Medido nas duas
   * (2026-08-23), não deduzido de uma: listar é POST com corpo JSON, revelar é GET com query.
   */
  async function buscarPagina(pagina) {
    const r = await fetch("/api/driverservice/agency/br/driver/list", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageno: pagina,
        count: CONFIG.porPagina,
        agency_current_station_id: estacao(),
      }),
    });
    if (!r.ok) throw new Error("portal respondeu HTTP " + r.status);
    return r.json();
  }

  /** UM campo de UM motorista. É o que o portal aceita: não existe revelação em lote. */
  async function revelar(driverId, campo) {
    const u = new URL("/api/driverservice/agency/driver/sensitive/data", location.origin);
    u.searchParams.set("driver_id", String(driverId));
    u.searchParams.set("data_field", campo);
    const r = await fetch(u.toString(), { credentials: "include" });
    if (!r.ok) return null;
    return r.json();
  }

  function entregar(corpo) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: CONFIG.tms + "/api/imports/driver-feed",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + CONFIG.token },
        data: JSON.stringify(corpo),
        timeout: 120000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText));
            } catch {
              resolve({});
            }
          } else {
            reject(new Error("TMS respondeu " + res.status));
          }
        },
        onerror: () => reject(new Error("falha de rede ao falar com o TMS")),
        ontimeout: () => reject(new Error("TMS não respondeu a tempo")),
      });
    });
  }

  async function ciclo() {
    const TOKEN_DE_EXEMPLO = "COLE_AQUI" + "_O_TOKEN";
    if (!CONFIG.token || CONFIG.token === TOKEN_DE_EXEMPLO) {
      erro("token não configurado — li " + String(CONFIG.token || "").length + " caractere(s)");
      return;
    }

    let pagina = 1;
    let lidos = 0;
    const pendentes = [];

    /**
     * A listagem inteira, sempre. Ela não custa dado pessoal nenhum, e é o único jeito de perceber o
     * motorista que ENTROU — quem não está na nossa base não tem como ser perguntado.
     */
    for (;;) {
      const payload = await buscarPagina(pagina);
      const lista = (payload && payload.data && payload.data.list) || [];
      if (lista.length === 0) break;
      lidos += lista.length;

      const resposta = await entregar({ token: CONFIG.token, page: payload });
      for (const f of (resposta && resposta.falta) || []) pendentes.push(f);

      const total = (payload && payload.data && payload.data.total) || 0;
      if (pagina * CONFIG.porPagina >= total) break;
      pagina += 1;
    }

    registro("listagem: " + lidos + " motoristas · faltam dados de " + pendentes.length);

    let feitas = 0;
    for (const p of pendentes) {
      for (const campo of p.campos) {
        if (feitas >= CONFIG.revelacoesPorCiclo) {
          registro("teto do ciclo atingido (" + feitas + "); o resto sai no próximo");
          return;
        }
        try {
          const payload = await revelar(p.portalDriverId, campo);
          if (payload) {
            await entregar({
              token: CONFIG.token,
              reveal: { portalDriverId: p.portalDriverId, field: campo, payload },
            });
          }
        } catch (e) {
          erro("revelação falhou", campo, String(e));
        }
        feitas += 1;
        await dormir(CONFIG.pausaEntreRevelacoesMs);
      }
    }
    registro("revelações no ciclo: " + feitas);
  }

  async function repetir() {
    try {
      await ciclo();
    } catch (e) {
      erro("ciclo falhou:", String(e));
    }
    setTimeout(repetir, CONFIG.intervaloMs);
  }

  registro("no ar");
  repetir();
})();
