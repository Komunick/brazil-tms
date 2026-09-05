// ==UserScript==
// @name         Brazil TMS — cadastro de motoristas
// @namespace    braziltransports.com.br
// @version      1.4.0
// @description  Lê o cadastro de motoristas do portal do cliente e entrega ao TMS. Somente leitura.
// @match        https://logistics.myagencyservice.com.br/*
// @connect      tms.braziltransports.com.br
// @connect      status.braziltransports.com.br
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

    // ── Heartbeat para o Uptime Kuma ────────────────────────────────────────
    // Moram aqui, e nao em constantes no topo, pelo mesmo motivo de tms e token:
    // e o bloco CONFIG que o instalar.sh sabe preservar. Vazias ou com COLE_, o
    // heartbeat nao envia nada e o robo roda exatamente como hoje.
    /** Ex.: https://status.braziltransports.com.br/api/push */
    hb_base: "COLE_A_BASE_DO_KUMA",
    /** Token do monitor "BOT · portal-drivers · vivo". */
    hb_vivo: "COLE_O_TOKEN_VIVO",
    /** Token do monitor "BOT · portal-drivers · ciclo". */
    hb_ciclo: "COLE_O_TOKEN_CICLO",
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
    /**
     * POR QUANTO TEMPO SE ACREDITA NUM "O PORTAL NÃO TEM ESSE DADO".
     *
     * Uma semana. O portal responde vazio para quem simplesmente não tem telefone cadastrado lá, e
     * perguntar de novo no minuto seguinte devolve o mesmo vazio — só que consumindo a cota e o log
     * do fornecedor. Mas o dado PODE ser preenchido lá depois: alguém cadastra o telefone do
     * motorista na terça. Sete dias é o meio-termo entre não martelar e não ficar cego.
     */
    validadeDoVazioMs: 7 * 24 * 60 * 60 * 1000,
    /**
     * QUANTO ESPERAR DEPOIS DE ESTOURAR A COTA DE DADOS PESSOAIS DO PORTAL.
     *
     * Uma hora. Não se sabe quando a cota vira — o portal não diz —, então em vez de adivinhar
     * "meia-noite" o robô sonda de hora em hora: um ciclo custa uma listagem e meia dúzia de
     * revelações recusadas, e ele volta a trabalhar sozinho no momento em que a cota abrir. Adivinhar
     * o horário seria ficar parado até o dia seguinte se a virada fosse às 6h.
     */
    esperaAposCotaMs: 60 * 60 * 1000,
  };

  const HB = criarHeartbeat(CONFIG);

  function criarHeartbeat(cfg) {
    const BASE = (cfg && cfg.hb_base) || "";
    const TOKEN_VIVO = (cfg && cfg.hb_vivo) || "";
    const TOKEN_CICLO = (cfg && cfg.hb_ciclo) || "";

    const INTERVALO_VIVO_MS = 60000; // o monitor "vivo" usa tolerância de 180 s

    // Placeholder do repositório ou campo vazio: o robô roda, só não é monitorado.
    const semValor = (v) => !v || v.indexOf("COLE_") === 0;
    const desligado = semValor(BASE);

    /**
     * Envio em três camadas, da mais confiável para a mais tolerante.
     * Os 5 robôs já declaram `@grant GM_xmlhttpRequest`, então a primeira quase
     * sempre resolve. As outras existem para o dia em que alguém criar um robô
     * novo sem esse grant, ou para um portal com CSP mais fechada.
     */
    function disparar(url) {
      try {
        if (typeof GM_xmlhttpRequest === "function") {
          GM_xmlhttpRequest({
            method: "GET",
            url,
            timeout: 10000,
            onerror() {},
            ontimeout() {},
            onload() {},
          });
          return;
        }
      } catch { /* cai para a próxima camada */ }

      try {
        fetch(url, { method: "GET", mode: "no-cors", cache: "no-store", keepalive: true })
          .catch(() => {});
        return;
      } catch { /* cai para a próxima camada */ }

      try {
        new Image().src = url;
      } catch { /* desiste em silêncio: o Kuma marca DOWN pela ausência */ }
    }

    function enviar(token, opcoes) {
      if (desligado || semValor(token)) return;
      const o = opcoes || {};
      try {
        const q = new URLSearchParams({
          status: o.status || "up",
          msg: String(o.msg == null ? "OK" : o.msg).slice(0, 250),
        });
        const ping = o.ping;
        if (ping != null && isFinite(ping)) q.set("ping", String(Math.round(ping)));
        disparar(BASE.replace(/\/+$/, "") + "/" + token + "?" + q.toString());
      } catch { /* nunca propague erro do heartbeat para o robô */ }
    }

    // -- API pública ---------------------------------------------------------

    const api = {
      /** Sinal de vida. Automático a cada minuto; raramente precisa ser manual. */
      vivo(msg) {
        enviar(TOKEN_VIVO, { msg: msg || "script carregado" });
      },

      /**
       * Ciclo de trabalho CONCLUÍDO COM SUCESSO.
       * Chame no FIM do ciclo, não no começo — o que interessa é a entrega.
       * @param {string} msg   o que foi processado, ex.: "38 viagens"
       * @param {number} [ms]  duração do ciclo; vira o gráfico de latência no Kuma
       */
      ciclo(msg, ms) {
        enviar(TOKEN_CICLO, { msg: msg || "ciclo concluido", ping: ms });
      },

      /**
       * Ciclo FALHOU. Marca DOWN na hora, com o motivo, em vez de esperar a
       * tolerância expirar. O diagnóstico chega minutos mais cedo, já escrito.
       */
      falhou(motivo) {
        enviar(TOKEN_CICLO, { status: "down", msg: String(motivo || "erro no ciclo") });
      },

      /** Mede um ciclo inteiro e reporta sucesso ou falha automaticamente. */
      async medir(fn, rotulo) {
        const nome = rotulo || "ciclo";
        const inicio = Date.now();
        try {
          const r = await fn();
          const resumo =
            typeof r === "string" ? r
            : typeof r === "number" ? r + " item(ns)"
            : nome + " concluido";
          api.ciclo(resumo, Date.now() - inicio);
          return r;
        } catch (err) {
          api.falhou(nome + ": " + ((err && err.message) || err));
          throw err; // o robô continua tratando o erro como sempre tratou
        }
      },
    };

    // -- Sinal de vida automático --------------------------------------------
    //
    // Decisão deliberada: NÃO enviamos "down" no evento pagehide. Os robôs
    // recarregam a página como parte do ciclo normal, e cada recarga viraria um
    // par down/up no histórico — a disponibilidade do robô ficaria irreconhecível.
    // Quem detecta aba fechada de verdade, em ~1 minuto, é o agente do host, que
    // pergunta ao Chromium quais abas existem. Ver ../agente-bots/.
    if (!desligado && !semValor(TOKEN_VIVO)) {
      api.vivo();
      setInterval(() => api.vivo(), INTERVALO_VIVO_MS);
    }

    return api;
  }


  /**
   * A COTA SE RECONHECE PELA MENSAGEM, não pelo número.
   *
   * Medidos dois códigos diferentes para a MESMA recusa em minutos de intervalo — `271601017` e o
   * que se leu como `271681017` numa captura de tela. Prender a lógica a um número é apostar em ter
   * lido certo e em o fornecedor não variar; a frase é estável e é o que ele mostra ao operador.
   *
   * O `includes` é sobre o trecho invariável: "limite máximo" resiste a reticências, prefixo e
   * pontuação diferentes.
   */
  const FRASE_DA_COTA = "limite máximo";
  function ehCota(payload) {
    const m = payload && typeof payload.message === "string" ? payload.message.toLowerCase() : "";
    return m.includes(FRASE_DA_COTA);
  }

  const registro = (...args) => console.log("[TMS motoristas 1.3.1]", ...args);
  const erro = (...args) => console.error("[TMS motoristas 1.3.1]", ...args);
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

  /**
   * O QUE O PORTAL JÁ RESPONDEU VAZIO, E QUANDO.
   *
   * O TMS pede de volta tudo o que ainda falta, e ele tem razão em pedir: do lado dele, um telefone
   * vazio é um telefone vazio. Só o robô sabe que aquele campo JÁ foi perguntado e voltou nada — e
   * sem essa memória a fila nunca encolhe.
   *
   * Foi o que travou a carga em 481 vinculados: os 178 telefones e 339 CPFs que o portal não tem
   * somam 517 pedidos, o teto do ciclo é 500, e as revelações andam na ordem da listagem. Os 517
   * consumiam a cota inteira toda vez, sempre voltando vazios, e os 909 nomes que vinham depois
   * nunca eram alcançados. Travamento permanente, sem erro nenhum no console.
   */
  const CHAVE_DOS_VAZIOS = "revelacoesVazias";
  function lerVazios() {
    try {
      return JSON.parse(GM_getValue(CHAVE_DOS_VAZIOS, "{}")) || {};
    } catch {
      return {};
    }
  }
  function gravarVazios(mapa) {
    try {
      GM_setValue(CHAVE_DOS_VAZIOS, JSON.stringify(mapa));
    } catch {
      // Sem armazenamento o robô continua correto, só volta a repetir perguntas inúteis.
    }
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
    /**
     * A RECUSA PRECISA FALAR. Este `return null` calado custou uma noite: a carga parou em 481 e o
     * console não tinha uma linha sequer explicando por quê — nem erro, nem aviso. Um 403 do portal
     * (cota de dados pessoais dele, que é dele mesmo impor) era indistinguível de "não perguntei".
     * Diagnóstico só é possível sobre o que o robô conta.
     */
    if (!r.ok) throw new Error("portal recusou a revelação: HTTP " + r.status);
    const payload = await r.json();
    // `retcode` diferente de zero é recusa de aplicação: o HTTP vem 200 e a mensagem, dentro.
    if (payload && payload.retcode !== 0) {
      const e = new Error("portal recusou a revelação: " + JSON.stringify(payload).slice(0, 200));
      /**
       * "Suas visitas para dados confidenciais atingiram o limite máximo" (retcode 271681017).
       *
       * O PORTAL LIMITA QUANTO DADO PESSOAL PODE SER VISTO POR PERÍODO, e é o limite dele — não um
       * defeito nosso para contornar. Medido em 2026-08-23: a carga inicial esbarrou nele depois de
       * algumas centenas de revelações, e a partir daí TODA revelação volta recusada.
       *
       * Marcar este caso à parte importa porque a resposta certa é diferente das outras: não é
       * tentar de novo em um minuto nem em quinze, é esperar a cota virar. Insistir só gasta o log
       * do fornecedor com recusa.
       */
      e.cota = ehCota(payload);
      throw e;
    }
    return payload;
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

  /**
   * Devolve o ESTADO do ciclo, que é o que decide o ritmo do próximo: `"fila"` (há muito a pedir,
   * volta em um minuto), `"cota"` (o portal fechou a torneira de dados pessoais, volta em uma hora)
   * ou `"quieto"` (nada urgente, volta em quinze minutos).
   */
  async function ciclo() {
    tokenEmUso = tokenAtual();
    if (!tokenEmUso) {
      erro("token não configurado: cole-o na linha `token:` do CONFIG — basta uma vez, ele fica guardado");
      return "quieto";
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

    const vazios = lerVazios();
    const agora = Date.now();

    /**
     * O NOME NA FRENTE DE TUDO, e não é preferência: é o que desata o nó.
     *
     * Enquanto o motorista não tem nome revelado, ele não existe no nosso cadastro — nem para
     * receber telefone depois. Um nome revelado vale mais que um telefone revelado, sempre. Com a
     * ordem da listagem pura, os campos dos primeiros motoristas comiam a cota e os nomes dos
     * últimos nunca chegavam a ser pedidos.
     *
     * `sort` é estável em todos os motores modernos, então dentro de cada grupo a ordem da listagem
     * se mantém — o que importa para a carga avançar sempre do mesmo ponto.
     */
    const fila = [];
    for (const p of pendentes) {
      for (const campo of p.campos) {
        const chave = p.portalDriverId + "|" + campo;
        const quando = vazios[chave];
        if (quando && agora - quando < CONFIG.validadeDoVazioMs) continue;
        fila.push({ id: p.portalDriverId, campo, chave });
      }
    }
    fila.sort((a, b) => (a.campo === "driver_name" ? 0 : 1) - (b.campo === "driver_name" ? 0 : 1));

    const filaGrande = fila.length >= CONFIG.filaGrandeAPartirDe;
    registro("a perguntar: " + fila.length + " (de " + pendentes.length + " motoristas na lista)");

    let feitas = 0;
    let novosVazios = 0;
    /**
     * RECUSA EM SÉRIE É PARA DESISTIR DO CICLO, não para insistir 500 vezes.
     *
     * Se o portal está barrando as revelações, as próximas 499 serão barradas igual: o único efeito
     * de continuar é 500 linhas idênticas no console — que é ruído, e ruído esconde justamente a
     * linha que explica. Cinco seguidas bastam para saber que não é caso isolado.
     */
    let seguidasQueFalharam = 0;
    let barrado = "";
    for (const item of fila) {
      if (feitas >= CONFIG.revelacoesPorCiclo) {
        registro("teto do ciclo atingido (" + feitas + "); o resto sai no próximo");
        break;
      }
      try {
        const payload = await revelar(item.id, item.campo);
        seguidasQueFalharam = 0;
        if (payload) {
          const resposta = await entregar({
            token: tokenEmUso,
            reveal: { portalDriverId: item.id, field: item.campo, payload },
          });
          if (resposta && resposta.gravado === false && resposta.motivo === "vazio") {
            vazios[item.chave] = agora;
            novosVazios += 1;
          }
        }
      } catch (e) {
        seguidasQueFalharam += 1;
        if (seguidasQueFalharam <= 2) erro("revelação falhou", item.campo, String(e));
        if (seguidasQueFalharam >= 5) {
          barrado = e && e.cota ? "cota" : "quieto";
          erro(
            barrado === "cota"
              ? "cota de dados pessoais do portal esgotada — volto a sondar daqui a uma hora"
              : "cinco recusas seguidas — paro o ciclo aqui e volto no ritmo lento",
          );
          break;
        }
      }
      feitas += 1;
      await dormir(CONFIG.pausaEntreRevelacoesMs);
    }
    // Barrado não é fila drenada: voltar de minuto em minuto só repetiria a recusa mais depressa.
    if (barrado) {
      if (novosVazios > 0) gravarVazios(vazios);
      return barrado;
    }

    if (novosVazios > 0) {
      gravarVazios(vazios);
      registro("o portal não tem " + novosVazios + " destes campos; não pergunto de novo esta semana");
    }
    registro("revelações no ciclo: " + feitas);
    return filaGrande ? "fila" : "quieto";
  }

  async function repetir() {
    /**
     * O ciclo que FALHA volta no ritmo lento, de propósito.
     *
     * Quando o TMS está fora do ar ou a sessão do portal caiu, insistir de minuto em minuto não
     * conserta nada e só enche o console de erro igual — foi o que aconteceu no deploy desta noite,
     * com três robôs registrando 502 em rajada. Quinze minutos é tempo de o problema ser resolvido.
     */
    let estado = "quieto";
    const inicioDoCiclo = Date.now();
    try {
      estado = await ciclo();
      HB.ciclo(`ciclo ${estado}`, Date.now() - inicioDoCiclo);
    } catch (e) {
      erro("ciclo falhou:", String(e));
      HB.falhou(String(e).slice(0, 200));
    }
    const espera =
      estado === "fila"
        ? CONFIG.intervaloComFilaMs
        : estado === "cota"
          ? CONFIG.esperaAposCotaMs
          : CONFIG.intervaloMs;
    setTimeout(repetir, espera);
  }

  registro("no ar");
  repetir();
})();
