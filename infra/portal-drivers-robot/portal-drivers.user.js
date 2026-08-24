// ==UserScript==
// @name         Brazil TMS — cadastro de motoristas
// @namespace    braziltransports.com.br
// @version      1.1.0
// @description  Lê o cadastro de motoristas do portal do cliente e entrega ao TMS. Somente leitura.
// @match        https://logistics.myagencyservice.com.br/*
// @connect      tms.braziltransports.com.br
// @connect      tmsdev.braziltransports.com.br
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
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
 * Este script não escreve nada no portal. A listagem é POST — mas POST de CONSULTA, escolha do
 * fornecedor: devolve a página do cadastro e não altera nada. A revelação é GET. O único POST que
 * grava alguma coisa vai para o nosso próprio TMS.
 */

/* global GM_xmlhttpRequest, GM_getValue, GM_setValue */
(function () {
  "use strict";

  const CONFIG = {
    /**
     * Endereço do TMS. PRODUÇÃO — o arquivo do repositório é o que se instala, e tem de nascer
     * apontando para onde vai rodar. O contrário já custou caro: um robô de produção apontado para o
     * dev não dá sinal nenhum de erro.
     */
    tms: "https://tms.braziltransports.com.br",
    /**
     * O mesmo valor de PORTAL_FEED_TOKEN no servidor. Trocar aqui e lá ao mesmo tempo.
     *
     * Cola-se UMA vez: na primeira execução ele é copiado para o armazenamento do Tampermonkey, e é
     * de lá que as execuções seguintes leem. Antes disso, toda atualização do robô devolvia esta
     * linha ao valor de exemplo e o robô parava até alguém colar de novo — o que já aconteceu duas
     * vezes numa noite só.
     */
    token: "COLE_AQUI_O_TOKEN",
    /**
     * DOIS RITMOS, E QUEM ESCOLHE É A FILA.
     *
     * Em regime, de quinze em quinze minutos: o cadastro muda devagar — entram alguns motoristas por
     * semana — e varrer mais que isso é bater no portal para ouvir "nada mudou".
     *
     * Com fila, de minuto em minuto. O que justifica pressa é só a primeira carga (~3.400 revelações
     * entre nomes, telefones e CPFs), e ela precisa fechar no mesmo dia para o cadastro servir para
     * alguma coisa. Cravar o ritmo curto para sempre seria pagar 15× mais varredura pelo resto da
     * vida por causa de uma tarde.
     */
    intervaloMs: 15 * 60 * 1000,
    intervaloComFilaMs: 60 * 1000,
    /** Registros por página da listagem. */
    porPagina: 100,
    /**
     * TETO DE REVELAÇÕES POR CICLO, e ele é o freio deste robô.
     *
     * Revelar é pedir dado pessoal, e fica no log do fornecedor. O teto existe para que o portal
     * nunca veja uma rajada — não para que a carga demore. Quinhentas, com um quarto de segundo
     * entre elas, são pouco mais de dois pedidos por segundo: o ritmo de uma pessoa navegando
     * depressa, sustentado. Em regime o teto nem chega a ser tocado, porque a fila é de dezenas.
     */
    revelacoesPorCiclo: 500,
    /** Uma pausa entre revelações: o portal responde rápido, e não há pressa nenhuma aqui. */
    pausaEntreRevelacoesMs: 250,
    /**
     * A PARTIR DE QUANTOS PENDENTES A FILA CONTA COMO GRANDE.
     *
     * Não é "maior que zero", e a diferença importa: sempre vão sobrar alguns motoristas que o portal
     * nunca completa — um sem telefone cadastrado lá continua sem telefone toda vez que se pergunta.
     * Com o limiar em zero, essa meia dúzia de casos insolúveis prenderia o robô no ritmo de um
     * minuto para sempre, batendo no portal a cada minuto pelo resto da vida para reconfirmar que
     * não há nada. Cinquenta separa "primeira carga" de "o cadastro tem buracos".
     */
    filaGrandeAPartirDe: 50,
  };

  const registro = (...args) => console.log("[TMS motoristas 1.1.0]", ...args);
  const erro = (...args) => console.error("[TMS motoristas 1.1.0]", ...args);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  const TOKEN_DE_EXEMPLO = "COLE_AQUI" + "_O_TOKEN";

  /**
   * O TOKEN PRECISA SOBREVIVER À ATUALIZAÇÃO DO ROBÔ.
   *
   * Ele mora no código, e o código é substituído inteiro a cada atualização — então toda correção
   * devolvia esta linha ao valor de exemplo e o robô parava calado até alguém colar de novo. Numa
   * noite só isso aconteceu duas vezes.
   *
   * Agora o valor colado é copiado para o armazenamento do Tampermonkey na primeira execução, e é de
   * lá que as seguintes leem. Cola-se uma vez; as atualizações seguintes chegam com o exemplo no
   * código e continuam funcionando.
   *
   * O código VENCE o armazenamento quando traz um valor de verdade: é assim que se troca o token
   * quando ele muda no servidor — cola o novo, e ele vira o guardado.
   */
  let tokenEmUso = "";
  function tokenAtual() {
    const noCodigo = CONFIG.token && CONFIG.token !== TOKEN_DE_EXEMPLO ? CONFIG.token : "";
    let guardado = "";
    try {
      guardado = GM_getValue("token", "") || "";
    } catch {
      guardado = "";
    }
    if (!noCodigo) return guardado;
    if (noCodigo !== guardado) {
      try {
        GM_setValue("token", noCodigo);
      } catch {
        // Sem armazenamento o robô ainda funciona — só volta a perder o token na próxima atualização.
      }
    }
    return noCodigo;
  }

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
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenEmUso },
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

  /** Devolve `true` enquanto ainda há fila grande — é o que decide o ritmo do próximo ciclo. */
  async function ciclo() {
    tokenEmUso = tokenAtual();
    if (!tokenEmUso) {
      erro("token não configurado: cole-o na linha `token:` do CONFIG — basta uma vez, ele fica guardado");
      return false;
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

      const resposta = await entregar({ token: tokenEmUso, page: payload });
      for (const f of (resposta && resposta.falta) || []) pendentes.push(f);

      const total = (payload && payload.data && payload.data.total) || 0;
      if (pagina * CONFIG.porPagina >= total) break;
      pagina += 1;
    }

    registro("listagem: " + lidos + " motoristas · faltam dados de " + pendentes.length);

    const filaGrande = pendentes.length >= CONFIG.filaGrandeAPartirDe;

    let feitas = 0;
    for (const p of pendentes) {
      for (const campo of p.campos) {
        if (feitas >= CONFIG.revelacoesPorCiclo) {
          registro("teto do ciclo atingido (" + feitas + "); o resto sai no próximo");
          return true;
        }
        try {
          const payload = await revelar(p.portalDriverId, campo);
          if (payload) {
            await entregar({
              token: tokenEmUso,
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
    return filaGrande;
  }

  async function repetir() {
    /**
     * O ciclo que FALHA volta no ritmo lento, de propósito.
     *
     * Quando o TMS está fora do ar ou a sessão do portal caiu, insistir de minuto em minuto não
     * conserta nada e só enche o console de erro igual — foi o que aconteceu no deploy desta noite,
     * com três robôs registrando 502 em rajada. Quinze minutos é tempo de o problema ser resolvido.
     */
    let comFila = false;
    try {
      comFila = await ciclo();
    } catch (e) {
      erro("ciclo falhou:", String(e));
    }
    setTimeout(repetir, comFila ? CONFIG.intervaloComFilaMs : CONFIG.intervaloMs);
  }

  registro("no ar");
  repetir();
})();
