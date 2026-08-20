// ==UserScript==
// @name         Brazil TMS — leitor do eTorre (prova de conceito)
// @namespace    braziltransports.com.br
// @version      0.1.0
// @description  Escuta o que a tela de Veículos Logísticos do eTorre já busca e resume no console. Somente leitura, não envia nada.
// @match        https://torre.logae.com.br/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/**
 * A PROVA DE CONCEITO do rastreador (2026-08-19).
 *
 * O eTorre (white-label da Raster) não publica API para nós, mas a tela "Veículos Logísticos" busca
 * tudo de um endpoint só — `POST /apilog/veiculos-logisticos` —, e a resposta traz MUITO mais do que
 * a grade mostra: posição, ignição, percentual percorrido, quilometragem e a previsão de entrega
 * calculada pelo rastreador. São 380 campos por veículo, 98 veículos na conta.
 *
 * Este script não pede nada ao servidor. Ele ESCUTA a chamada que o próprio app faz e lê a resposta
 * de passagem. É a diferença entre um leitor e um segundo cliente: nenhuma requisição a mais chega
 * ao fornecedor por nossa causa.
 *
 * ── POR QUE `document-start` ───────────────────────────────────────────────────────────────────
 *
 * Medido: um hook instalado com a página já carregada FUNCIONA neste app, mas isso é sorte de
 * implementação — basta o bundle passar a guardar `XMLHttpRequest.prototype.open` numa variável de
 * módulo para o hook tardio virar decoração. Entrando antes de qualquer script da página, a
 * referência que o app guardar já é a nossa.
 *
 * ── O QUE ESTA VERSÃO NÃO FAZ ──────────────────────────────────────────────────────────────────
 *
 * Não envia ao TMS. Prova de conceito prova UMA coisa: que o dado chega, íntegro e com os campos
 * certos, sem tocar no fornecedor. O envio exige rota e tabela no TMS, e essas se desenham melhor
 * depois de ver o dado real correndo por algumas horas.
 */

