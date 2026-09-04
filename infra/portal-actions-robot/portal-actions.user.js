// ==UserScript==
// @name         Brazil TMS — executor de decisões no portal
// @namespace    braziltransports.com.br
// @version      0.6.0
// @description  Executa no portal as decisões tomadas no TMS: aceitar e rejeitar viagem. NÃO decide nada.
// @match        https://logistics.myagencyservice.com.br/*
// @connect      tmsdev.braziltransports.com.br
// @connect      tms.braziltransports.com.br
// @grant        GM_xmlhttpRequest
// Sem estas duas o Tampermonkey nunca procura versão nova, e toda correção vira "abra a URL e
// clique em Reinstalar" — com o agravante de que os robôs desta VM têm nome parecido.
// @updateURL    http://127.0.0.1:8899/portal-actions.user.js
// @downloadURL  http://127.0.0.1:8899/portal-actions.user.js
// ==/UserScript==

/**
 * O ROBÔ QUE ESCREVE (2026-08-21).
 *
 * O robô de leitura (`portal-feed`) traz no cabeçalho três regras, e a primeira é "SOMENTE LEITURA …
 * se um dia precisar escrever, não é aqui". Este é o "um dia", e é por isso que ele é um ARQUIVO
 * SEPARADO, com nome, versão e instalação próprios: quem for auditar o que o TMS manda no portal
 * lê 150 linhas, não 500 misturadas com a leitura.
 *
 * ── O QUE ELE FAZ, E O QUE ELE NÃO DECIDE ──────────────────────────────────────────────────────
 *
 * Ele pergunta ao TMS "tem ordem para mim?" e executa o que vier. Não olha viagem, não escolhe
 * viagem, não sabe o que é uma proposta boa. A decisão foi de uma pessoa, na tela do TMS, e está
 * registrada lá com nome e hora. Aqui é só o braço.
 *
 * A consequência prática dessa divisão: se este arquivo for adulterado, ele ainda só consegue fazer
 * o que o TMS mandar — e o TMS só manda o que alguém autenticado pediu.
 *
 * ── POR QUE ELE EXISTE ─────────────────────────────────────────────────────────────────────────
 *
 * Quem tem sessão no portal é ESTE navegador. Um POST saindo do servidor do TMS seria recusado por
 * falta de credencial. Então o TMS grava a ordem e este script a entrega — é a mesma arquitetura dos
 * outros três, invertida: em vez de trazer o que o portal diz, leva o que o TMS decidiu.
 *
 * ── NUNCA REPETE POR CONTA PRÓPRIA ─────────────────────────────────────────────────────────────
 *
 * Uma ordem sai da fila do TMS assim que é entregue a este script (`pending` → `sent`), e o
 * resultado — sucesso OU falha — é relatado sempre. Ele nunca tenta de novo sozinho: erro de negócio
 * do portal ("já aceita", "expirou") se repete igual em toda tentativa, e um robô teimoso
 * transformaria uma recusa numa enxurrada de requisições ao fornecedor. Tentar de novo é decisão de
 * gente, na tela do TMS.
 */

