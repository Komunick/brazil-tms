// ==UserScript==
// @name         Brazil TMS — leitor do BSC
// @namespace    braziltransports.com.br
// @version      1.17.0
// @description  Lê o scorecard que a Shopee publica no Looker Studio e entrega ao TMS. Somente leitura.
// @match        https://datastudio.google.com/*/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @match        https://datastudio.google.com/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @match        https://lookerstudio.google.com/*/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @match        https://lookerstudio.google.com/reporting/5122833b-f83e-4786-b6fb-3cb9cd8f84e8/*
// @connect      tmsdev.braziltransports.com.br
// @connect      tms.braziltransports.com.br
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// Sem estas duas linhas o Tampermonkey nunca procura versão nova, e cada correção vira "abra a URL,
// clique em Reinstalar". Isso já custou uma instalação errada: os dois robôs desta VM moram no mesmo
// servidor e estavam ambos na 1.7.0, então abrir o arquivo do portal por engano mostrava "versão
// instalada 1.7.0, nada a atualizar" — e parecia que a correção do BSC não tinha saído.
// @updateURL    http://127.0.0.1:8899/bsc-feed.user.js
// @downloadURL  http://127.0.0.1:8899/bsc-feed.user.js
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
 * listagens, nenhum clique. Este precisa CLICAR (nos filtros de período e transportador), e misturar os dois faria a
 * regra daquele virar mentira. Domínios diferentes, arquivos diferentes, riscos diferentes.
 *
 * Quatro regras que este arquivo não pode quebrar:
 *
 *   1. NÃO ESCREVE NADA NO RELATÓRIO. Os únicos cliques são no seletor de período e no filtro
 *      "Transportador" — os dois são controles de VISUALIZAÇÃO: mudam o que esta sessão do
 *      navegador mostra e não alteram o relatório para ninguém. Nenhum outro clique existe.
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
 *   O FILTRO "Transportador" PODE VIR VAZIO — e aqui a afirmação antiga estava forte demais. Ela
 *   dizia "não persiste", e a medição de 2026-08-18 mostrou o contrário no caso que mais importa: o
 *   Chromium foi reiniciado inteiro, com o mesmo perfil, e o filtro voltou aplicado — o robô não
 *   precisou repor nada. O estado vazio é real, mas pertence à aba/perfil SEM histórico (a primeira
 *   preparação, dados de site limpos), não a todo reinício.
 *
 *   Quando acontece, o relatório inteiro mostra "Não há dados", inclusive o velocímetro. Desde a
 *   1.12.0 isso é trabalho do robô: ver `garantirTransportador`, que não custa nada quando o filtro
 *   já está lá. O que continua valendo é a recusa — sem nota na tela, ele não manda, em vez de
 *   gravar um zero que ninguém saberia de onde veio.
 *
 * ── PREPARO DA ABA (uma vez, à mão) ────────────────────────────────────────────────────────────
 *
 *   1. Abrir o relatório com `?hl=pt-BR` no fim da URL.
 *   2. Deixar a aba DEDICADA: ninguém navega nela. O script troca o filtro de período, e uma pessoa
 *      mexendo ao mesmo tempo faria os dois brigarem.
 *
 *   O transportador não está mais nesta lista de propósito: era o item que ninguém lembrava, falhava
 *   calado e derrubava o BSC até alguém reparar num carimbo velho.
 *
 * Instalação: Tampermonkey → novo script → cole → ajuste o CONFIG → salve.
 */

