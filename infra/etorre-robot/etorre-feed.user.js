// ==UserScript==
// @name         Brazil TMS — leitor do eTorre
// @namespace    braziltransports.com.br
// @version      0.3.1
// @description  Escuta o que a tela de Veículos Logísticos do eTorre já busca e entrega ao TMS. Somente leitura.
// @match        https://torre.logae.com.br/*
// @connect      tmsdev.braziltransports.com.br
// @connect      tms.braziltransports.com.br
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// Sem estas duas linhas o Tampermonkey nunca procura versão nova, e toda correção vira "abra a URL e
// clique em Reinstalar" — com o agravante de que os três robôs desta VM têm nome parecido.
// @updateURL    http://127.0.0.1:8899/etorre-feed.user.js
// @downloadURL  http://127.0.0.1:8899/etorre-feed.user.js
// ==/UserScript==

/**
 * O LEITOR DO RASTREADOR (2026-08-19).
 *
 * O eTorre (white-label da Raster) não publica API para nós, mas a tela "Veículos Logísticos" busca
 * tudo de um endpoint só — `POST /apilog/veiculos-logisticos` —, e a resposta traz MUITO mais do que
 * a grade mostra: posição, ignição, percentual percorrido, quilometragem e a previsão de entrega
 * calculada pelo rastreador. São 380 campos por veículo, 98 veículos na conta.
 *
 * ── ELE APRENDE A CHAMADA E DEPOIS A REPETE (0.3.0, 2026-08-24) ───────────────────────────────
 *
 * A primeira versão só ESCUTAVA: cutucava o botão "Atualizar" e lia a resposta de passagem. Isso
 * amarrou o robô ao desenho da página, e com a aba atrás as entregas saíram a cada 5, 20, 40 e 83
 * minutos em vez de 5 em 5.
 *
 * Agora ele aprende a receita da chamada — corpo e cabeçalhos de autenticação — da primeira vez que
 * o app a faz, e passa a fazê-la sozinho. Detalhe e medições em `receita`, mais abaixo.
 *
 * A conta com o fornecedor não muda: era uma chamada a cada cinco minutos (a do app, provocada pelo
 * empurrão) e continua sendo uma a cada cinco minutos (a nossa). O que mudou é quem a origina — e
 * vale dizer com todas as letras, porque a versão anterior se vendia como "nenhuma requisição a
 * mais por nossa causa" e isso deixou de ser literalmente verdade.
 *
 * ── POR QUE `document-start` ───────────────────────────────────────────────────────────────────
 *
 * Medido: um hook instalado com a página já carregada FUNCIONA neste app, mas isso é sorte de
 * implementação — basta o bundle passar a guardar `XMLHttpRequest.prototype.open` numa variável de
 * módulo para o hook tardio virar decoração. Entrando antes de qualquer script da página, a
 * referência que o app guardar já é a nossa. Continua valendo: é do gancho que sai a receita.
 */

