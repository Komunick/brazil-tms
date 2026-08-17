// ==UserScript==
// @name         Brazil TMS — leitor do BSC
// @namespace    braziltransports.com.br
// @version      1.2.0
// @description  Lê o scorecard que a Shopee publica no Looker Studio e entrega ao TMS. Somente leitura.
// @match        https://datastudio.google.com/*/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @match        https://datastudio.google.com/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @match        https://lookerstudio.google.com/*/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @match        https://lookerstudio.google.com/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
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
 *   2. CONFIRMADO OU NADA. Depois de escolher o recorte, confere o rótulo que apareceu. Se não for o
 *      que pediu — porque a Shopee mexeu no seletor —, NÃO manda. Um número com o período errado é
 *      pior que número nenhum, e ao contrário de um erro visível, esse ninguém percebe.
 *   3. SÓ MANDA O QUE MUDOU. O BSC fecha às 4h; reler o mesmo carimbo o dia inteiro não é trabalho, é
 *      ruído. O TMS também protege, mas a economia é aqui.
 *   4. NUNCA TRAVA. Todo erro é engolido e registrado, o ciclo seguinte é agendado a partir do FIM do
 *      anterior, e nada é recursivo.
 *
 * ── O QUE A VERSÃO 1.0.0 ERRAVA (medido na tela em 2026-08-17, não deduzido) ────────────────────
 *
 * A 1.0.0 nunca mandou um único número, e por quatro motivos independentes. Ficam registrados porque
 * cada um é uma armadilha que volta se alguém "simplificar" o arquivo:
 *
 *   O CARIMBO NÃO SE CHAMA "Atualizado em". O relatório escreve, no rodapé, "Dados atualizados pela
 *   última vez: 17/08/2026 12:32:43". Existe TAMBÉM um rótulo "Atualizado em:" no cabeçalho, mas o
 *   valor dele mora em outro elemento — procurar data e hora dentro do mesmo texto que "Atualizado
 *   em" nunca acha nada. Como sem carimbo o script (corretamente) se recusa a mandar, essa sozinha já
 *   garantia silêncio total.
 *
 *   NENHUM ELEMENTO VISÍVEL TEM O TEXTO EXATO. O Looker desenha ícone com fonte de ligadura: o `<i>`
 *   do calendário contém, literalmente, a palavra `calendar_today`. O controle do período tem então
 *   como texto `calendar_today Selecionar período arrow_drop_down`, e o único elemento cujo texto
 *   bate exatamente é um nó de 1x16 px que o Looker mantém fora da tela. A 1.0.0 clicava nele — no
 *   vazio. A 1.1.1 passou a exigir que o elemento fosse clicável e, sem tirar os ícones do texto,
 *   passou a não achar nada. Ambas as versões erravam a mesma coisa por lados opostos: comparar
 *   contra o texto CRU.
 *
 *   `el.click()` NÃO ABRE O MENU. Os controles escutam `mousedown`/`mouseup`; o clique do DOM dispara
 *   só o `click`. A sequência que abre é pointerdown → mousedown → pointerup → mouseup → click, e o
 *   submenu abre no passar do mouse, não no clique. Tudo isso foi medido abrindo o seletor na página
 *   real, não deduzido do HTML.
 *
 *   O IDIOMA NÃO É GARANTIDO. A mesma conta, no mesmo navegador, abriu o relatório em inglês: "Select
 *   date range", "100.00%", "No data". Em inglês o ponto é DECIMAL, e o leitor de números do TMS lê
 *   ponto como separador de milhar — "100.00%" viraria 10.000%. Por isso a aba tem que abrir com
 *   `?hl=pt-BR` e o script CONFERE o idioma antes de qualquer coisa.
 *
 *   O FILTRO "Transportador" NÃO PERSISTE. Numa aba recém-aberta ele vem vazio e o relatório inteiro
 *   mostra "Não há dados" — inclusive o velocímetro. O script não tem como adivinhar qual
 *   transportador escolher, então a aba precisa ser preparada UMA VEZ à mão; o que ele faz é se
 *   recusar a mandar quando a nota não está na tela, em vez de gravar um zero que ninguém saberia de
 *   onde veio.
 *
 * ── PREPARO DA ABA (uma vez, à mão) ────────────────────────────────────────────────────────────
 *
 *   1. Abrir o relatório com `?hl=pt-BR` no fim da URL.
 *   2. Escolher o Transportador no filtro do topo.
 *   3. Deixar a aba DEDICADA: ninguém navega nela. O script troca o filtro de período, e uma pessoa
 *      mexendo ao mesmo tempo faria os dois brigarem.
 *
 * Instalação: Tampermonkey → novo script → cole → ajuste o CONFIG → salve.
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

  /**
   * A versão aparece em TODA linha do console, e não só na de partida.
   *
   * Custou uma ida e volta descobrir que um erro relatado vinha da versão anterior ainda instalada:
   * a única pista foi a redação da mensagem ter mudado entre as duas. Com o número em cada linha, "o
   * que está rodando aí" deixa de ser dedução.
   */
  const VERSAO = "1.2.0";
  const log = (...a) => console.log(`[TMS BSC ${VERSAO}]`, ...a);
  const erro = (...a) => console.warn(`[TMS BSC ${VERSAO}]`, ...a);

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Os três recortes, com o caminho EXATO do menu (medido na tela) e o rótulo do TMS.
   *
   * `pai` é o item que precisa ser aberto antes: "Hoje" está na raiz do menu, mas semana e mês moram
   * num submenu que só aparece ao passar o mouse. O texto das opções de semana vem com a regra do
   * primeiro dia embutida — "(começa na segunda-feira)" faz parte do nome, não é decoração.
   */
  const RECORTES = [
    { period: "day", pai: null, menu: "Hoje" },
    // Semana e mês saem do MESMO submenu — o que abre sob "Este mês" lista os dois, junto com
    // trimestre e ano. Medido na tela: não existe um submenu por família.
    //
    // A semana é a ÚNICA sem variante "até agora": mês, trimestre e ano têm as duas, a semana só tem
    // a inteira. Então este recorte vai de segunda a domingo, com os dias futuros ainda vazios — não
    // é escolha, é o que o menu oferece. Como o rótulo do intervalo viaja junto com os números até o
    // painel, a tela mostra "17 de ago. - 23 de ago." e ninguém confunde com semana fechada.
    { period: "week", pai: "Este mês", menu: "Esta semana (começa na segunda-feira)" },
    { period: "month", pai: "Este mês", menu: "Este mês, até agora" },
  ];

  /**
   * Os nomes que o botão de modo pode estar exibindo — ele mostra o modo em vigor, não um rótulo
   * fixo. "Período automático" é só o estado de uma aba que ninguém mexeu ainda.
   */
  const MODOS = [
    "Período automático",
    "Fixo",
    "Avançado",
    "Ontem",
    ...RECORTES.map((r) => r.menu),
  ];

  /** Todo texto visível da página, elemento a elemento — é assim que se acha rótulo no Looker. */
  function textos() {
    return [...document.querySelectorAll("text, div, span")]
      .map((el) => ({ el, txt: (el.textContent || "").trim() }))
      .filter((x) => x.txt !== "" && x.txt.length < 140);
  }

  /**
   * Um elemento só serve para clicar se ocupa espaço na tela.
   *
   * O Looker guarda cópias fora de vista do mesmo texto (rótulos de acessibilidade, medidores de
   * largura). Elas casam por texto e não casam com nada que o usuário veja — clicar nelas é clicar no
   * vazio, e foi assim que a 1.0.0 "abriu" um menu que nunca abriu.
   */
  function clicavel(el) {
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && el.offsetParent !== null;
  }

  /** Profundidade no DOM — serve para preferir o elemento mais interno, que é o que recebe o clique. */
  function profundidade(el) {
    let n = 0;
    for (let p = el; p; p = p.parentElement) n++;
    return n;
  }

  /**
   * O texto de um elemento SEM os nomes dos ícones.
   *
   * O Looker desenha ícone com fonte de ligadura: o `<i>` do calendário contém, literalmente, a
   * palavra `calendar_today`, e a setinha contém `arrow_drop_down`. Então o controle do período tem
   * como texto `calendar_today Selecionar período arrow_drop_down`, e NENHUM elemento visível tem o
   * texto exato "Selecionar período" — só um nó de 1x16 px que o Looker guarda fora da tela. Procurar
   * texto exato no texto cru acha o nó invisível e mais nada; foi assim que a 1.0.0 clicou no vazio e
   * a 1.1.1 concluiu que o seletor não existia.
   *
   * Clonar sai caro, então só é chamado sobre os poucos elementos que já contêm o alvo.
   */
  function textoLimpo(el) {
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll("i, .material-icons, .material-icons-extended, .google-symbols")
      .forEach((n) => n.remove());
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  /** O elemento CLICÁVEL cujo texto (sem ícones) é exatamente `alvo`, preferindo o mais interno. */
  function acharPorTexto(alvo) {
    // Alvo vazio casaria com todo elemento sem texto da página, e o script clicaria num `div`
    // qualquer. Quem chama com "" está dizendo "não sei o que procurar" — a resposta é nada.
    if (!alvo) return null;
    return (
      [...document.querySelectorAll("div,span,button,li,text,ng2-canvas-component")]
        .filter((el) => {
          const cru = el.textContent || "";
          return cru.length < 200 && cru.includes(alvo);
        })
        .filter((el) => textoLimpo(el) === alvo)
        .sort((a, b) => profundidade(b) - profundidade(a))
        .find(clicavel) || null
    );
  }

  /**
   * Um clique de verdade, não `el.click()`.
   *
   * Os controles do Looker escutam `mousedown`/`mouseup`; o `.click()` do DOM dispara só o `click` e
   * o menu não abre. A sequência abaixo é a que foi medida abrindo o seletor na página real.
   */
  function eventoDeMouse(el, tipo) {
    const r = el.getBoundingClientRect();
    const opcoes = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      button: 0,
    };
    const Ev = tipo.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ev(tipo, opcoes));
  }

  function clicar(el) {
    for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      eventoDeMouse(el, tipo);
    }
  }

  /** Abre um submenu. O Looker abre no passar do mouse, não no clique. */
  function passarMouse(el) {
    for (const tipo of ["pointerover", "mouseover", "mouseenter", "mousemove"]) {
      eventoDeMouse(el, tipo);
    }
  }

  /**
   * Espera o elemento aparecer, em vez de dormir um tanto e torcer.
   *
   * O Looker redesenha o controle depois de recalcular, e existe uma janela de alguns décimos em que
   * ele simplesmente não está no DOM. Uma busca instantânea depois de um `dormir` de valor fixo cai
   * nessa janela de vez em quando — o mesmo passo falhou e, repetido, passou. Sono fixo é chute sobre
   * a máquina mais lenta; isto devolve assim que aparece e só desiste no limite.
   */
  async function esperarPorTexto(alvo, limiteMs = 8000) {
    return esperarQualquer([alvo], limiteMs);
  }

  /** O primeiro da lista que aparecer — quando o rótulo do controle depende do estado dele. */
  async function esperarQualquer(alvos, limiteMs = 8000) {
    const ate = Date.now() + limiteMs;
    for (;;) {
      for (const alvo of alvos) {
        const achado = acharPorTexto(alvo);
        if (achado) return achado;
      }
      if (Date.now() >= ate) return null;
      await dormir(300);
    }
  }

  /**
   * O idioma é pré-condição, não detalhe.
   *
   * Em inglês o relatório escreve "100.00%", e o ponto ali é DECIMAL. O TMS lê ponto como separador
   * de milhar (é o certo em pt-BR), então o mesmo texto viraria um número mil vezes maior. Não existe
   * jeito seguro de adivinhar o idioma pelo número — 1.877 é legítimo nos dois. Então: ou a tela está
   * em português, ou este script não fala.
   */
  function estaEmPortugues() {
    const t = document.body.innerText || "";
    return /Selecionar per[ií]odo/.test(t) || /Dados atualizados pela última vez/.test(t);
  }

  /**
   * O carimbo do relatório — a idade real do dado, e o que o TMS mostra na tela em vez de fingir
   * frescor. Sem ele o script não manda nada.
   *
   * Aceita o rodapé em português ("Dados atualizados pela última vez: 17/08/2026 12:32:43") e o em
   * inglês ("Data Last Updated: 8/17/2026 12:32:43 PM"), porque o segundo aparece quando alguém
   * esquece o `?hl=pt-BR` — e é melhor o carimbo sair certo e a checagem de idioma barrar a entrega do
   * que os dois falharem juntos e o motivo virar adivinhação.
   */
  const CARIMBO_RE =
    /(?:Dados atualizados pela última vez|Data Last Updated)\s*:?\s*(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i;

  function carimbo() {
    const alvo = textos().find((x) => CARIMBO_RE.test(x.txt));
    if (!alvo) return null;
    const m = CARIMBO_RE.exec(alvo.txt);
    const [, g1, g2, g3, h, min, seg, meridiano] = m;

    let ano, mes, dia;
    if (g1.length === 4) {
      // 2026-08-17
      [ano, mes, dia] = [g1, g2, g3];
    } else if (Number(g1) > 12) {
      // 17/08/2026 — só pode ser dia primeiro
      [dia, mes, ano] = [g1, g2, g3];
    } else if (Number(g2) > 12) {
      // 8/17/2026 — só pode ser mês primeiro
      [mes, dia, ano] = [g1, g2, g3];
    } else {
      // Ambíguo (05/08/2026). O AM/PM é a assinatura do formato inglês; sem ele, é pt-BR.
      if (meridiano) [mes, dia, ano] = [g1, g2, g3];
      else [dia, mes, ano] = [g1, g2, g3];
    }

    let hora = Number(h);
    if (meridiano) {
      const pm = /pm/i.test(meridiano);
      if (pm && hora < 12) hora += 12;
      if (!pm && hora === 12) hora = 0;
    }

    const p2 = (v) => String(v).padStart(2, "0");
    // O fuso vai FIXO em -03:00, e não pelo relógio da máquina: o relatório publica em horário de
    // São Paulo, e o robô pode acabar rodando numa VM em UTC. Deixar o navegador interpretar
    // deslocaria todo carimbo em três horas sem nenhum sintoma visível. O Brasil não tem mais horário
    // de verão desde 2019, então -03:00 é constante.
    const iso = `${ano}-${p2(mes)}-${p2(dia)}T${p2(hora)}:${p2(min)}:${p2(seg || 0)}-03:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  /** O rótulo do filtro de período, como está mostrando agora. */
  function rotuloPeriodo() {
    const limpos = textos()
      .map((x) => x.txt.replace(/calendar_today|arrow_drop_down/g, "").trim())
      .filter((t) => t !== "");
    const intervalo = limpos.find((t) => /^\d{1,2} de \S+ de \d{4}/i.test(t));
    if (intervalo) return intervalo;
    return limpos.find((t) => /^Selecionar per[ií]odo$/i.test(t)) || "";
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

  /** Formato pt-BR: exige vírgula decimal ou o símbolo de porcentagem — "110" do eixo não entra. */
  const VALOR_RE = /^-?[\d.]+(,\d+)?%?$/;
  const ehValor = (t) => VALOR_RE.test(t) && (t.includes(",") || t.endsWith("%"));

  function indicadores() {
    const todos = textos();
    const saida = {};
    for (const rotulo of ROTULOS) {
      const i = todos.findIndex((x) => x.txt === rotulo);
      if (i === -1) continue;
      // O valor é o próximo texto que parece número. Uma janela curta evita capturar o número de um
      // cartão vizinho quando o indicador está em branco.
      for (let j = i + 1; j < Math.min(i + 6, todos.length); j++) {
        if (ehValor(todos[j].txt)) {
          saida[rotulo] = todos[j].txt;
          break;
        }
      }
    }
    return saida;
  }

  /**
   * A nota do velocímetro e a faixa em que caiu.
   *
   * O par é o que identifica: a legenda em que a nota caiu fica ESCRITA LOGO ABAIXO do número, dentro
   * do medidor. Pegar "o primeiro número com vírgula da página" pegaria qualquer pontuação de bloco;
   * pegar "o primeiro 'Zona de …'" pegaria a legenda de cores, que lista as quatro. Só o par número +
   * faixa colados identifica o medidor — e quando ele não está na tela (filtro vazio), não acha nada,
   * que é exatamente o que se quer.
   */
  function notaEZona() {
    const todos = textos();
    for (let i = 1; i < todos.length; i++) {
      const faixa = todos[i].txt;
      if (!/^(Zona de .+|Fora da faixa)$/.test(faixa)) continue;
      const antes = todos[i - 1].txt;
      if (/^\d{1,3},\d{1,2}$/.test(antes)) return { score: antes, zone: faixa };
    }
    return { score: null, zone: null };
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
   * Fecha qualquer popup aberto, com Esc.
   *
   * Sem isto, UMA falha no meio do caminho deixa o calendário aberto — e com ele aberto o controle
   * fechado não existe mais no DOM, então TODOS os ciclos seguintes falham no primeiro passo. O robô
   * não tem quem aperte Esc por ele: ou ele limpa a própria bagunça antes de começar, ou o primeiro
   * tropeço vira pane permanente.
   */
  async function fecharPopups() {
    for (const tipo of ["keydown", "keyup"]) {
      document.dispatchEvent(
        new KeyboardEvent(tipo, { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }),
      );
    }
    await dormir(600);
  }

  /**
   * Troca o período no seletor. São os ÚNICOS cliques do script, e todos em controle de
   * visualização: nada é gravado no relatório.
   */
  async function escolherPeriodo(recorte) {
    await fecharPopups();

    const seletor =
      (await esperarPorTexto(rotuloPeriodo())) || (await esperarPorTexto("Selecionar período"));
    if (!seletor) throw new Error("seletor de período não encontrado");
    clicar(seletor);

    // O botão de modo NÃO se chama sempre "Período automático": ele mostra o modo que está valendo.
    // Numa aba virgem é "Período automático"; depois que o robô aplica "Hoje", ele passa a se chamar
    // "Hoje" — e procurar o nome antigo faz o segundo ciclo falhar onde o primeiro tinha passado.
    // Por isso a busca é pelo CONJUNTO de nomes possíveis, não por um.
    const modo = await esperarQualquer(MODOS);
    if (!modo) throw new Error(`nenhum modo de período na tela (esperava um de: ${MODOS.join(", ")})`);
    clicar(modo);

    // "Hoje" está na raiz; semana e mês moram atrás de um submenu que abre no passar do mouse.
    let opcao = await esperarPorTexto(recorte.menu, 2000);
    if (!opcao && recorte.pai) {
      const pai = await esperarPorTexto(recorte.pai);
      if (!pai) throw new Error(`submenu "${recorte.pai}" não encontrado`);
      passarMouse(pai);
      opcao = await esperarPorTexto(recorte.menu);
    }
    if (!opcao) throw new Error(`opção "${recorte.menu}" não encontrada`);
    clicar(opcao);

    const aplicar = await esperarPorTexto("Aplicar");
    if (!aplicar) throw new Error("botão Aplicar não encontrado");
    clicar(aplicar);
    await dormir(CONFIG.esperaRecalculoMs);
  }

  /** O último carimbo enviado por recorte — a economia da regra 3. */
  const ultimo = {};

  async function lerEEnviar(recorte) {
    await escolherPeriodo(recorte);

    // A TRAVA. O seletor voltando a dizer "Selecionar período" significa que o filtro NÃO pegou —
    // e a tela então mostra o período anterior, com números que não são do recorte pedido.
    const rotulo = rotuloPeriodo();
    if (!rotulo || /^Selecionar per/i.test(rotulo) || !/\d/.test(rotulo)) {
      erro(`${recorte.period}: o filtro não confirmou (rótulo "${rotulo}") — nada enviado.`);
      return;
    }

    const at = carimbo();
    if (!at) {
      erro(`${recorte.period}: sem "Dados atualizados pela última vez" na tela — nada enviado.`);
      return;
    }
    if (ultimo[recorte.period] === at) {
      log(`${recorte.period}: mesmo carimbo (${at}) — nada mudou.`);
      return;
    }

    const { score, zone } = notaEZona();
    const indicators = indicadores();
    if (score == null || Object.keys(indicators).length === 0) {
      // Quase sempre é o filtro Transportador vazio: sem ele o relatório inteiro vira "Não há dados".
      erro(
        `${recorte.period}: nota/indicadores ausentes na tela — nada enviado. ` +
          `Confira se o filtro "Transportador" está preenchido nesta aba.`,
      );
      return;
    }

    const r = await entregar({
      period: recorte.period,
      periodLabel: rotulo,
      capturedAt: at,
      score,
      zone,
      indicators,
    });
    ultimo[recorte.period] = at;
    log(`${recorte.period}: enviado (${Object.keys(indicators).length} indicadores)`, r);
  }

  async function ciclo() {
    if (!estaEmPortugues()) {
      erro(
        "o relatório não está em português — nada será lido. Reabra esta aba com ?hl=pt-BR no fim da " +
          "URL. (Em inglês o ponto é decimal e os números seriam lidos mil vezes maiores.)",
      );
      return;
    }
    for (const recorte of RECORTES) {
      try {
        await lerEEnviar(recorte);
      } catch (e) {
        erro(`${recorte.period} falhou (tenta de novo no próximo ciclo):`, e?.message ?? e);
        // Limpa o que a falha deixou aberto para o próximo recorte não herdar a bagunça.
        await fecharPopups();
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