/* global GM_xmlhttpRequest, GM_info */
(function () {
  "use strict";

  const CONFIG = {
    /**
     * Endereço do TMS. PRODUÇÃO desde 2026-08-22.
     *
     * Era o de dev, com um recado dizendo "troque quando for a hora". A hora chegou, e o recado
     * quase custou caro no robô executor: instalar o arquivo do repositório por cima do que roda na
     * VM apontou um robô de PRODUÇÃO para o dev. O estrago desse engano não dá sinal nenhum — robô
     * vivo, sem erro em lugar algum, falando com um banco que ninguém olha.
     *
     * O arquivo do repositório é o que se instala. Ele tem de nascer apontando para onde de fato
     * vai rodar; quem quiser testar contra o dev troca esta linha na cópia dele, não o contrário.
     */
    tms: "https://tms.braziltransports.com.br",
    /** O mesmo valor de PORTAL_FEED_TOKEN no servidor. */
    token: "COLE_AQUI_O_TOKEN",
    /**
     * O valor do filtro "Transportador" do relatório, reposto quando a tela aparece vazia.
     *
     * Lido da lista do próprio controle: hoje ela tem esta única opção. Fica em CONFIG e não no
     * código porque é um nome do cliente — se a Shopee renomear, muda aqui e o robô volta a achar,
     * em vez de alguém ter que caçar a string no meio do arquivo.
     */
    transportador: "BRAZIL TRANSPORTS",
    /**
     * De quanto em quanto tempo ACORDAR. Acordar não é ler: desde a 1.13.0 o robô confere o carimbo
     * do rodapé — que está na tela sem clique nenhum — e só faz o ciclo completo se o relatório
     * republicou. Como o BSC fecha uma vez por dia, isso dá UMA leitura diária de verdade.
     *
     * De hora em hora, então, é generoso de propósito: existe para pegar a virada sem depender de
     * acertar o minuto, e agora custa quase nada quando não há nada novo.
     */
    intervaloMs: 60 * 60 * 1000,
    /** Piso antes de começar a olhar: o relatório nem começou a recalcular nos primeiros segundos. */
    pisoRecalculoMs: 6000,
    /** Quanto tempo a tela precisa ficar IGUAL para a leitura valer — ver `lerEstavel`. */
    patamarMs: 16000,
    /**
     * Teto para a tela virar OUTRA e parar. Estourou, não manda — ver `lerEstavel`.
     *
     * Subiu de 2 para 3 minutos junto com a quarta condição (1.10.0). Antes, estourar significava
     * mandar meia tela; agora significa pular o recorte neste ciclo, o que é barato — o robô lê de
     * hora em hora. Dado o custo de errar ter virado o custo de esperar, esperar mais sai de graça.
     */
    limiteRecalculoMs: 180000,
    /**
     * DE QUANTO EM QUANTO TEMPO RECARREGAR A PÁGINA (2026-08-19).
     *
     * O Looker NÃO refaz a consulta sozinho numa aba que fica aberta. Medido em produção: a aba do
     * robô estava aberta desde a véspera, o rodapé dizia "Dados atualizados pela última vez:
     * 19/08/2026 00:50:18 **(alguns itens na página não estão atualizados)**", e o relatório do
     * cliente, no cabeçalho, já dizia 04:12:45. Um F5 à mão trouxe o carimbo para 12:52 — doze horas
     * de dado que estavam paradas atrás de cache.
     *
     * Essa é a pior forma de falhar, e é a MESMA do robô do portal: o número continua na tela, com a
     * cor certa, parecendo atual. O carimbo denuncia, e carimbo é a linha que ninguém lê.
     *
     * Quatro horas, e não uma: recarregar joga fora o `ultimoCarimboDoCiclo` (ele vive na memória da
     * página), então a primeira leitura depois do reload sempre faz o ciclo completo. Com o intervalo
     * de uma hora, recarregar a cada quatro custa um ciclo completo a mais por dia e cobre folgado um
     * relatório que fecha uma vez por dia.
     *
     * `0` desliga.
     */
    recarregarAposMs: 4 * 60 * 60 * 1000,
  };

  /**
   * A versão aparece em TODA linha do console, e não só na de partida.
   *
   * Custou uma ida e volta descobrir que um erro relatado vinha da versão anterior ainda instalada:
   * a única pista foi a redação da mensagem ter mudado entre as duas. Com o número em cada linha, "o
   * que está rodando aí" deixa de ser dedução.
   *
   * E VEM DO CABEÇALHO, não de uma constante copiada (1.11.0). A constante era escrita à mão e
   * envelheceu calada: a 1.10.0 saiu com o `@version` novo e o console ainda dizendo 1.9.0 — ou seja,
   * a linha que existe para provar qual versão está rodando passou a mentir sobre exatamente isso.
   * `GM_info` é a única fonte que não pode divergir do que o Tampermonkey instalou.
   */
  const VERSAO =
    (typeof GM_info !== "undefined" && GM_info?.script?.version) || "versão desconhecida";
  const log = (...a) => console.log(`[TMS BSC ${VERSAO}]`, ...a);
  const erro = (...a) => console.warn(`[TMS BSC ${VERSAO}]`, ...a);

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Os três recortes, com o caminho EXATO do menu (medido na tela) e o rótulo do TMS.
   *
   * `pai` é o item que precisa ser aberto antes de achar a opção. "Ontem" está na raiz do menu; só o
   * mês mora num submenu, que abre ao passar o mouse e não ao clicar. A janela semanal não usa o
   * menu: monta o intervalo no "Avançado".
   */
  /**
   * A semana da operação: SEGUNDA a DOMINGO, sete dias (2026-08-19, a pedido).
   *
   * Era domingo a segunda, nove dias com as duas pontas contando — e nove dias não é uma semana: o
   * domingo e a segunda apareciam DUAS vezes no cálculo, uma em cada ponta. O usuário corrigiu para
   * a semana de calendário, que é a que a operação usa para comparar um período com o outro.
   *
   * O "Avançado" do Looker só sabe contar para trás a partir de hoje ("Hoje menos N"), então a
   * âncora de calendário vira aritmética aqui: o fim é o ÚLTIMO DOMINGO já fechado e o início é a
   * segunda-feira seis dias antes dele.
   *
   *   quarta 19/08  → fim = hoje menos 3 (16, domingo), início = hoje menos 9 (10, segunda)
   *   domingo 23/08 → fim = hoje menos 7 (16, domingo), início = hoje menos 13 (10, segunda)
   *   segunda 24/08 → fim = hoje menos 1 (23, domingo), início = hoje menos 7 (17, segunda)
   *
   * Repare no domingo: ele conta 7 e não 0. Um domingo só entra na janela quando já ACABOU — no
   * próprio domingo o dia ainda está correndo, e incluí-lo poria data sem dado dentro do intervalo.
   * Foi esse o defeito que derrubou as duas primeiras tentativas de recorte semanal (ver o comentário
   * do RECORTE, logo abaixo): intervalo que avança sobre o futuro não parece quebrado, parece
   * desempenho péssimo.
   *
   * A janela vira numa segunda-feira, e nunca invade o futuro.
   */
  function janelaSemanal(hoje = new Date()) {
    // getDay(): 0 = domingo. No domingo, volta uma semana inteira em vez de zero — ver acima.
    const dia = hoje.getDay();
    const fimMenos = dia === 0 ? 7 : dia;
    return { inicioMenos: fimMenos + 6, fimMenos };
  }

  const RECORTES = [
    // ONTEM, e não "Hoje", porque o BSC fecha às 04h com os dados até o dia anterior.
    //
    // Medido: "Hoje" (17/08 sozinho) devolveu 7 indicadores e nenhuma nota, enquanto o mês "até
    // agora" veio como "1 a 16 de agosto" — o próprio relatório exclui o dia corrente. "Hoje" não é
    // um recorte quase vazio por acaso do horário: ele é estruturalmente vazio, a qualquer hora.
    //
    // Isso desmente uma leitura anterior que eu tinha dado por boa: quando o recorte de dia apareceu
    // com 20 indicadores e nota 72,8, era a tela AINDA SEM FILTRO — a mesma 72,8 reapareceu depois na
    // janela de nove dias. Primeiro recorte do ciclo é o mais fácil de confundir com a tela de
    // partida, e é por isso que `lerEstavel` registra quando estabiliza sem mudar de valores.
    { period: "day", pai: null, menu: "Ontem" },
    // A SEMANA — SEGUNDA a DOMINGO, sete dias, ancorada no CALENDÁRIO e não em hoje.
    //
    // Nasceu como "nove dias terminando hoje" (Hoje menos 8 → Hoje menos 0) e depois virou nove dias
    // presos ao último domingo. Nenhuma das duas era uma semana: com as pontas contando, o domingo e
    // a segunda entravam DUAS vezes no intervalo. Em 2026-08-19 o usuário fixou a semana da operação
    // como segunda a domingo, sete dias — ver `janelaSemanal` para a aritmética e os exemplos.
    //
    // Duas tentativas anteriores e o que cada uma ensinou:
    //
    //   "Esta semana (começa na segunda-feira)" produziu 17 a 23/08 — seis dias FUTUROS dentro do
    //   intervalo, porque a semana mal tinha começado. O relatório devolveu 7 indicadores e nenhuma
    //   nota, enquanto o MESMO 17/08 sozinho devolvia os 20 completos. Intervalo que avança sobre data
    //   sem dado quebra o relatório, e não parece quebrado: parece desempenho péssimo, com Reversa em
    //   0%. Nenhuma opção de semana de calendário tem variante "até agora" (mês, trimestre e ano têm),
    //   então não dá para cortar o futuro por ali.
    //
    //   "Últimos 7 dias" resolveu o futuro mas é uma janela móvel: numa quarta ela cai numa quinta,
    //   e comparar uma semana com a outra deixa de fazer sentido.
    //
    // O "Avançado" resolve os dois, porque aceita as duas pontas em "Hoje menos N". Medido na tela
    // numa quarta 19/08: rótulo "10 de ago. de 2026 - 16 de ago. de 2026".
    { period: "week", avancado: janelaSemanal },
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
    // O recorte de janela móvel não tem item de menu — ele deixa o botão marcado como "Avançado",
    // que já está na lista acima.
    ...RECORTES.map((r) => r.menu).filter(Boolean),
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
          new PointerEvent(tipo, {
            ...opcoes,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
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

  /**
   * Escreve num campo de formulário do relatório.
   *
   * `el.value = x` sozinho não serve: o Looker é Angular e só enxerga a mudança pelo evento. E o
   * setter tem que ser o do protótipo, porque o framework substitui o do elemento para interceptar
   * escrita — atribuir direto passaria batido justamente por quem precisa ouvir.
   */
  function preencherCampo(el, valor) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, String(valor));
    for (const tipo of ["input", "change", "blur"]) {
      el.dispatchEvent(new Event(tipo, { bubbles: true }));
    }
  }

  /** Os dois campos de compensação do "Avançado", quando eles aparecerem. */
  async function esperarCamposDeCompensacao(limiteMs = 8000) {
    const ate = Date.now() + limiteMs;
    for (;;) {
      const campos = [...document.querySelectorAll("input[type=number]")].filter(clicavel);
      if (campos.length >= 2) return campos;
      if (Date.now() >= ate) return null;
      await dormir(300);
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
    /**
     * A busca é no TEXTO DA PÁGINA INTEIRA, não elemento por elemento (2026-08-18).
     *
     * Procurar dentro de cada elemento exige que a frase e a data morem no MESMO nó, e isso é uma
     * aposta sobre como o Looker monta o rodapé — uma aposta que ele desfez sozinho: o carimbo
     * passou de 17/08 15:55 para 18/08 00:40 na tela, e o robô passou três ciclos dizendo "sem
     * 'Dados atualizados pela última vez' na tela" com a frase visível ali.
     *
     * A expressão é ancorada na frase e exige data e hora logo depois dela, então varrer o texto
     * todo não afrouxa nada: continua sendo impossível casar com outro número da página. O que some
     * é a dependência de estrutura, que é o que quebrou.
     */
    const texto = document.body?.innerText ?? "";
    const m = CARIMBO_RE.exec(texto);
    if (!m) return null;
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
    const d = new Date(
      Number(ano),
      Number(mes) - 1,
      Number(dia),
      hora,
      Number(min),
      Number(seg || 0),
    );
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
    "Scheduling",
    "Tendência",
    "SPOT",
    "Aderência de Perfil",
    "ETA Origem",
    "Performance CPT",
    "No Show",
    "Plano de Ação",
    "ETA Destino",
    "Telemetria",
    "Utilização do APP",
    "Report de Ocorrências",
    "CMK",
    "Training",
    "Atendimento Check List",
    "Acidente Fatal",
    "Sinistralidade (pct)",
    "Bloqueio Driver",
    "Ocorrência - Quebra",
    "Reversa",
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
   * A NOTA DO VELOCÍMETRO E A FAIXA EM QUE CAIU — achadas por POSIÇÃO na tela.
   *
   * ── POR QUE DEIXOU DE SER POR ORDEM NA ÁRVORE (2026-08-26) ────────────────────────────────
   *
   * A versão anterior procurava "um número seguido imediatamente de uma faixa" na lista de textos.
   * Funcionou por semanas e quebrou em 24/08, quando alguém acrescentou uma linha de META ao
   * relatório. O contêiner do medidor passou a ler assim:
   *
   *   "Valor desejado: 100830110"   ← "Valor desejado: 100" + "83" + "0" + "110", colados
   *
   * A nota virou vizinha do eixo ("0") em vez da faixa, e o par sumiu. Resultado: a nota veio VAZIA
   * nos TRÊS recortes ao mesmo tempo, enquanto os 20 indicadores continuavam chegando — o modo mais
   * caro de falhar, porque o cartão fica no ar parecendo certo, só sem o número.
   *
   * Foi a TERCEIRA quebra por leitura de texto neste mesmo lugar: antes já custaram a casa decimal
   * opcional e o "de" opcional da faixa. Ordem no DOM é a coisa mais frágil de um raspador, e o
   * Looker a remonta a cada edição do relatório — que é feita por gente de fora, sem nos avisar.
   *
   * ── O QUE SUBSTITUI ───────────────────────────────────────────────────────────────────────
   *
   * A faixa continua sendo a âncora (ela é o que identifica o medidor), mas o número agora é o
   * CANDIDATO GEOMETRICAMENTE MAIS PRÓXIMO dela — o que está desenhado logo acima, que é como um
   * humano identifica a nota olhando a tela.
   *
   * Isso sobrevive a remontagem da árvore, que é o que muda quando editam o relatório. O que ele
   * não sobrevive é a um redesenho do medidor — e aí nenhuma regra sobreviveria.
   *
   * ── AS TRÊS EXCLUSÕES, e cada uma tem uma história ────────────────────────────────────────
   *
   * O EIXO: "0" e "110" são as pontas da escala e ficam a poucos pixels do número. São excluídos
   * por serem os extremos do medidor — sem isso, "110" ganharia de "83" em algumas telas.
   *
   * A META: "Valor desejado: 100" é o texto que quebrou a versão anterior. Ele não é um número
   * puro, então o padrão já o descarta — mas fica escrito aqui porque foi ele a causa.
   *
   * A LEGENDA DE CORES: lista as quatro faixas em sequência ("Zona de Excelência", "Zona de
   * Evolução", …) e fica ao lado do medidor. Uma legenda nunca tem número perto o bastante para
   * vencer o do próprio medidor, mas a distância máxima existe para garantir isso.
   */
  const EH_FAIXA = /^(Zona (de )?.+|Fora da faixa)$/;
  const EH_NOTA = /^d{1,3}(,d{1,2})?$/;

  /**
   * O quão perto o número precisa estar da faixa, em pixels.
   *
   * O medidor inteiro cabe em cerca de 180×120, e o número fica logo acima do rótulo. Cento e
   * cinquenta dá folga para variação de tamanho de tela sem alcançar o cartão vizinho — que numa
   * tela de 1080 está a mais de 300 pixels.
   */
  const PERTO_DA_FAIXA = 150;

  /** O centro visível de um elemento, ou `null` se ele não ocupa espaço. */
  function centro(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function notaEZona() {
    const todos = textos();

    /**
     * Os candidatos a NOTA: número puro, visível, e que não seja ponta do eixo.
     *
     * As pontas são descobertas pelo VALOR e não pela posição: o eixo do medidor vai de 0 a 110, e
     * esses dois números não são nota nunca — 0 seria nota zero, que o relatório escreveria como
     * "0,00" junto de uma faixa, e 110 está fora da escala de qualquer indicador.
     */
    const numeros = todos
      .filter((x) => EH_NOTA.test(x.txt) && x.txt !== "0" && x.txt !== "110")
      .map((x) => ({ txt: x.txt, c: centro(x.el) }))
      .filter((x) => x.c);

    /**
     * O PAR MAIS PRÓXIMO DA PÁGINA INTEIRA — e não o primeiro que aparecer.
     *
     * Esta distinção foi descoberta testando contra a tela, e a primeira versão do conserto REPROVOU
     * nela: parando na primeira faixa encontrada, o robô pegava a legenda do GRÁFICO HISTÓRICO
     * ("Zona Crítica (60)", da linha tracejada) com um rótulo de barra ao lado, devolvendo 76,1.
     *
     * O que separa os dois é a DISTÂNCIA. Medido na tela em 26/08:
     *
     *   velocímetro:  "83" ↔ "Zona evolução"        15 px
     *   gráfico:      "76,1" ↔ "Zona Crítica (60)"  47 px
     *
     * O rótulo do medidor fica colado no número, por desenho; o do gráfico é uma legenda solta que
     * calha de passar perto de uma barra. Varrer tudo e ficar com o menor resolve sem depender de
     * qual widget o Looker desenhou primeiro.
     */
    let melhor = null;
    let menor = Infinity;
    for (const alvo of todos) {
      if (!EH_FAIXA.test(alvo.txt)) continue;
      const cf = centro(alvo.el);
      if (!cf) continue;
      for (const n of numeros) {
        const d = Math.hypot(n.c.x - cf.x, n.c.y - cf.y);
        if (d < menor) {
          menor = d;
          melhor = { score: n.txt, zone: alvo.txt };
        }
      }
    }
    return melhor && menor <= PERTO_DA_FAIXA ? melhor : { score: null, zone: null };
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
          else
            reject(
              new Error(`TMS respondeu ${res.status}: ${String(res.responseText).slice(0, 200)}`),
            );
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
    if (!modo)
      throw new Error(`nenhum modo de período na tela (esperava um de: ${MODOS.join(", ")})`);
    clicar(modo);

    if (recorte.avancado) {
      // Janela móvel montada à mão: "Hoje menos N dias" nas duas pontas. Os seletores de âncora
      // (Hoje), de sinal (Menos) e de unidade (Dias) já vêm assim; só os números são preenchidos.
      const avancado = await esperarPorTexto("Avançado");
      if (!avancado) throw new Error("opção 'Avançado' não encontrada");
      clicar(avancado);

      const campos = await esperarCamposDeCompensacao();
      if (!campos) throw new Error("campos de compensação do 'Avançado' não encontrados");
      // Calculado NA HORA, não uma vez na carga do script: a aba fica aberta por dias, e uma janela
      // congelada no dia da abertura escorregaria um dia a cada meia-noite sem nada avisar.
      const janela = typeof recorte.avancado === "function" ? recorte.avancado() : recorte.avancado;
      log(
        `${recorte.period}: janela Hoje menos ${janela.inicioMenos} até Hoje menos ${janela.fimMenos}.`,
      );
      preencherCampo(campos[0], janela.inicioMenos);
      preencherCampo(campos[1], janela.fimMenos);
      await dormir(1500);
    } else {
      // "Hoje" está na raiz; o mês mora atrás de um submenu que abre no passar do mouse.
      let opcao = await esperarPorTexto(recorte.menu, 2000);
      if (!opcao && recorte.pai) {
        const pai = await esperarPorTexto(recorte.pai);
        if (!pai) throw new Error(`submenu "${recorte.pai}" não encontrado`);
        passarMouse(pai);
        opcao = await esperarPorTexto(recorte.menu);
      }
      if (!opcao) throw new Error(`opção "${recorte.menu}" não encontrada`);
      clicar(opcao);
    }

    const aplicar = await esperarPorTexto("Aplicar");
    if (!aplicar) throw new Error("botão Aplicar não encontrado");
    clicar(aplicar);
  }

  /** Tudo que vai ser enviado, como texto — serve para comparar duas leituras da tela. */
  function assinatura(leitura) {
    return JSON.stringify(leitura);
  }

  /**
   * O CARIMBO ENTRA NA LEITURA (1.10.0, 2026-08-18).
   *
   * Ele não é enfeite aqui: é o que distingue "os dois recortes deram o mesmo resultado" de "a tela
   * ainda é a do recorte anterior". Medido no banco — cada recorte tem o SEU "Dados atualizados pela
   * última vez" (ontem 10:27:21, nove dias 00:39:48), porque o Looker reescreve o rodapé quando
   * recalcula. Então números iguais COM carimbo igual é tela velha; números iguais com carimbo
   * diferente é coincidência legítima, e essa passa.
   *
   * Sem ele na assinatura, recusar leitura que não mudou condenaria dois recortes genuinamente
   * iguais a nunca mais atualizarem — a trava viraria o problema, que já aconteceu neste projeto
   * (ver o teto da varredura de retiradas).
   */
  function lerTela() {
    return { nota: notaEZona(), indicadores: indicadores(), at: carimbo() };
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
          /**
           * A QUARTA CONDIÇÃO: TEM DE SER OUTRA TELA (1.10.0).
           *
           * As três anteriores param no "a tela está pronta" e não perguntam PRONTA COM O QUÊ. A
           * tela do recorte ANTERIOR é cheia, completa e parada há muito mais que dezesseis
           * segundos — passa nas três com folga, e foi o que aconteceu: no ciclo das 11:40, "9 dias"
           * gravou os números de ontem e "mês" gravou os de nove dias, cada recorte lendo o de trás.
           *
           * A comparação já existia e virava só um aviso no console ("estabilizou sem mudar de
           * valores"). O comentário que a acompanhava dizia que não era motivo para recusar, porque
           * o rótulo do período já provara que o filtro pegou. O rótulo prova que o CONTROLE mudou;
           * não prova que o relatório recalculou — e é essa distinção que custou a leitura errada.
           *
           * Agora o patamar antigo não conta como resposta: o laço continua até a tela virar outra
           * ou o tempo acabar, e sem virar ninguém envia nada. Nada é melhor que errado, que é a
           * regra que o resto deste arquivo já segue.
           */
          // `agora !== antes`, e não a bandeira `mudou`: ela é histórica ("em algum momento houve
          // outra tela") e aceitaria um patamar que VOLTOU a ser a tela anterior. O que precisa ser
          // verdade é sobre a leitura que está sendo devolvida, agora.
          if (agora === anterior && agora !== antes) {
            if (Date.now() - desde >= CONFIG.patamarMs) {
              return {
                leitura,
                mudou,
                viuConteudo,
                segundos: Math.round((Date.now() - desde) / 1000),
              };
            }
          } else if (agora !== anterior) {
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

  /**
   * O carimbo que estava na tela quando o último ciclo terminou — a economia da regra 3, um nível
   * acima: ela evita o ENVIO repetido; este evita o ciclo inteiro. Ver `ciclo`.
   *
   * Nasce nulo de propósito. Recarregou a página, o primeiro ciclo roda inteiro, sempre — é a única
   * leitura em que não se sabe nada sobre o que já foi entregue.
   */
  let ultimoCarimboDoCiclo = null;

  /**
   * Lê e envia UM recorte. Devolve o que aconteceu, e é isso que decide se o ciclo se dá por
   * concluído — ver `ciclo`.
   *
   *   "enviado"      entregou dado novo
   *   "sem_mudanca"  o carimbo deste recorte já tinha sido entregue; não há o que fazer
   *   "falhou"       não entregou, e precisa de outra chance
   */
  async function lerEEnviar(recorte) {
    /**
     * A PORTEIRA BARATA: já entreguei ESTE recorte com ESTE carimbo?
     *
     * O carimbo do rodapé está visível sem tocar em nada, e é o mesmo para os três recortes — é o
     * "quando o relatório recalculou", não "quando este período mudou". Então dá para responder
     * antes de mexer no filtro.
     *
     * Isso importa por causa da RETENTATIVA. Sem esta porteira, o ciclo que volta para insistir num
     * recorte que falhou arrastaria os outros dois junto: três trocas de filtro para refazer uma. Com
     * ela, os que já foram entregues saem na porta e só o que falta é tocado — que é a diferença
     * entre retentar de hora em hora e retentar sem custo.
     *
     * A mesma comparação continua sendo feita DEPOIS da leitura estável, contra o carimbo lido junto
     * com os números. Esta aqui é conservadora de propósito: só pula quando é igual.
     */
    const carimboNaTela = carimbo();
    if (carimboNaTela && ultimo[recorte.period] === carimboNaTela) {
      log(`${recorte.period}: já entregue com o carimbo ${carimboNaTela} — filtro não tocado.`);
      return "sem_mudanca";
    }

    // Guardado ANTES de mexer no filtro: é contra isto que se sabe se o relatório recalculou.
    const antes = assinatura(lerTela());
    await escolherPeriodo(recorte);

    // A TRAVA. O seletor voltando a dizer "Selecionar período" significa que o filtro NÃO pegou —
    // e a tela então mostra o período anterior, com números que não são do recorte pedido.
    const rotulo = rotuloPeriodo();
    if (!rotulo || /^Selecionar per/i.test(rotulo) || !/\d/.test(rotulo)) {
      erro(`${recorte.period}: o filtro não confirmou (rótulo "${rotulo}") — nada enviado.`);
      return "falhou";
    }

    const estavel = await lerEstavel(antes);
    const limiteS = CONFIG.limiteRecalculoMs / 1000;
    if (!estavel.leitura) {
      // As TRÊS saídas sem leitura dizem coisas diferentes, e confundi-las custou um ciclo inteiro:
      // tela que NUNCA teve números é preparo da aba; tela que teve e não assentou é o relatório
      // demorando mais que o teto; e tela que nunca deixou de ser a anterior é a que gravava número
      // errado com cara de certo, até a 1.10.0.
      erro(
        !estavel.viuConteudo
          ? `${recorte.period}: a tela ficou ${limiteS}s sem nota nem indicador — nada enviado. ` +
              `Confira se o filtro "Transportador" está preenchido nesta aba.`
          : estavel.mudou
            ? `${recorte.period}: a tela não assentou em ${limiteS}s — nada enviado (número pela ` +
              `metade parece desempenho ruim).`
            : `${recorte.period}: a tela continuou sendo a do recorte anterior por ${limiteS}s ` +
              `(mesmos números E mesmo carimbo) — nada enviado. O relatório não recalculou.`,
      );
      return "falhou";
    }

    // Vem da leitura estável, e não de uma consulta nova: entre uma coisa e outra o Looker pode ter
    // republicado, e aí o carimbo seria de uma tela que não é a que foi lida.
    const at = estavel.leitura.at;
    if (!at) {
      erro(`${recorte.period}: sem "Dados atualizados pela última vez" na tela — nada enviado.`);
      return "falhou";
    }
    if (ultimo[recorte.period] === at) {
      log(`${recorte.period}: mesmo carimbo (${at}) — nada mudou.`);
      return "sem_mudanca";
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

  /**
   * O FILTRO "Transportador", que o robô agora repõe sozinho (1.12.0, 2026-08-18).
   *
   * Era o único passo manual que sobrava, e o pior tipo de passo manual: invisível. O filtro não
   * sobrevive a um reinício do Chromium, e sem ele o relatório inteiro mostra "Não há dados" — o
   * robô se recusa a mandar (certo) e o painel congela com a cara de atual. Reboot de VM de
   * madrugada bastava para o BSC parar até alguém reparar no carimbo velho.
   *
   * O que descobri abrindo o controle numa cópia isolada do perfil (sem Tampermonkey, noutro
   * display, para não brigar com o robô): a lista tem UM valor só, "BRAZIL TRANSPORTS". Não há
   * escolha a fazer nem ambiguidade a resolver — é repor o que sempre foi.
   *
   * Isto continua dentro da regra 1 deste arquivo. O controle é de VISUALIZAÇÃO, da mesma família do
   * seletor de período que o robô já opera: muda o que esta sessão do navegador mostra, e não altera
   * o relatório para mais ninguém. Nada é escrito no BSC.
   *
   * A saída rápida é a primeira linha: com a tela cheia, não se toca em nada. Só o estado quebrado
   * paga o preço de abrir menu.
   */
  async function garantirTransportador() {
    if (temConteudo(lerTela())) return false;

    // Tela vazia pode ser só carregamento — a aba acabou de abrir, o Looker ainda está montando.
    // Esperar antes de mexer evita abrir menu em cima de um relatório que ia encher sozinho.
    await dormir(CONFIG.pisoRecalculoMs);
    if (temConteudo(lerTela())) return false;

    log(`tela sem indicadores — repondo o filtro "${CONFIG.transportador}".`);
    await fecharPopups();
    const controle = await esperarPorTexto("Transportador");
    if (!controle) {
      erro('controle "Transportador" não encontrado — a aba precisa de olho humano.');
      return false;
    }
    clicar(controle);

    const opcao = await esperarPorTexto(CONFIG.transportador);
    if (!opcao) {
      erro(
        `"${CONFIG.transportador}" não apareceu na lista do filtro — confira se a Shopee renomeou o ` +
          "transportador. Nada foi alterado.",
      );
      await fecharPopups();
      return false;
    }
    clicar(opcao);
    await fecharPopups();

    // Conferir o RESULTADO, não o clique: menu que abre e opção que existe não provam que o
    // relatório voltou a ter dados, e é o dado que importa.
    await dormir(CONFIG.pisoRecalculoMs);
    if (temConteudo(lerTela())) log("filtro reposto — o relatório voltou a mostrar dados.");
    else erro("filtro reposto e a tela continua vazia — não vou insistir neste ciclo.");
    // Devolve TRUE mesmo quando a tela seguiu vazia: quem chama usa isto para não pular o ciclo,
    // e um ciclo a mais é barato perto de perder a publicação do dia.
    return true;
  }

  async function ciclo() {
    if (!estaEmPortugues()) {
      erro(
        "o relatório não está em português — nada será lido. Reabra esta aba com ?hl=pt-BR no fim da " +
          "URL. (Em inglês o ponto é decimal e os números seriam lidos mil vezes maiores.)",
      );
      return;
    }
    const repos = await garantirTransportador();

    /**
     * O CICLO INTEIRO SÓ ACONTECE SE O RELATÓRIO REPUBLICOU (1.13.0, 2026-08-18).
     *
     * O BSC publica UMA vez por dia, de madrugada. O robô lia de hora em hora e trocava o filtro de
     * período três vezes em cada leitura: 72 trocas por dia para buscar um número que muda uma vez.
     * A regra 3 já evitava reenviar o repetido, mas só DEPOIS de mexer na tela — a economia era de
     * rede, não de risco.
     *
     * E o risco é o que importa aqui: cada troca de filtro é uma chance de cair na leitura da tela
     * anterior, que foi o defeito de hoje (ver a quarta condição em `lerEstavel`). Setenta e duas
     * chances por dia viram três.
     *
     * O carimbo do rodapé está visível SEM clicar em nada, e é o mesmo que o Looker reescreve quando
     * recalcula. Comparar o de agora com o do fim do ciclo anterior é comparar duas leituras da MESMA
     * tela — o filtro não mudou entre uma coisa e outra —, então igualdade significa "nada novo foi
     * publicado".
     *
     * Duas saídas de segurança, porque pular ciclo é o tipo de economia que esconde falha:
     *   - Carimbo ilegível não pula. Não saber é motivo para olhar, não para dormir.
     *   - Filtro recém-reposto não pula. A tela pode ter passado o dia vazia, e a publicação de hoje
     *     nunca ter sido lida; economizar aí seria perder justamente o que se queria.
     */
    const carimboAgora = carimbo();
    if (!repos && carimboAgora && carimboAgora === ultimoCarimboDoCiclo) {
      log(`o relatório não republicou desde ${carimboAgora} — nenhum filtro tocado neste ciclo.`);
      return;
    }

    let algumFalhou = false;
    for (const recorte of RECORTES) {
      try {
        if ((await lerEEnviar(recorte)) === "falhou") algumFalhou = true;
      } catch (e) {
        algumFalhou = true;
        erro(`${recorte.period} falhou (tenta de novo no próximo ciclo):`, e?.message ?? e);
        // Limpa o que a falha deixou aberto para o próximo recorte não herdar a bagunça.
        await fecharPopups();
      }
    }

    /**
     * O CICLO SÓ SE DÁ POR CONCLUÍDO SE TODOS OS RECORTES FECHARAM (1.17.0, 2026-08-27).
     *
     * ── O DEFEITO QUE ISTO CONSERTA ─────────────────────────────────────────────────────────────
     *
     * Antes, este carimbo era gravado no fim do ciclo INCONDICIONALMENTE — inclusive quando um
     * recorte tinha falhado. E como o ciclo seguinte pula tudo enquanto o carimbo não muda, um
     * recorte que falhasse só ganhava outra chance na próxima publicação do relatório: VINTE E
     * QUATRO HORAS depois.
     *
     * Uma falha isolada virava um dia inteiro de atraso. Se ela se repetisse no dia seguinte — e a
     * semana é o recorte mais frágil, o único que abre o diálogo "Avançado" e digita dois campos —,
     * o número ficava preso indefinidamente, com dia e mês em volta perfeitamente atuais.
     *
     * Foi exatamente isso que aconteceu com a semana entre 25 e 27/08.
     *
     * ── POR QUE ISSO NÃO DESFAZ A ECONOMIA QUE ESTE CARIMBO EXISTE PARA FAZER ────────────────────
     *
     * O comentário lá em cima conta que o ponto era reduzir 72 trocas de filtro por dia para três,
     * porque cada troca é uma chance de ler a tela errada. Retentar de hora em hora parece devolver
     * as 72 — e não devolve: a porteira no topo de `lerEEnviar` faz o recorte JÁ ENTREGUE com este
     * carimbo sair sem tocar em nada.
     *
     * Então um ciclo de retentativa custa uma troca de filtro, não três, e só enquanto algo está
     * de fato quebrado — que é precisamente quando se quer insistir.
     *
     * ── E POR QUE NÃO CONTAR TENTATIVAS ─────────────────────────────────────────────────────────
     *
     * Seria a proteção óbvia contra insistir para sempre. Mas "para sempre" aqui é uma troca de
     * filtro por hora num recorte que não está chegando — e um teto transformaria isso em silêncio,
     * que é a forma como este robô já falhou duas vezes. Insistir e registrar é mais barato que
     * desistir e calar.
     */
    if (algumFalhou) {
      log("algum recorte não fechou — o carimbo do ciclo NÃO avança, e o próximo ciclo insiste.");
      return;
    }

    // Gravado no FIM e relido da tela, não copiado do começo: o que interessa é o carimbo do estado
    // em que a aba ficou, que é contra o que o próximo ciclo vai comparar.
    ultimoCarimboDoCiclo = carimbo();
  }

  /** Agenda a partir do FIM do anterior — nunca em paralelo consigo mesmo. */
  function repetir() {
    const nascimento = Date.now();
    const passo = async () => {
      try {
        await ciclo();
      } catch (e) {
        erro("ciclo falhou:", e?.message ?? e);
      }
      /**
       * O RELOAD VEM DEPOIS DO CICLO, nunca no meio (2026-08-19).
       *
       * Recarregar durante uma leitura mataria o recorte pela metade, e a página nova começaria com o
       * filtro no lugar que o Looker escolher — que não é necessariamente onde a leitura estava. No
       * fim do ciclo não há nada aberto: os popups foram fechados e os três recortes já foram
       * entregues ou já falharam com motivo registrado.
       *
       * O robô não perde nada com a página nova: tudo que ele sabe vem da tela, e o que ele guardava
       * na memória (`ultimoCarimboDoCiclo`) é justamente o que precisa ser esquecido para a próxima
       * leitura valer.
       */
      if (CONFIG.recarregarAposMs > 0 && Date.now() - nascimento >= CONFIG.recarregarAposMs) {
        log("recarregando a página: o Looker não refaz a consulta sozinho numa aba parada.");
        location.reload();
        return; // não agenda: quem agenda é o script que sobe com a página nova
      }
      setTimeout(passo, CONFIG.intervaloMs);
    };
    setTimeout(passo, 15000); // deixa o relatório carregar antes da primeira leitura
  }

  log("ativo. Só leitura: nenhum clique fora do filtro de período.");
  repetir();
})();
