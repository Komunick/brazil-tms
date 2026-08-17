// ==UserScript==
// @name         Brazil TMS — leitor do BSC
// @namespace    braziltransports.com.br
// @version      1.0.0
// @description  Lê o scorecard que a Shopee publica no Looker Studio e entrega ao TMS. Somente leitura.
// @match        https://datastudio.google.com/*/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @match        https://lookerstudio.google.com/*/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @connect      tmsdev.braziltransports.com.br
// @connect      tms.braziltransports.com.br
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

/**
 * O leitor do BSC (2026-08-17).
 *
 * O relatório do scorecard não tem API — o Looker Studio não expõe os valores de um relatório por
 * nenhum caminho suportado. Então este script faz a única coisa que sobra: lê a TELA e entrega o que
 * leu. É um parente do robô do portal, e um parente mais desconfiado, porque texto raspado de tela
 * mente de um jeito que JSON de API não mente.
 *
 * SCRIPT SEPARADO, de propósito. O robô do portal tem uma regra de ouro — somente leitura, três
 * listagens, nenhum clique. Este precisa CLICAR (no filtro de período), e misturar os dois faria a
 * regra daquele virar mentira. Domínios diferentes, arquivos diferentes, riscos diferentes.
 *
 * Quatro regras que este arquivo não pode quebrar:
 *
 *   1. NÃO ESCREVE NADA NO RELATÓRIO. Os únicos cliques são no seletor de período, que é controle de
 *      VISUALIZAÇÃO: muda o que esta sessão do navegador mostra e não altera o relatório para
 *      ninguém. Nenhum outro clique existe.
 *   2. PERÍODO CONFIRMADO OU NADA. Depois de escolher o recorte, confere o rótulo que apareceu. Se
 *      não for o que pediu — porque a Shopee mexeu no seletor —, NÃO manda. Um número com o período
 *      errado é pior que número nenhum, e ao contrário de um erro visível, esse ninguém percebe.
 *   3. SÓ MANDA O QUE MUDOU. O BSC fecha às 4h; reler o mesmo carimbo o dia inteiro não é trabalho, é
 *      ruído. O TMS também protege, mas a economia é aqui.
 *   4. NUNCA TRAVA. Todo erro é engolido e registrado, o ciclo seguinte é agendado a partir do FIM do
 *      anterior, e nada é recursivo.
 *
 * Instalação: Tampermonkey → novo script → cole → ajuste o CONFIG → salve. Precisa de uma aba
 * DEDICADA no relatório, que ninguém use para navegar: o script troca o filtro de período, e uma
 * pessoa mexendo ao mesmo tempo faria os dois brigarem.
 */