/* global GM_xmlhttpRequest, GM_info */
(function () {
  "use strict";

  const CONFIG = {
    /**
     * Endereço do TMS. PRODUÇÃO desde 2026-08-22.
     *
     * Era o de dev, com um recado dizendo "troque quando for a hora". A hora chegou e o recado
     * quase custou caro: instalar este arquivo por cima do que roda na VM apontou o robô de
     * PRODUÇÃO para o dev por alguns segundos — as ordens de verdade teriam ficado paradas numa
     * fila que ninguém lê, sem erro nenhum aparecendo em lugar nenhum.
     *
     * O arquivo do repositório é o que se instala. Ele tem de nascer apontando para onde de fato
     * vai rodar; quem quiser testar contra o dev troca esta linha na cópia dele, não o contrário.
     */
    tms: "https://tms.braziltransports.com.br",
    /** O mesmo valor de PORTAL_FEED_TOKEN no servidor. Trocar aqui e lá ao mesmo tempo. */
    token: "COLE_AQUI_O_TOKEN",
    /**
     * De quanto em quanto tempo perguntar se há ordem.
     *
     * CINCO segundos, e não os trinta iniciais (2026-08-22, a pedido). Aqui tem GENTE ESPERANDO: a
     * pessoa apertou "Atribuir" e está olhando a tela. O ciclo é a espera INTEIRA — a chamada ao
     * portal, medida numa atribuição real, levou 759 ms; os outros 27 segundos daquele clique foram
     * este robô dormindo. Trinta segundos de silêncio fazem a pessoa ir conferir no portal, que é
     * exatamente o passo que este recurso existe para eliminar.
     *
     * O custo é uma requisição ao NOSSO servidor a cada 5 s — 17 mil por dia, contra uma tabela
     * indexada por status, que não devolve nada em 99% das vezes. Ao portal do fornecedor não chega
     * nada enquanto não houver ordem, e é só isso que precisa ser econômico.
     *
     * Não descemos mais que isso porque abaixo de uns segundos o ganho some dentro do tempo de
     * resposta do próprio portal, e o que sobra é só barulho.
     */
    intervaloMs: 5 * 1000,
    /** Quantas ordens pegar por vez. A fila é de decisão humana, não de volume. */
    porCiclo: 5,
    /**
     * As duas rotas do portal, MEDIDAS NO FIO (2026-08-21) — e não as que o bundle sugeria.
     *
     * O bundle tem `/api/admin/transportation/agency/trip/accept` escrito em texto, e foi o que eu
     * usei primeiro. O que o portal chama de verdade, capturado num aceite real do usuário, é
     * `/api/line_haul/agency/...` — a mesma família que o robô de LEITURA já usa. Provavelmente são
     * apelidos do mesmo serviço, mas "provavelmente" não serve para um POST que não tem volta.
     *
     * A recusa vai pela simetria da que foi medida. A primeira recusa real confirma ou desmente, e
     * ela falha do jeito certo — a ordem fica em `failed` com a mensagem do portal, sem recusar nada.
     */
    aceitar: "/api/line_haul/agency/trip/accept",
    rejeitar: "/api/line_haul/agency/trip/reject",
    /**
     * A ATRIBUIÇÃO TEM DUAS ROTAS, e a escolha não é de estilo (medido em 2026-08-21).
     *
     * Com UM motorista o portal chama `/trip/assign` e manda `operation_info`. Com DOIS ele chama
     * `/trip/accept/assign_multiple_driver`, manda `driver_pool` e NÃO manda `operation_info`. Não é
     * o mesmo pacote com um campo a mais — são chamadas distintas.
     *
     * Mandar dois motoristas pela rota de um faz o portal responder SUCESSO e ignorar o segundo em
     * silêncio, que é o pior desfecho possível: a viagem sai com metade do que foi pedido e ninguém
     * fica sabendo.
     */
    atribuir: "/api/line_haul/agency/trip/assign",
    atribuirDois: "/api/line_haul/agency/trip/accept/assign_multiple_driver",
    /**
     * A CONFERÊNCIA (2026-08-28, a pedido).
     *
     * `retcode: 0` é o portal dizendo que RECEBEU a chamada — não que mudou de estado. Este é o
     * mesmo endpoint que o robô de LEITURA já usa, chamado aqui logo depois da ação para perguntar
     * "e aí, mudou?". Quem decide se a resposta confirma é o TMS; este robô só relê e entrega.
     */
    detalhe: "/api/line_haul/agency/trip/detail",
    /**
     * A LISTA DE ROTAS DA AGÊNCIA (2026-09-04, a pedido) — a caixinha "Rota" da tela de atribuir.
     *
     * Existe só para as viagens de REVEZAMENTO: aquelas com ponto de troca no meio do caminho, onde
     * o portal exige um motorista por trecho. Nelas o detalhe traz
     * `express_route_info.need_select_agency_route: true` e a atribuição sem `route_id` não passa.
     *
     * Lida com origem e destino da própria viagem. Devolve `section_id` — que é o valor do campo —
     * e `show_id`, que é só o número que a tela mostra entre colchetes. Mandar o `show_id` seria
     * mandar o rótulo no lugar da chave.
     */
    rotasDaAgencia: "/api/line_haul/agency/route_management/express_route/list",
  };

  /** A versão vem do CABEÇALHO, não de uma constante copiada — que envelhece calada. */
  const VERSAO =
    (typeof GM_info !== "undefined" && GM_info?.script?.version) || "versão desconhecida";
  const log = (...a) => console.log(`[TMS ações ${VERSAO}]`, ...a);
  const erro = (...a) => console.warn(`[TMS ações ${VERSAO}]`, ...a);

  /** Fala com o TMS. `GM_xmlhttpRequest` porque a chamada é cross-origin, como nos outros robôs. */
  function aoTms(corpo) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.tms}/api/imports/portal-commands`,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ token: CONFIG.token, ...corpo }),
        timeout: 30000,
        onload: (res) => {
          if (res.status < 200 || res.status >= 300) {
            reject(new Error(`TMS ${res.status}: ${String(res.responseText).slice(0, 160)}`));
            return;
          }
          try {
            resolve(JSON.parse(res.responseText || "{}"));
          } catch (e) {
            reject(new Error(`resposta do TMS ilegível: ${e}`));
          }
        },
        onerror: () => reject(new Error("falha de rede ao falar com o TMS")),
        ontimeout: () => reject(new Error("o TMS demorou demais")),
      });
    });
  }

  /**
   * Executa UMA ordem no portal, na sessão deste navegador.
   *
   * O corpo de cada rota foi lido do bundle do portal: aceitar leva `{trip_id}`; rejeitar leva
   * `{trip_id, reject_reason}`, onde `reject_reason` é o id que ele mesmo serve na lista de motivos.
   *
   * A OBSERVAÇÃO NÃO VAI. O portal não tem campo para ela nesta chamada — o diálogo dele só pergunta
   * o motivo. Ela é registro NOSSO, e fica no TMS ao lado de quem decidiu. Dizer isso aqui é o que
   * impede alguém de "consertar" mandando um campo que o outro lado ignora.
   *
   * `retcode: 0` é o "deu certo" do portal, e um HTTP 200 com retcode diferente de zero é FALHA —
   * confundir os dois faria o TMS dar por aceita uma viagem que continua pendente.
   */
  /**
   * A ROTA DA AGÊNCIA, quando a viagem é de REVEZAMENTO (2026-09-04, a pedido).
   *
   * ── O QUE É UMA VIAGEM DE REVEZAMENTO ────────────────────────────────────────────────────────
   *
   * É a que tem ponto de troca no meio do caminho. Medido na LH LT0Q9202FC691 (Goiânia_02 →
   * Barreiras, 808 km): um ponto, "P1 - GOIANIA X BARREIRAS", na BR-020. O portal exige um motorista
   * por trecho e, na tela dele, uma caixinha "Rota" obrigatória.
   *
   * ── POR QUE O ROBÔ RESOLVE, E NÃO O TMS ─────────────────────────────────────────────────────
   *
   * O `section_id` é identificador interno do portal, servido por uma lista que só existe dentro da
   * sessão dele. O TMS não tem como sabê-lo sem espelhar mais um cadastro — e ele muda do lado de
   * lá sem avisar. Aqui a resposta é lida no instante do envio, que é quando ela vale.
   *
   * O que foi usado volta no resultado (`rotaDaAgencia`), e o TMS grava na auditoria: sem isso o
   * robô estaria decidindo algo que ninguém consegue revisar depois.
   *
   * ── DEVOLVE `null` EM TRÊS CASOS, e nenhum deles é falha ────────────────────────────────────
   *
   * Não é revezamento · o detalhe não veio · a lista não trouxe rota. Nos três a atribuição segue
   * sem `route_id`, que é exatamente como ela sempre foi. Inventar um id seria pior do que não
   * mandar: o portal aceitaria a chamada e escalaria o motorista no trecho errado.
   *
   * ── QUANTOS MOTORISTAS CABEM ────────────────────────────────────────────────────────────────
   *
   * O `driver_pool` do portal aceita até NOVE (usuário, 04/09), então uma rota com vários pontos de
   * troca é possível do lado dele. O TMS guarda UM segundo motorista, e é esse o limite: com um
   * ponto de troca — o caso medido — um basta.
   */
  async function rotaDaAgencia(ordem) {
    const estacao = localStorage.getItem("stationId");
    if (!estacao) return null;

    const det = await conferir(ordem);
    const info = det?.data?.express_route_info;
    // Só as de revezamento pedem. O portal diz qual é qual — não se adivinha pelo tipo de veículo.
    if (!info || info.need_select_agency_route !== true) return null;
    if (!info.start_station || !info.end_station) return null;

    const u = new URL(CONFIG.rotasDaAgencia, location.origin);
    u.searchParams.set("count", "50");
    u.searchParams.set("origin", String(info.start_station));
    u.searchParams.set("destination", String(info.end_station));
    const r = await fetch(u.toString(), { credentials: "include" });
    if (!r.ok) return null;
    const corpo = await r.json().catch(() => null);
    if (corpo?.retcode !== 0) return null;

    const lista = corpo?.data?.list;
    if (!Array.isArray(lista) || lista.length === 0) return null;
    /*
      UMA SÓ, OU NENHUMA.

      Com mais de uma rota entre as mesmas duas estações não há como o robô escolher — a decisão é
      de quem conhece o trajeto, e chutar mandaria o motorista pelo caminho errado. Devolver `null`
      faz a atribuição sair sem `route_id` e o portal recusar, que é o desfecho honesto: a pessoa vê
      a recusa e atribui na tela dele.
    */
    if (lista.length > 1) return null;
    const secao = lista[0]?.section_id;
    return Number.isFinite(secao) && secao > 0 ? Number(secao) : null;
  }

  async function executar(ordem) {
    const doisMotoristas = ordem.action === "assign" && Boolean(ordem.secondDriverId);
    const caminho =
      ordem.action === "accept"
        ? CONFIG.aceitar
        : ordem.action === "reject"
          ? CONFIG.rejeitar
          : doisMotoristas
            ? CONFIG.atribuirDois
            : CONFIG.atribuir;
    /**
     * A ESTAÇÃO VAI NO CORPO, e é obrigatória.
     *
     * Não estava no que eu li do bundle; apareceu no pacote real: `agency_current_station_id: 5015`.
     * É a mesma agência sob a qual a aba está logada, e sai do mesmo lugar de onde o robô de leitura
     * a tira. Sem ela o portal não sabe QUEM está aceitando.
     *
     * Ausência dela é sessão caída, não descuido: a ordem falha com essa palavra, em vez de sair
     * pela metade e receber um erro que ninguém sabe traduzir.
     */
    const estacao = localStorage.getItem("stationId");
    if (!estacao) throw new Error("stationId não encontrado: a sessão do portal caiu?");

    const base = {
      trip_id: Number(ordem.portalTripId),
      agency_current_station_id: Number(estacao),
    };

    /*
      A ROTA É RESOLVIDA ANTES, e só para atribuição de dois.

      Uma chamada a mais por atribuição de revezamento — que são poucas. Não vale para aceite nem
      recusa, que não têm este campo, e não vale para atribuição de um motorista: essas não passam
      pelo caminho de revezamento do portal.
    */
    const rota = doisMotoristas ? await rotaDaAgencia(ordem) : null;
    const corpo =
      ordem.action === "accept"
        ? base
        : ordem.action === "reject"
          ? { ...base, reject_reason: ordem.reasonId }
          : doisMotoristas
            ? {
                ...base,
                driver_id: ordem.driverId,
                /*
                  `driver_pool` É A LISTA DOS MOTORISTAS SEGUINTES, e o portal aceita até NOVE
                  (usuário, 04/09). Mandamos um só porque é um só que o TMS guarda — o limite é
                  nosso, e está dito aqui para ninguém ler este `[um]` como sendo regra do portal.
                */
                driver_pool: [ordem.secondDriverId],
                vehicle_plate_number_list: ordem.plates,
                /*
                  A ROTA, só quando a viagem é de revezamento (2026-09-04).

                  `rota` é nula na esmagadora maioria — e aí o campo simplesmente não vai, que é
                  como a atribuição sempre foi. Mandar `route_id: null` seria diferente de não
                  mandar: o portal trata ausência e nulo de formas que não medimos.
                */
                ...(rota ? { route_id: rota } : {}),
              }
            : {
                ...base,
                driver_id: ordem.driverId,
                vehicle_plate_number_list: ordem.plates,
                // Copiado do pacote real. O portal manda os dois assim na tela dele; não invento
                // valor para campo que não entendo.
                operation_info: { device_type: 1, operation_mode: 0 },
              };

    const r = await fetch(caminho, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) {
      return { ok: false, error: `portal HTTP ${r.status}`, response: null };
    }
    const payload = await r.json().catch(() => null);
    if (payload?.retcode !== 0) {
      return {
        ok: false,
        error: `portal retcode ${payload?.retcode}: ${String(payload?.message ?? "").slice(0, 200)}`,
        response: payload,
      };
    }
    /*
      A ROTA USADA VOLTA NO RELATO (2026-09-04).

      O robô escolheu algo — qual trajeto o portal vai registrar — e escolha sem rastro é escolha que
      ninguém consegue revisar depois. O TMS grava na auditoria ao lado de quem pediu a atribuição.

      Nula quando não era revezamento, que é a esmagadora maioria.
    */
    return { ok: true, error: null, response: payload, rotaDaAgencia: rota };
  }

  /**
   * Relê a viagem no portal e devolve o corpo CRU, sem interpretar nada.
   *
   * A regra de "isto confirma a ação?" mora no TMS (`portal-confirmacao.ts`, sob teste). Aqui só se
   * busca: um robô que decidisse por conta própria seria uma segunda regra de negócio, num arquivo
   * que se publica à mão e envelhece separado do servidor.
   */
  async function conferir(ordem) {
    const estacao = localStorage.getItem("stationId");
    if (!estacao) return null;
    const u = new URL(CONFIG.detalhe, location.origin);
    u.searchParams.set("trip_id", String(ordem.portalTripId));
    u.searchParams.set("agency_current_station_id", estacao);
    const r = await fetch(u.toString(), { credentials: "include" });
    if (!r.ok) return null;
    const payload = await r.json().catch(() => null);
    // `retcode` diferente de zero aqui é falha DA LEITURA, não da ação: devolver o corpo assim
    // faria o TMS comparar contra lixo e reprovar uma atribuição que deu certo.
    return payload?.retcode === 0 ? payload : null;
  }

  async function ciclo() {
    /**
     * O TEXTO DE EXEMPLO ESCRITO PARTIDO — e é de propósito (2026-08-22).
     *
     * Instalar este robô é copiar o arquivo do repositório e trocar o texto de exemplo pelo token
     * de verdade. Quem faz isso com um substituir-tudo — `str.replace` do Python troca TODAS as
     * ocorrências, e foi o que eu fiz — troca também a que está AQUI. A guarda vira
     * `if (token === <o token certo>)`, e o robô passa a recusar exatamente o token válido,
     * calado, dizendo "token não configurado" com o token correto na mão.
     *
     * Custou uma hora de caça a um fantasma: o arquivo certo no disco, a versão certa rodando, o
     * token certo conferido contra o servidor — e a mensagem insistindo que não havia token.
     *
     * Partido em dois pedaços, nenhum substituir-tudo do literal inteiro encosta nesta linha. A
     * ocorrência do `CONFIG` continua inteira, que é a única que deve ser trocada.
     */
    const TOKEN_DE_EXEMPLO = "COLE_AQUI" + "_O_TOKEN";
    if (!CONFIG.token || CONFIG.token === TOKEN_DE_EXEMPLO) {
      /**
       * A MENSAGEM DIZ O QUE ELE LEU, não só que está errado (2026-08-22).
       *
       * "token não configurado" mandou meia hora de caça a um fantasma: o arquivo no disco tinha
       * o token certo, o Tampermonkey MOSTRAVA o arquivo certo, e mesmo assim isto aparecia a cada
       * ciclo. Sem saber O QUE ele tinha em mãos, não dava para separar "veio vazio" de "veio o
       * texto de exemplo" — problemas diferentes, com causas diferentes.
       *
       * O TAMANHO basta para distinguir e não expõe o segredo: 0 é vazio, 17 é o texto de exemplo
       * do repositório, 48 é um token de verdade (e aí o defeito está em outro lugar).
       */
      const lido = String(CONFIG.token || "");
      erro(
        `token não configurado — li ${lido.length} caractere(s)` +
          `${lido === TOKEN_DE_EXEMPLO ? " (é o texto de exemplo do repositório)" : ""}` +
          ". Nenhuma ordem será buscada.",
      );
      return;
    }
    const { ordens } = await aoTms({ limite: CONFIG.porCiclo });
    if (!Array.isArray(ordens) || ordens.length === 0) return;

    log(`${ordens.length} ordem(ns) para executar`);
    for (const ordem of ordens) {
      let resultado;
      try {
        resultado = await executar(ordem);
      } catch (e) {
        // Falha de rede ao falar com o PORTAL. Ainda assim é relatada: uma ordem que sai da fila e
        // nunca volta é a única coisa que este desenho não pode produzir — ela ficaria em `sent`
        // para sempre, e a tela diria "enviando" até alguém desconfiar.
        resultado = { ok: false, error: String(e?.message ?? e).slice(0, 200), response: null };
      }
      /**
       * A RELEITURA, só quando o portal disse que deu certo (2026-08-28, a pedido).
       *
       * Quando ele RECUSOU não há o que conferir: o estado não mudou, e é isso que a recusa já diz.
       *
       * `catch` que devolve `null`, e não erro: falhar a conferência não pode transformar uma ação
       * BEM-SUCEDIDA em falha relatada — o portal já executou. Sem `confirmacao`, o TMS fecha a
       * ordem como sempre fez e registra na auditoria que não foi verificada, que é honesto.
       *
       * E ela vai no MESMO relato, não numa segunda ida: dois POSTs abririam uma janela em que a
       * ordem está encerrada e a conferência ainda não chegou — e é justamente nessa janela que o
       * popup fecharia dizendo "deu certo" sem saber.
       */
      if (resultado.ok) {
        resultado.confirmacao = await conferir(ordem).catch(() => null);
      }
      try {
        await aoTms({ id: ordem.id, ...resultado });
        log(
          `${ordem.action} em ${ordem.externalTripId ?? ordem.portalTripId}: ` +
            (resultado.ok ? "portal aceitou" : `falhou — ${resultado.error}`),
        );
      } catch (e) {
        // Aqui a ordem JÁ foi executada no portal e o relato não chegou. É o pior caso, e por isso
        // ele é gritado: o TMS vai continuar dizendo "enviando" para algo que já aconteceu, e a
        // leitura do ciclo seguinte é quem vai desempatar.
        erro(`EXECUTEI E NÃO CONSEGUI RELATAR (${ordem.id}): ${String(e?.message ?? e)}`);
      }
    }
  }

  /**
   * O próximo ciclo é agendado a partir do FIM do anterior, nunca por `setInterval`.
   *
   * Com intervalo fixo, um ciclo lento se sobrepõe ao seguinte e a mesma ordem sairia duas vezes. O
   * TMS já se defende disso (ele marca a ordem como pega na mesma ida que a entrega), mas defesa em
   * um lugar só é defesa que ninguém revisa.
   */
  function repetir() {
    ciclo()
      .catch((e) => erro("ciclo falhou:", String(e?.message ?? e).slice(0, 200)))
      .finally(() => setTimeout(repetir, CONFIG.intervaloMs));
  }

  log(`ativo. Executa o que o TMS mandar, a cada ${CONFIG.intervaloMs / 1000}s. Não decide nada.`);
  repetir();
})();