/* global GM_xmlhttpRequest, GM_getValue, GM_setValue, GM_info */
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
    /** O mesmo valor de PORTAL_FEED_TOKEN no servidor. Trocar aqui e lá ao mesmo tempo. */
    token: "COLE_AQUI_O_TOKEN",
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

  /**
   * A versão vem do CABEÇALHO, não de uma constante copiada. A constante escrita à mão envelhece
   * calada, e a linha que existe para provar qual versão está rodando passa a mentir sobre
   * exatamente isso — já aconteceu no robô do BSC, que saiu com `@version` novo e console velho.
   */
  const VERSAO =
    (typeof GM_info !== "undefined" && GM_info?.script?.version) || "versão desconhecida";
  const log = (...a) => console.log(`[TMS eTorre ${VERSAO}]`, ...a);
  const erro = (...a) => console.warn(`[TMS eTorre ${VERSAO}]`, ...a);

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
    /**
     * O motorista é `GRA_CAWNOME`, e isso custou uma leitura errada.
     *
     * `GRA_CAMDESC` parecia o campo óbvio e devolve "SASCAR", "ONIXSAT", "OMNILINK" — a MARCA DO
     * RASTREADOR, não a pessoa. O erro não aparece sozinho: "SASCAR" é um texto plausível numa
     * coluna de motorista. Só conferindo contra a grade da tela (FRP3C84 → RENATO FREIRE DE LIMA) é
     * que os dois se separam.
     */
    motorista: "GRA_CAWNOME",
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
    /**
     * A referência textual da última posição — o que a operação lê para saber "onde é isso".
     *
     * ERA `GRA_REFERENCIA_LOCALIZADOR`, e estava errado desde que este robô nasceu: aquele campo é
     * do LOCALIZADOR, um segundo equipamento, e devolve a string literal "Sem Referência" para a
     * frota inteira. A coluna da tela mostrou "Sem Referência" em 147 de 147 veículos por três dias.
     *
     * O certo é `POD_REFERENCIA` — mesma família de `POD_LAT`/`POD_LON`/`POD_DATAHORAP`, que este
     * robô já usa, e exatamente o texto que a grade do eTorre exibe ("0.46 km de VIP ESTACIONAMENTO
     * DE CAMINHÕES - SIMOES FILHO/BA").
     *
     * Medido lado a lado em 2026-08-24, e é o tipo de erro que só a contagem de DISTINTOS denuncia:
     * os dois vinham "preenchidos" em 78 de 78, e é aí que uma verificação de "campo secou?" passa
     * batido. O que os separa é que um tem 76 valores diferentes e o outro tem UM.
     */
    referencia: "POD_REFERENCIA",
    /** Faróis do rastreador: alertas de execução que o TMS não tem como derivar sozinho. */
    foraDeRota: "GRJ_FAROLFORADEROTA",
    semPosicao: "GRJ_FAROLSEMPOSICAO",
    /**
     * `PARADO` / `MOVIMENTANDO`, escrito por extenso.
     *
     * O farol equivalente (`GRJ_FAROLVEICULOPARADO`) devolve `MAI`/`MOV`, que exige adivinhar o que
     * a abreviação significa. Este diz a mesma coisa sem intérprete no meio — e um contador de
     * "quantos estão parados" não pode depender de eu ter chutado certo.
     */
    parado: "GSH_STATUS_PARADO_MOVIMENTADO",
    /**
     * OS CINCO QUE FALTAVAM (2026-08-21).
     *
     * A tela mostra OITO ícones por caminhão e o robô entregava três. Os outros cinco vinham na
     * mesma resposta, ciclo após ciclo, e eram descartados — não por decisão, por não terem sido
     * procurados. O mapeamento foi conferido cruzando a COR do ícone na tela com o valor do campo
     * em vinte veículos de uma vez; sete fecharam vinte de vinte.
     *
     * O oitavo, o alfinete de posição, NÃO está aqui: `GRJ_FAROLSEMPOSICAO` vem `S` para a frota
     * inteira porque é a configuração do alerta, não o estado. Ele acende quando a última posição
     * passa do limite que o próprio rastreador informa — e é esse limite que vai em
     * `limiteSemPosicaoMin`. Quem acende é o TMS, com o relógio do servidor.
     */
    /** Jornada do motorista: `MAI` passou das quatro horas, `MEN` está dentro. */
    tempoDirecao: "GRJ_FAROLTEMPODIRECAO",
    /** `S` quando a viagem começou depois da hora prevista. */
    inicioAtrasado: "GRJ_FAROLINICIOVIAGEM",
    bloqueado: "GRA_BLOQUEADO",
    sirene: "GRA_SIRENE",
    /** Liberação vigente, TEXTO livre. Vazio para quase todos; existir já é o alerta. */
    liberacao: "GVL_LIBERACAOVEICULO",
    /** O atraso da viagem pela régua DELE — o TMS mede a dele contra a janela do cliente. */
    atrasoViagem: "GRJ_ALERTAATRASO",
    /** Quantos minutos de silêncio o rastreador considera demais nesta conta (hoje 60). */
    limiteSemPosicaoMin: "CMM_TEMPOALERTASEMPOSICAO",

    /**
     * SEIS QUE JÁ VINHAM NA MESMA RESPOSTA (2026-08-24, a pedido).
     *
     * Escolhidos com a resposta na mão, não pelo nome. Dois candidatos óbvios caíram na medição:
     * `OBSERVACOES_COLETA_ENTREGA` tem DOIS valores distintos em 67 registros (um deles é " / "),
     * e `SMK_DATAHORACHEGADADESTINO` vem preenchido em 78 de 78 — inclusive para veículo sem
     * viagem, o que faz dele sentinela e não chegada. O par honesto da saída da origem é a versão
     * `...FORMATADA`, preenchida exatamente nos mesmos 67.
     */
    /**
     * O TELEFONE DO MOTORISTA, por uma porta sem cota.
     *
     * O portal do cliente raciona dado pessoal — a primeira carga do cadastro parou em "suas
     * visitas para dados confidenciais atingiram o limite máximo". O rastreador entrega telefone e
     * nome do mesmo motorista sem racionar nada, em 70 dos 78 veículos.
     */
    telefoneMotorista: "GVL_TELEFONES_MOTORISTA",
    cidadeMotorista: "CIDADE_UF_MOTORISTA01",
    kmNoDia: "GVL_KMSRODADODIA",
    /** O que de fato aconteceu, contra a janela do cliente e a previsão da estrada. */
    saidaDaOrigem: "SMK_DATAHORASAIDAORIGEM",
    chegadaNoDestino: "SMK_DATAHORACHEGADADESTINOFORMATADA",
    /** Parado no geral — o `minutosParado` acima é parado DENTRO do alvo. */
    minutosParadoTotal: "TEMPO_MINUTOS_PARADO",
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
      /**
       * E DIZ QUAIS NOMES EXISTEM NO LUGAR.
       *
       * Sem isto, o aviso acima é um beco: informa que quebrou e não ajuda a consertar. Quem for
       * arrumar teria de abrir a aba de rede, achar a chamada certa e ler um JSON de 380 campos —
       * dentro de uma VM, por VNC. Com a lista no console, o conserto é comparar dois nomes.
       *
       * Só quando algo já quebrou: em operação normal esta linha nunca aparece.
       */
      if (registros[0]) {
        erro(`nomes disponíveis no registro: ${Object.keys(registros[0]).sort().join(", ")}`);
      }
    }
    /**
     * CAMPO CONSTANTE É TÃO SUSPEITO QUANTO CAMPO VAZIO — e o aviso acima não pegava esse caso.
     *
     * `GRA_REFERENCIA_LOCALIZADOR` devolveu a string "Sem Referência" para os 147 veículos durante
     * três dias. Não estava vazio, então passou pela verificação de "campo secou"; e "Sem
     * Referência" é um texto plausível numa coluna de localização, então passou pelo olho também. Só
     * a contagem de valores DISTINTOS separa "o rastreador está dizendo a mesma coisa de todo mundo"
     * de "este campo tem conteúdo".
     *
     * Fora da lista os campos que legitimamente são iguais para a frota inteira: são configuração da
     * conta ou farol ligado/desligado, e avisar sobre eles todo ciclo ensinaria a ignorar o aviso.
     */
    const CONSTANTES_POR_NATUREZA = new Set([
      "limiteSemPosicaoMin",
      "semPosicao",
      "bloqueado",
      "sirene",
      "ignicao",
      "parado",
      "foraDeRota",
      "tempoDirecao",
      "inicioAtrasado",
      "atrasoViagem",
      "liberacao",
    ]);
    if (frota.length >= 10) {
      const constantes = Object.keys(CAMPOS).filter((k) => {
        if (CONSTANTES_POR_NATUREZA.has(k) || vazios.includes(k)) return false;
        const valores = new Set(frota.map((v) => JSON.stringify(v[k])));
        return valores.size === 1;
      });
      if (constantes.length > 0) {
        erro(
          `campos com UM único valor em toda a frota — provavelmente o nome errado: ${constantes.join(", ")}`,
        );
      }
    }

    if (emViagem[0]) log("exemplo com viagem:", emViagem[0]);
    entregar(frota);
  }

  /**
   * A entrega ao TMS, com `GM_xmlhttpRequest` porque a chamada é cross-origin.
   *
   * O token vai no CORPO, e não no cabeçalho: um `Authorization` transforma o POST em requisição
   * "não simples" e obriga a um preflight que o TMS teria de negociar com a origem do fornecedor. É
   * a mesma decisão dos outros dois robôs desta VM.
   *
   * Falha aqui NÃO derruba o ciclo: o próximo sai em cinco minutos e traz um retrato mais novo. O
   * que não pode acontecer é falhar em silêncio — daí o aviso com o corpo da resposta, que é onde o
   * TMS explica se o token está curto, se o corpo veio torto ou se a rota nem existe ainda.
   */
  /**
   * O PULSO DO ROBÔ (2026-08-21): quanto o ciclo anterior levou, e o intervalo configurado.
   *
   * Vai pendurado na entrega seguinte, e não numa chamada própria — uma requisição a mais só para
   * dizer "estou bem" seria tráfego para vigiar tráfego. Serve para a tela de Status avisar que a VM
   * está sufocando ANTES de o dado parar.
   */
  let ultimoCiclo = {};

  function entregar(frota) {
    /**
     * O TEXTO DE EXEMPLO ESCRITO PARTIDO — e é de propósito (2026-08-22).
     *
     * Instalar é copiar este arquivo e trocar o exemplo pelo token de verdade. Quem faz isso com
     * um substituir-tudo (o `str.replace` do Python troca TODAS as ocorrências) troca também a que
     * está aqui, e a guarda vira `if (token === <o token certo>)`: o robô passa a recusar
     * exatamente o token válido, calado, dizendo que não há token nenhum.
     *
     * Aconteceu com o robô executor e custou uma hora. Partido em dois pedaços, nenhum
     * substituir-tudo do literal inteiro encosta nesta linha.
     */
    const TOKEN_DE_EXEMPLO = "COLE_AQUI" + "_O_TOKEN";
    /**
     * E ELE SOBREVIVE À ATUALIZAÇÃO DO ROBÔ (2026-08-24).
     *
     * O token mora no código, e o código é substituído inteiro a cada atualização: toda correção
     * devolvia esta linha ao exemplo e o robô parava calado até alguém colar de novo. Numa noite só
     * isso aconteceu duas vezes com o robô de motoristas.
     *
     * Agora o valor colado é copiado para o armazenamento do Tampermonkey na primeira execução e
     * lido de lá depois. Cola-se uma vez. O código VENCE o guardado quando traz valor de verdade —
     * é assim que se troca o token quando ele muda no servidor.
     */
    let token = CONFIG.token && CONFIG.token !== TOKEN_DE_EXEMPLO ? CONFIG.token : "";
    try {
      if (token) {
        if (GM_getValue("token", "") !== token) GM_setValue("token", token);
      } else {
        token = GM_getValue("token", "") || "";
      }
    } catch {
      // Sem armazenamento o robô continua funcionando com o que está no código.
    }
    if (!token) {
      erro("token não configurado — o retrato foi lido e NÃO foi entregue");
      return;
    }
    GM_xmlhttpRequest({
      method: "POST",
      url: `${CONFIG.tms}/api/imports/fleet-feed`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        token,
        positions: frota.map(paraTms),
        ...ultimoCiclo,
      }),
      timeout: 60000,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          const corpo = JSON.parse(res.responseText || "{}");
          log(
            `entregue: ${corpo.recebidas} posições, ${corpo.vinculadas} casadas com a frota` +
              (corpo.semCadastro ? `, ${corpo.semCadastro} sem cadastro` : ""),
          );
        } else {
          erro(`TMS respondeu ${res.status}: ${String(res.responseText).slice(0, 200)}`);
        }
      },
      onerror: () => erro("falha de rede ao entregar ao TMS"),
      ontimeout: () => erro("o TMS demorou demais para responder"),
    });
  }

  /**
   * Do vocabulário do rastreador para o do TMS.
   *
   * Os instantes seguem como TEXTO, exatamente como vieram. Converter fuso aqui amarraria o dado ao
   * relógio desta VM — que é a última coisa em que confiar para alimentar cálculo de atraso. Quem
   * converte é o servidor, que sabe em que fuso a empresa opera.
   */
  function paraTms(v) {
    return {
      plate: v.placa,
      trailerPlate: v.carreta,
      driverLabel: v.motorista,
      latitude: typeof v.lat === "number" ? v.lat : null,
      longitude: typeof v.lon === "number" ? v.lon : null,
      positionLabel: v.referencia,
      positionAt: v.horaPosicao,
      ignition: v.ignicao,
      tripStatus: v.statusViagem,
      originCity: v.origem,
      destinationCity: v.destino,
      tripStartedAt: v.inicioViagem,
      etaAt: v.previsaoEntrega,
      progressPercent: typeof v.percentual === "number" ? v.percentual : null,
      kmTravelled: typeof v.kmPercorrido === "number" ? v.kmPercorrido : null,
      stoppedMinutes: v.minutosParado,
      offRoute: v.foraDeRota,
      noPosition: v.semPosicao,
      stoppedFlag: v.parado,
      drivingTimeFlag: v.tempoDirecao,
      lateStartFlag: v.inicioAtrasado,
      blockedFlag: v.bloqueado,
      sirenFlag: v.sirene,
      releaseLabel: v.liberacao,
      tripDelayFlag: v.atrasoViagem,
      noPositionLimitMinutes: v.limiteSemPosicaoMin,
      driverPhone: v.telefoneMotorista,
      driverCity: v.cidadeMotorista,
      kmToday: typeof v.kmNoDia === "number" ? v.kmNoDia : null,
      departedOriginAt: v.saidaDaOrigem,
      arrivedDestinationAt: v.chegadaNoDestino,
      stoppedMinutesTotal: v.minutosParadoTotal,
    };
  }

  /**
   * A RECEITA DA CHAMADA — o que permite o robô parar de depender da tela.
   *
   * ── O PROBLEMA ────────────────────────────────────────────────────────────────────────────────
   *
   * Este robô nasceu escutando: cutucava o botão "Atualizar" e lia a resposta de passagem. Isso
   * amarrou o ciclo ao DESENHO da página — com a aba atrás, medido em 2026-08-22, as entregas
   * saíram a cada 5, 20, 40 e 83 minutos, contra 5 em 5 com a aba na frente. As três travas de
   * estrangulamento do Chromium já estavam desligadas no `iniciar.sh`; o atraso mora no app, que
   * enfileira o refresh da grade atrás de quadros que aba de fundo não recebe.
   *
   * ── A SAÍDA ───────────────────────────────────────────────────────────────────────────────────
   *
   * Fazer a chamada nós mesmos. O corpo é minúsculo e a autenticação vem em dois cabeçalhos — tudo
   * medido em 2026-08-24:
   *
   *     POST /apilog/veiculos-logisticos    {"userData":{"empresas":[NNNNNN],"grupos":[0],"aba":0}}
   *     Authorization: Bearer <JWT>   ·   X-XSRF-TOKEN: <uuid>
   *
   * O número da empresa NÃO é cravado aqui: ele não está em localStorage nem em cookie, vive dentro
   * do app. O robô APRENDE a receita da primeira chamada que a tela faz ao abrir, e repete. Se a
   * empresa mudar, a chamada seguinte do app reescreve a receita sozinha.
   *
   * ── QUANTO ISSO CUSTA AO FORNECEDOR: NADA A MAIS ──────────────────────────────────────────────
   *
   * O cabeçalho deste arquivo prometia "nenhuma requisição a mais chega ao fornecedor por nossa
   * causa". A promessa muda de FORMA e não de tamanho: antes o robô cutucava a tela a cada cinco
   * minutos e o app fazia uma chamada; agora o robô faz uma chamada a cada cinco minutos. Uma por
   * ciclo, como sempre. O que mudou é quem a origina.
   *
   * ── O QUE AINDA PRECISA DA TELA, E COM QUE FREQUÊNCIA ─────────────────────────────────────────
   *
   * O token dura ~12 horas (medido: 42.857 s). Quando expirar, a chamada volta 401, a receita é
   * descartada e o robô cutuca o botão UMA vez para o app emitir uma chamada nova e autenticada —
   * que a receita reaprende. Ou seja: a dependência do desenho deixa de ser a cada cinco minutos e
   * passa a ser a cada meio dia. Não é zero, e dizer que é seria mentira; recarregar a página não
   * serve porque o app não reabre a tela de Veículos Logísticos sozinho.
   */
  let receita = null;

  const eOAlvo = (endereco) =>
    typeof endereco === "string" &&
    endereco.includes(CONFIG.alvo) &&
    !endereco.includes(CONFIG.ignorar);

  const original = XMLHttpRequest.prototype.open;
  const cabecalhoOriginal = XMLHttpRequest.prototype.setRequestHeader;
  const enviarOriginal = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    if (this.__cabecalhos) this.__cabecalhos[nome] = valor;
    return cabecalhoOriginal.call(this, nome, valor);
  };

  XMLHttpRequest.prototype.send = function (corpo) {
    if (eOAlvo(this.__endereco) && typeof corpo === "string") {
      const c = this.__cabecalhos || {};
      if (c["Authorization"]) {
        receita = {
          url: this.__endereco,
          corpo,
          autorizacao: c["Authorization"],
          xsrf: c["X-XSRF-TOKEN"] || null,
        };
        log("receita da chamada aprendida — a partir daqui eu peço sozinho");
      }
    }
    return enviarOriginal.call(this, corpo);
  };

  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    const endereco = String(url);
    this.__endereco = endereco;
    this.__cabecalhos = {};
    if (eOAlvo(endereco)) {
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

  /**
   * A chamada feita por nós, com a receita aprendida. Devolve `true` quando o retrato saiu daqui.
   *
   * `fetch` e não `XMLHttpRequest` de propósito: o gancho acima intercepta XHR, e refazer a chamada
   * por XHR faria o robô escutar a si mesmo — sobrescrevendo a receita com a própria cópia e
   * processando o mesmo retrato duas vezes.
   */
  async function pedirSozinho() {
    if (!receita) return false;
    const cabecalhos = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: receita.autorizacao,
    };
    if (receita.xsrf) cabecalhos["X-XSRF-TOKEN"] = receita.xsrf;

    const r = await fetch(receita.url, {
      method: "POST",
      credentials: "include",
      headers: cabecalhos,
      body: receita.corpo,
    });
    if (r.status === 401 || r.status === 403) {
      // Token vencido. Descartar a receita é o que faz o próximo ciclo cutucar a tela e reaprender.
      receita = null;
      erro(`o eTorre recusou (${r.status}) — token vencido; vou pedir à tela que se atualize`);
      return false;
    }
    if (!r.ok) throw new Error(`eTorre respondeu HTTP ${r.status}`);
    const corpo = await r.json();
    const registros = corpo?.records;
    if (!Array.isArray(registros)) {
      erro("resposta sem `records` — o formato mudou", corpo && Object.keys(corpo));
      return true;
    }
    resumir(registros);
    return true;
  }

  // O primeiro ciclo espera a tela assentar — é nele que a receita costuma ser aprendida, da chamada
  // que o próprio app faz ao abrir a grade. Os seguintes são agendados a partir do FIM do anterior,
  // então um ciclo lento nunca empilha em cima do próximo.
  setTimeout(async function ciclo() {
    const t0 = Date.now();
    try {
      // Sem receita (primeiro ciclo, ou token vencido), cai para o empurrão na tela — que além de
      // trazer o retrato faz o app emitir uma chamada autenticada, e é dela que a receita nasce.
      if (!(await pedirSozinho())) atualizarTela();
    } catch (e) {
      erro("ciclo falhou:", String(e?.message ?? e).slice(0, 160));
    } finally {
      // O pulso deste ciclo viaja na entrega do PRÓXIMO — ver `ultimoCiclo`.
      ultimoCiclo = { cicloMs: CONFIG.intervaloMs, duracaoMs: Date.now() - t0 };
      setTimeout(ciclo, CONFIG.intervaloMs);
    }
  }, 15_000);

  log("ativo. Somente leitura. Aprende a chamada da tela e depois a repete sozinho, a cada 5 min.");
})();