(function () {
  "use strict";

  const CONFIG = {
    /** Só interessa esta chamada; as outras do `/apilog/` são lookups de tela. */
    alvo: "/apilog/veiculos-logisticos",
    /** O `-preload` tem o mesmo prefixo e devolve 204 — precisa sair na mão. */
    ignorar: "preload",
    /**
     * De quanto em quanto tempo pedir à TELA que se atualize.
     *
     * A tela NÃO se atualiza sozinha: medido em 2026-08-19, quatro minutos escutando sem tocar em
     * nada e nenhuma requisição saiu. As atualizações que eu vinha observando eram efeito dos meus
     * próprios cliques. Sem este empurrão, o robô ficaria eternamente com o retrato do momento em
     * que a aba foi aberta — e, pior, parecendo vivo.
     *
     * Cinco minutos alinha com os outros dois robôs e com o ritmo do rastreador, que reporta posição
     * a cada poucos minutos.
     */
    intervaloMs: 5 * 60 * 1000,
    /** O botão da barra de ferramentas, achado pelo texto de dica — o ícone é um SVG sem nome. */
    botaoAtualizar: 'title="Atualizar"',
  };

  const log = (...a) => console.log("[TMS eTorre 0.1.0]", ...a);
  const erro = (...a) => console.warn("[TMS eTorre 0.1.0]", ...a);

  /**
   * Os campos que o TMS usaria, com o nome que eles têm lá dentro.
   *
   * O resto dos 380 fica de fora de propósito: metade é cadastro do rastreador (códigos internos,
   * apelidos de tela, flags de módulos que não contratamos) e a outra metade vem sempre nula. Lista
   * curta e explícita é o que permite ver, no console, se algum deles secou.
   */
  const CAMPOS = {
    placa: "GRA_PLACA",
    carreta: "PLACA_CARRETA01",
    motorista: "GRA_CAMDESC",
    lat: "POD_LAT",
    lon: "POD_LON",
    ignicao: "POD_IGNICAO",
    horaPosicao: "POD_DATAHORAP",
    statusViagem: "STATUS_VIAGEM",
    origem: "GRJ_CIDADE_ORIGEM",
    destino: "GRJ_CIDADE_DESTINO",
    inicioViagem: "DATA_INICIO_VIAGEM",
    previsaoEntrega: "GRJ_DATAHORAPREVISAOENTREGA",
    percentual: "GRJ_PERCENTUALPERCORRIDO",
    kmPercorrido: "GRJ_KMPERCORRIDO",
    minutosParado: "MINUTOS_PARADO_ALVO_VIAGEM",
  };

  function extrair(registro) {
    const saida = {};
    for (const [nosso, deles] of Object.entries(CAMPOS)) saida[nosso] = registro[deles] ?? null;
    return saida;
  }

  /**
   * O relatório de um ciclo, que é o produto desta prova.
   *
   * Ele responde três perguntas de uma vez: chegou dado?, os campos que interessam vieram
   * preenchidos?, e quantos caminhões estão de fato rodando agora? Sem isso o console diria apenas
   * "capturei 98 registros", que é a parte fácil.
   */
  function resumir(registros) {
    const frota = registros.map(extrair);
    const emViagem = frota.filter((v) => v.percentual != null && v.percentual > 0);
    const semPosicao = frota.filter((v) => !v.horaPosicao);
    const vazios = Object.keys(CAMPOS).filter((k) => frota.every((v) => v[k] == null));

    log(
      `${frota.length} veículos · ${emViagem.length} com viagem em curso · ` +
        `${semPosicao.length} sem posição`,
    );
    if (vazios.length > 0) {
      // Campo que veio vazio para TODO MUNDO é sinal de que o nome mudou do lado deles, não de que a
      // frota parou. Os dois se parecem no gráfico e não se parecem em nada na hora de consertar.
      erro(`campos vazios em toda a frota (nome pode ter mudado): ${vazios.join(", ")}`);
    }
    if (emViagem[0]) log("exemplo com viagem:", emViagem[0]);
  }

  const original = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    const endereco = String(url);
    if (endereco.includes(CONFIG.alvo) && !endereco.includes(CONFIG.ignorar)) {
      this.addEventListener("loadend", function () {
        if (this.status !== 200) {
          erro(`o app recebeu ${this.status} — sessão do eTorre pode ter caído`);
          return;
        }
        try {
          /**
           * `response` e não `responseText`: quando o app pede a resposta já convertida
           * (`responseType = "json"`), ler o texto lança `InvalidStateError` e o ciclo inteiro se
           * perde num catch. Custou uma rodada inteira desta prova.
           */
          const bruto = this.response;
          const corpo = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
          const registros = corpo?.records;
          if (!Array.isArray(registros)) {
            erro("resposta sem `records` — o formato mudou", corpo && Object.keys(corpo));
            return;
          }
          resumir(registros);
        } catch (e) {
          erro("falhei ao ler a resposta:", String(e?.message ?? e).slice(0, 160));
        }
      });
    }
    return original.call(this, metodo, url, ...resto);
  };

  /**
   * O empurrão na tela, e por que ele não é um `.click()`.
   *
   * A grade é DevExtreme, que escuta ponteiro e não o evento sintético `click` — medido: o
   * `botao.click()` não produziu requisição nenhuma, enquanto o mesmo botão clicado de verdade
   * produziu. É a mesma armadilha que o robô do BSC já resolve, e a saída é a mesma: emitir a
   * sequência de `PointerEvent` que o navegador emitiria.
   */
  function cutucar(elemento) {
    const r = elemento.getBoundingClientRect();
    const opcoes = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    };
    for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      elemento.dispatchEvent(
        tipo.startsWith("pointer") ? new PointerEvent(tipo, opcoes) : new MouseEvent(tipo, opcoes),
      );
    }
  }

  function atualizarTela() {
    const botao = document.querySelector(`.dx-toolbar .dx-button[${CONFIG.botaoAtualizar}]`);
    if (!botao) {
      // Sem botão, ou a aba aberta não é a de Veículos Logísticos, ou a sessão caiu para a tela de
      // login. Os dois casos são silêncio, e silêncio é o que este aviso existe para quebrar.
      erro("botão Atualizar não está na tela — aba errada ou sessão caída?");
      return;
    }
    cutucar(botao);
  }

  // O primeiro ciclo espera a tela assentar; os seguintes são agendados a partir do FIM do anterior,
  // então um ciclo lento nunca empilha em cima do próximo.
  setTimeout(function ciclo() {
    try {
      atualizarTela();
    } catch (e) {
      erro("ciclo falhou:", String(e?.message ?? e).slice(0, 160));
    } finally {
      setTimeout(ciclo, CONFIG.intervaloMs);
    }
  }, 15_000);

  log("ativo. Somente leitura: escuta a tela e pede que ela se atualize a cada 5 min.");
})();
