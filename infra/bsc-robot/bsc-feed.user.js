// ==UserScript==
// @name         Brazil TMS — leitor do BSC
// @namespace    braziltransports.com.br
// @version      1.6.0
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
    /** Piso antes de começar a olhar: o relatório nem começou a recalcular nos primeiros segundos. */
    pisoRecalculoMs: 6000,
    /** Quanto tempo a tela precisa ficar IGUAL para a leitura valer — ver `lerEstavel`. */
    patamarMs: 16000,
    /** Teto para a tela parar de mudar. Estourou, não manda — ver `lerEstavel`. */
    limiteRecalculoMs: 120000,
  };

  /**
   * A versão aparece em TODA linha do console, e não só na de partida.
   *
   * Custou uma ida e volta descobrir que um erro relatado vinha da versão anterior ainda instalada:
   * a única pista foi a redação da mensagem ter mudado entre as duas. Com o número em cada linha, "o
   * que está rodando aí" deixa de ser dedução.
   */
  const VERSAO = "1.6.0";
  const log = (...a) => console.log(`[TMS BSC ${VERSAO}]`, ...a);
  const erro = (...a) => console.warn(`[TMS BSC ${VERSAO}]`, ...a);

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Os três recortes, com o caminho EXATO do menu (medido na tela) e o rótulo do TMS.
   *
   * `pai` é o item que precisa ser aberto antes de achar a opção. "Hoje" e "Últimos 7 dias" estão na
   * raiz do menu; só o mês mora num submenu, que abre ao passar o mouse e não ao clicar.
   */
  const RECORTES = [
    { period: "day", pai: null, menu: "Hoje" },
    // A "semana" é JANELA MÓVEL, não semana de calendário, e a razão é medida.
    //
    // "Esta semana (começa na segunda-feira)" foi o que eu usei primeiro, e produziu 17 a 23/08 — dias
    // futuros incluídos, porque a semana mal tinha começado. O relatório devolveu 7 indicadores e
    // nenhuma nota, enquanto o MESMO dia 17/08 sozinho devolvia os 20 completos. Um intervalo que
    // avança sobre datas sem dado quebra o relatório, e o resultado não parece quebrado: parece um
    // desempenho péssimo, com Reversa em 0%.
    //
    // Nenhuma opção de semana de calendário tem variante "até agora" (mês, trimestre e ano têm; a
    // semana não), então não dá para cortar o futuro por ali. "Últimos 7 dias" resolve pela raiz: é
    // uma janela que termina ontem e nunca alcança data sem dado. Medido: rótulo "10 de ago. de 2026 -
    // 16 de ago. de 2026". Fica na raiz do menu, sem submenu, e clicar nela seleciona de fato.
    { period: "week", pai: null, menu: "Últimos 7 dias" },
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
    // SEM `view: window`. Dentro do sandbox do Tampermonkey o `window` é um proxy, não um `Window`
    // de verdade, e o construtor do evento rejeita: "Failed to convert value to 'Window'". O mesmo
    // código roda liso no console da página, onde o `window` é o legítimo — foi assim que passou nos
    // meus testes e quebrou na instalação real. Nenhum controle do Looker lê `event.view`, então a
    // propriedade some em vez de virar dependência de sandbox.
    const opcoes = {
      bubbles: true,
      cancelable: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      button: 0,
      buttons: tipo === "pointerdown" || tipo === "mousedown" ? 1 : 0,
    };
    if (tipo.startsWith("pointer") && typeof PointerEvent === "function") {
      try {
        el.dispatchEvent(
          new PointerEvent(tipo, { ...opcoes, pointerId: 1, pointerType: "mouse", isPrimary: true }),
        );
        return;
      } catch {
        // Ambiente sem PointerEvent utilizável: o MouseEvent com o mesmo nome de tipo entrega o
        // evento aos mesmos ouvintes. Um detalhe de construtor não derruba o ciclo inteiro.
      }
    }
    el.dispatchEvent(new MouseEvent(tipo, opcoes));
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

    // O fuso é o DO NAVEGADOR, não um -03:00 fixo.
    //
    // Eu tinha fixado São Paulo por dedução ("o relatório é brasileiro"). O primeiro carimbo que
    // chegou de verdade provou o contrário: veio 18:55:41 de uma leitura feita às 16h de Brasília —
    // uma hora que ainda não tinha acontecido. O Chromium da VM roda em UTC, e o Looker escreve o
    // "Dados atualizados pela última vez" no relógio de quem está olhando. Somar -03:00 a uma hora
    // que já era UTC empurrava todo carimbo três horas para o futuro, e um dado do futuro nunca
    // aparece como erro: aparece como o dado mais fresco que existe.
    //
    // Deixar o navegador interpretar acerta nos dois casos, porque é exatamente a mesma conta que o
    // Looker fez para escrever o texto.
    const d = new Date(Number(ano), Number(mes) - 1, Number(dia), hora, Number(min), Number(seg || 0));
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
   *
   * A CASA DECIMAL É OPCIONAL, e isso custou dois ciclos inteiros. O relatório escreve o número com as
   * casas que precisar: `62,75` num período, `73` noutro. Exigir vírgula fazia a nota sumir em toda
   * leitura de nota redonda — e, como sem nota a leitura não conta como amostra, o robô passava dois
   * minutos recusando uma tela cheia e reclamando do filtro Transportador.
   *
   * O `110` do eixo do medidor também é um inteiro de três dígitos, mas não tem faixa escrita embaixo.
   * Quem separa os dois é o par, não o formato — e a legenda de cores, que lista as quatro faixas em
   * sequência, é descartada porque um item dela vem sempre seguido de outro.
   */
  const EH_FAIXA = /^(Zona de .+|Fora da faixa)$/;
  const EH_NOTA = /^\d{1,3}(,\d{1,2})?$/;

  function notaEZona() {
    const todos = textos();
    for (let i = 1; i < todos.length; i++) {
      if (!EH_FAIXA.test(todos[i].txt)) continue;
      const antes = todos[i - 1].txt;
      if (EH_NOTA.test(antes)) return { score: antes, zone: todos[i].txt };
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
  }

  /** Tudo que vai ser enviado, como texto — serve para comparar duas leituras da tela. */
  function assinatura(leitura) {
    return JSON.stringify(leitura);
  }

  function lerTela() {
    return { nota: notaEZona(), indicadores: indicadores() };
  }

  /**
   * Uma leitura só é candidata a definitiva se tem INDICADORES. A nota é bem-vinda e não é condição.
   *
   * Antes eu exigia as duas coisas, e isso pendurou a entrega inteira na leitura mais frágil do
   * arquivo: o velocímetro é um número solto identificado pela faixa escrita embaixo dele, enquanto
   * cada indicador é um número identificado pelo próprio nome do cartão. Quando a nota deixou de ser
   * reconhecida — porque num período ela sai `73` e não `62,75` —, o robô passou dois minutos
   * recusando uma tela cheia de indicadores perfeitamente legíveis.
   *
   * A tela em branco continua barrada do mesmo jeito, porque sem dados não há indicador nenhum. O que
   * muda é que uma falha no medidor custa o medidor, e não o painel inteiro: o cartão do TMS já sabe
   * mostrar "—" no lugar da nota.
   */
  function temConteudo(leitura) {
    return Object.keys(leitura.indicadores).length > 0;
  }

  /**
   * Lê a tela quando ela para de mudar E está cheia — as duas coisas, porque uma sem a outra mente.
   *
   * O rótulo do período troca no instante do "Aplicar"; os números levam mais tempo e chegam aos
   * pedaços. A 1.2.1 dormia nove segundos fixos e lia o que estivesse ali: mandou três recortes com a
   * MESMA nota e com 18, 10 e 8 indicadores — no primeiro, a tela anterior inteira; nos outros, uma
   * tela meio carregada. Número pela metade não parece quebrado, parece desempenho ruim.
   *
   * A 1.3.0 trocou o sono por quietude — três leituras iguais — e trocou um erro por outro: enquanto
   * recalcula, o Looker esvazia os cartões para "Não há dados", e a tela VAZIA também fica parada.
   * Quietude sozinha não distingue "terminou" de "ainda não começou", e os três recortes
   * estabilizaram no branco.
   *
   * Daí as três condições, que juntas não têm como confundir carregando com pronto:
   *
   *   TEM CONTEÚDO. Leitura sem nota ou sem indicador nenhum não conta como amostra — é o estado de
   *   transição, não um resultado. (Se a tela ficar vazia o tempo todo, isso vira a resposta: o
   *   chamador avisa que o filtro Transportador deve estar vazio.)
   *
   *   ESTÁ COMPLETA. Só vale a leitura que tem tantos indicadores quanto o MÁXIMO já visto nesta
   *   espera. Cartão aparece conforme carrega, nunca some — então um patamar com menos cartões que já
   *   apareceram é meio caminho, por mais parado que esteja.
   *
   *   PAROU HÁ TEMPO. Não bastam duas ou três amostras iguais: o carregamento tem patamares curtos, e
   *   quatro segundos parado passariam por conclusão. O valor só é aceito depois de `patamarMs` sem
   *   mudar nenhuma vez. É a diferença entre "parou" e "parou de vez", e é o único parâmetro aqui que
   *   é escolha e não medição — está alto de propósito, porque o robô lê de hora em hora e não tem
   *   pressa nenhuma.
   *
   * Não dá para perguntar ao Looker se ele terminou: os elementos de carregamento ficam marcados como
   * ocupados mesmo em repouso (medidos 36 deles, constantes, numa tela sem nada acontecendo).
   */
  async function lerEstavel(antes) {
    await dormir(CONFIG.pisoRecalculoMs);
    const ate = Date.now() + CONFIG.limiteRecalculoMs;
    let anterior = null;
    let desde = 0;
    let mudou = false;
    let viuConteudo = false;
    let maiorQtd = 0;

    while (Date.now() < ate) {
      const leitura = lerTela();
      if (temConteudo(leitura)) {
        viuConteudo = true;
        const qtd = Object.keys(leitura.indicadores).length;
        if (qtd > maiorQtd) {
          // Apareceu cartão novo: o que veio antes era meio caminho, e o relógio reinicia.
          maiorQtd = qtd;
          anterior = null;
        }
        if (qtd === maiorQtd) {
          const agora = assinatura(leitura);
          if (agora !== antes) mudou = true;
          if (agora === anterior) {
            if (Date.now() - desde >= CONFIG.patamarMs) {
              return { leitura, mudou, viuConteudo, segundos: Math.round((Date.now() - desde) / 1000) };
            }
          } else {
            anterior = agora;
            desde = Date.now();
          }
        }
      } else {
        // Tela em transição: descarta a série, não é patamar.
        anterior = null;
      }
      await dormir(2000);
    }
    return { leitura: null, mudou, viuConteudo };
  }

  /** O último carimbo enviado por recorte — a economia da regra 3. */
  const ultimo = {};

  async function lerEEnviar(recorte) {
    // Guardado ANTES de mexer no filtro: é contra isto que se sabe se o relatório recalculou.
    const antes = assinatura(lerTela());
    await escolherPeriodo(recorte);

    // A TRAVA. O seletor voltando a dizer "Selecionar período" significa que o filtro NÃO pegou —
    // e a tela então mostra o período anterior, com números que não são do recorte pedido.
    const rotulo = rotuloPeriodo();
    if (!rotulo || /^Selecionar per/i.test(rotulo) || !/\d/.test(rotulo)) {
      erro(`${recorte.period}: o filtro não confirmou (rótulo "${rotulo}") — nada enviado.`);
      return;
    }

    const estavel = await lerEstavel(antes);
    const limiteS = CONFIG.limiteRecalculoMs / 1000;
    if (!estavel.leitura) {
      // As duas saídas sem leitura dizem coisas diferentes, e confundi-las custou um ciclo inteiro:
      // tela que NUNCA teve números é preparo da aba; tela que teve e não assentou é o relatório
      // demorando mais que o teto.
      erro(
        estavel.viuConteudo
          ? `${recorte.period}: a tela não assentou em ${limiteS}s — nada enviado (número pela ` +
              `metade parece desempenho ruim).`
          : `${recorte.period}: a tela ficou ${limiteS}s sem nota nem indicador — nada enviado. ` +
              `Confira se o filtro "Transportador" está preenchido nesta aba.`,
      );
      return;
    }
    if (!estavel.mudou) {
      // Não é motivo para recusar — o rótulo já provou que o filtro pegou, e dois recortes podem dar
      // o mesmo resultado. Mas fica dito, porque é a assinatura de uma leitura que não recalculou.
      log(`${recorte.period}: a tela estabilizou sem mudar de valores.`);
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

    // Nota e indicadores existem por construção: `lerEstavel` só devolve leitura com conteúdo.
    const { score, zone } = estavel.leitura.nota;
    const indicators = estavel.leitura.indicadores;

    const r = await entregar({
      period: recorte.period,
      periodLabel: rotulo,
      capturedAt: at,
      score,
      zone,
      indicators,
    });
    ultimo[recorte.period] = at;
    // A contagem de indicadores e o tempo de patamar vão para o console de propósito: são o que
    // denuncia uma leitura meio carregada que tenha escapado. Três recortes com contagens muito
    // diferentes é sinal de que a régua do patamar está curta demais.
    log(
      `${recorte.period}: enviado — ${Object.keys(indicators).length} indicadores, ` +
        `tela parada há ${estavel.segundos}s, nota ${score ?? "(não lida)"}`,
      r,
    );
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
