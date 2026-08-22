// ==UserScript==
// @name         Brazil TMS — executor de decisões no portal
// @namespace    braziltransports.com.br
// @version      0.4.0
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
    const corpo =
      ordem.action === "accept"
        ? base
        : ordem.action === "reject"
          ? { ...base, reject_reason: ordem.reasonId }
          : doisMotoristas
            ? {
                ...base,
                driver_id: ordem.driverId,
                driver_pool: [ordem.secondDriverId],
                vehicle_plate_number_list: ordem.plates,
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
    return { ok: true, error: null, response: payload };
  }

  async function ciclo() {
    if (!CONFIG.token || CONFIG.token === "COLE_AQUI_O_TOKEN") {
      erro("token não configurado — nenhuma ordem será buscada");
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