/* global GM_xmlhttpRequest */
(function () {
  "use strict";

  const CONFIG = {
    /** Endereço do TMS. Troque para o de produção quando for a hora. */
    tms: "https://tmsdev.braziltransports.com.br",
    /** O mesmo valor de PORTAL_FEED_TOKEN no servidor. */
    token: "COLE_AQUI_O_TOKEN",
    /**
     * De quanto em quanto tempo reler. O BSC fecha às 4h, então de hora em hora é generoso — existe
     * para pegar a virada sem depender de acertar o minuto, e não porque o dado mude.
     */
    intervaloMs: 60 * 60 * 1000,
    /** Quanto esperar o relatório recalcular depois de trocar o período. */
    esperaRecalculoMs: 9000,
  };

  const log = (...a) => console.log("[TMS BSC]", ...a);
  const erro = (...a) => console.warn("[TMS BSC]", ...a);

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Os três recortes, com o texto EXATO do menu e o que o rótulo deve conter depois de aplicado.
   *
   * `confirma` é a trava: é uma pista de que o filtro realmente virou o que pedimos. Sem ela o script
   * mandaria o número de qualquer período que estivesse na tela.
   */
  const RECORTES = [
    { period: "day", menu: "Hoje", confirma: (rotulo) => /\d/.test(rotulo) },
    { period: "week", menu: "Esta semana", confirma: (rotulo) => /\d/.test(rotulo) },
    { period: "month", menu: "Este mês, até agora", confirma: (rotulo) => /\d/.test(rotulo) },
  ];

  /** Todo texto visível da página, elemento a elemento — é assim que se acha rótulo no Looker. */
  function textos() {
    return [...document.querySelectorAll("text, div, span")]
      .map((el) => ({ el, txt: (el.textContent || "").trim() }))
      .filter((x) => x.txt !== "" && x.txt.length < 120);
  }

  /** O primeiro elemento cujo texto é exatamente `alvo`. */
  function acharPorTexto(alvo) {
    const achado = textos().find((x) => x.txt === alvo);
    return achado ? achado.el : null;
  }

  /**
   * O "Atualizado em" do relatório — a idade real do dado, e o que o TMS mostra na tela em vez de
   * fingir frescor. Sem ele o script não manda nada.
   */
  function carimbo() {
    const alvo = textos().find((x) => /Atualizado em/i.test(x.txt));
    if (!alvo) return null;
    const m = /(\d{2,4})[-/](\d{2})[-/](\d{2,4})[ ,]+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(alvo.txt);
    if (!m) return null;
    // O relatório escreve tanto 17/08/2026 quanto 2026-12-08 — o primeiro grupo de 4 dígitos manda.
    const [, a, b, c, hh, mm, ss] = m;
    const iso =
      a.length === 4
        ? `${a}-${b}-${c}T${hh}:${mm}:${ss || "00"}`
        : `${c}-${b}-${a}T${hh}:${mm}:${ss || "00"}`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  /** O rótulo do filtro de período, como está mostrando agora. */
  function rotuloPeriodo() {
    const alvo = textos().find((x) => /^\d+ de \w+\.? de \d{4}/.test(x.txt) || /Selecionar per/i.test(x.txt));
    return alvo ? alvo.txt : "";
  }

  /**
   * Os KPIs: no BSC cada um é um rótulo com o número logo abaixo. Procurar pelo RÓTULO e pegar o
   * vizinho sobrevive a rearranjo de layout; procurar por posição não sobreviveria à primeira vez que
   * alguém mover um bloco.
   */
  const ROTULOS = [
    "Scheduling", "Tendência", "SPOT", "Aderência de Perfil",
    "ETA Origem", "Performance CPT", "No Show", "Plano de Ação",
    "ETA Destino", "Telemetria", "Utilização do APP", "Report de Ocorrências",
    "CMK", "Training", "Atendimento Check List", "Acidente Fatal",
    "Sinistralidade (pct)", "Bloqueio Driver", "Ocorrência - Quebra", "Reversa",
  ];

  function indicadores() {
    const todos = textos();
    const saida = {};
    for (const rotulo of ROTULOS) {
      const i = todos.findIndex((x) => x.txt === rotulo);
      if (i === -1) continue;
      // O valor é o próximo texto que parece percentual. Uma janela curta evita capturar o número de
      // um cartão vizinho quando o indicador está em branco.
      for (let j = i + 1; j < Math.min(i + 6, todos.length); j++) {
        if (/^-?[\d.]+,\d+%?$/.test(todos[j].txt)) {
          saida[rotulo] = todos[j].txt;
          break;
        }
      }
    }
    return saida;
  }

  /** A nota do velocímetro e a faixa em que caiu. */
  function notaEZona() {
    const todos = textos();
    const iZona = todos.findIndex((x) => /^Zona de /.test(x.txt));
    const zona = iZona === -1 ? null : todos[iZona].txt;
    // A nota é o número solto perto do velocímetro: sem % e com vírgula.
    const nota = todos.find((x) => /^\d{1,3},\d{1,2}$/.test(x.txt));
    return { score: nota ? nota.txt : null, zone: zona };
  }

  /** Entrega ao TMS. `GM_xmlhttpRequest` porque a chamada é cross-origin. */
  function entregar(corpo) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.tms}/api/imports/bsc`,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CONFIG.token}` },
        data: JSON.stringify(corpo),
        timeout: 60000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) resolve(JSON.parse(res.responseText || "{}"));
          else reject(new Error(`TMS respondeu ${res.status}: ${String(res.responseText).slice(0, 200)}`));
        },
        onerror: () => reject(new Error("falha de rede ao falar com o TMS")),
        ontimeout: () => reject(new Error("TMS não respondeu a tempo")),
      });
    });
  }

  /**
   * Troca o período no seletor. São os ÚNICOS cliques do script, e todos em controle de
   * visualização: nada é gravado no relatório.
   */
  async function escolherPeriodo(recorte) {
    const seletor = acharPorTexto("Selecionar periodo") || acharPorTexto(rotuloPeriodo());
    if (!seletor) throw new Error("seletor de período não encontrado");
    seletor.click();
    await dormir(1500);

    const automatico = acharPorTexto("Período automático") || acharPorTexto("Este mês, até agora");
    if (!automatico) throw new Error("menu de período automático não encontrado");
    automatico.click();
    await dormir(1200);

    if (recorte.period !== "day") {
      const pai = acharPorTexto(recorte.period === "month" ? "Este mês" : "Esta semana (começa na segunda-feira)");
      if (pai) {
        pai.click();
        await dormir(1000);
      }
    }

    const opcao = acharPorTexto(recorte.menu);
    if (!opcao) throw new Error(`opção "${recorte.menu}" não encontrada`);
    opcao.click();
    await dormir(1000);

    const aplicar = acharPorTexto("Aplicar");
    if (!aplicar) throw new Error("botão Aplicar não encontrado");
    aplicar.click();
    await dormir(CONFIG.esperaRecalculoMs);
  }

  /** O último carimbo enviado por recorte — a economia da regra 3. */
  const ultimo = {};

  async function lerEEnviar(recorte) {
    await escolherPeriodo(recorte);

    const rotulo = rotuloPeriodo();
    if (!recorte.confirma(rotulo)) {
      // A TRAVA. Sem confirmação do período, nada sai daqui.
      erro(`${recorte.period}: o filtro não confirmou (rótulo "${rotulo}") — nada enviado.`);
      return;
    }

    const at = carimbo();
    if (!at) {
      erro(`${recorte.period}: sem "Atualizado em" na tela — nada enviado.`);
      return;
    }
    if (ultimo[recorte.period] === at) {
      log(`${recorte.period}: mesmo carimbo (${at}) — nada mudou.`);
      return;
    }

    const { score, zone } = notaEZona();
    const corpo = {
      period: recorte.period,
      periodLabel: rotulo,
      capturedAt: at,
      score,
      zone,
      indicators: indicadores(),
    };

    const r = await entregar(corpo);
    ultimo[recorte.period] = at;
    log(`${recorte.period}: enviado (${Object.keys(corpo.indicators).length} indicadores)`, r);
  }

  async function ciclo() {
    for (const recorte of RECORTES) {
      try {
        await lerEEnviar(recorte);
      } catch (e) {
        erro(`${recorte.period} falhou (tenta de novo no próximo ciclo):`, e?.message ?? e);
      }
    }
  }

  /** Agenda a partir do FIM do anterior — nunca em paralelo consigo mesmo. */
  function repetir() {
    const passo = async () => {
      try {
        await ciclo();
      } catch (e) {
        erro("ciclo falhou:", e?.message ?? e);
      }
      setTimeout(passo, CONFIG.intervaloMs);
    };
    setTimeout(passo, 15000); // deixa o relatório carregar antes da primeira leitura
  }

  log("ativo. Só leitura: nenhum clique fora do filtro de período.");
  repetir();
})();
