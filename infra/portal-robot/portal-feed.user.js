// ==UserScript==
// @name         Brazil TMS — alimentador do portal
// @namespace    braziltransports.com.br
// @version      1.14.0
// @description  Lê as três listagens do portal do cliente e entrega ao TMS. Somente leitura.
// @match        https://logistics.myagencyservice.com.br/*
// @connect      tmsdev.braziltransports.com.br
// @connect      tms.braziltransports.com.br
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// Sem estas duas linhas o Tampermonkey nunca procura versão nova, e toda correção vira "abra a URL e
// clique em Reinstalar" — com o agravante de que os dois robôs desta VM têm nome parecido e moram no
// mesmo servidor, o que já causou uma instalação no arquivo errado.
// @updateURL    http://127.0.0.1:8899/portal-feed.user.js
// @downloadURL  http://127.0.0.1:8899/portal-feed.user.js
// ==/UserScript==

/**
 * O robô (2026-08-16).
 *
 * Roda numa VM dedicada, dentro do Chrome já logado no portal do cliente. A cada poucos minutos ele
 * pergunta ao portal o que mudou e entrega a resposta CRUA ao TMS, que faz todo o resto. Nada aqui
 * decide o que acontece com uma viagem.
 *
 * Três regras que este arquivo NÃO pode quebrar:
 *
 *   1. SOMENTE LEITURA. Só existe GET, e só para as três listagens — planejado, em curso e
 *      concluído. Nenhum clique, nenhum POST ao portal, nada de atribuir ou aceitar. Se um dia
 *      precisar escrever, não é aqui.
 *   2. BURRO DE PROPÓSITO. Nenhuma regra de negócio: não interpreta status, não decide o que é
 *      atraso, não filtra viagem. Atualizar script em VM é trabalho manual e não tem teste; a
 *      inteligência mora no TMS (`portal-api.ts`, sob teste).
 *   3. NUNCA TRAVA E SE CURA. Um ciclo é agendado a partir do FIM do anterior, todo erro é engolido
 *      e registrado, e nada é recursivo. A primeira varredura de execução olha 30 dias para trás,
 *      então qualquer interrupção se resolve sozinha no arranque seguinte.
 *
 * Instalação: Tampermonkey → novo script → cole este arquivo → ajuste o CONFIG abaixo → salve. O
 * script sobe sozinho junto com a aba do portal.
 */

/* global GM_xmlhttpRequest */
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
    /** Código do cliente no TMS. */
    customerCode: "SHOPEE",
    /**
     * De quanto em quanto tempo perguntar ao portal. Os TRÊS ciclos agora andam juntos, a cada cinco
     * minutos (2026-08-19, a pedido) — antes o plano ia de quinze em quinze.
     *
     * O quinze nasceu de uma conta que envelheceu: o comentário da janela de 15 dias falava em "~12
     * páginas por ciclo", e num volume desses ler de cinco em cinco seria pesado para o portal do
     * cliente. Medido hoje, o plano tem 292 viagens — TRÊS páginas de 100, a 1,5 s cada. O custo real
     * é de segundos, e ~85% das linhas voltam sem mudança nenhuma.
     *
     * O que isso corta é a espera de quem CONSULTA. A aceitação do cliente e a atribuição de motorista
     * dele chegam pelo plano; até aqui elas podiam levar quinze minutos para aparecer na Torre,
     * enquanto o caminhão em movimento já era lido de cinco em cinco. Duas velocidades na mesma tela
     * é o tipo de coisa que faz a pessoa desconfiar da tela inteira.
     *
     * Se um ciclo demorar mais que o intervalo, nada se acumula: `repetir` só agenda o próximo depois
     * que o anterior termina.
     */
    /**
     * O PLANO PASSA A UM MINUTO (2026-08-22, a pedido).
     *
     * O pedido foi "dá para ler de 10 em 10 segundos?". Não do jeito que ele lê: os TRÊS recortes
     * juntos custam ~43 páginas e 136 s de trabalho por ciclo, e a execução sozinha leva 114 s —
     * num ciclo de 20 s ela recomeçaria antes de terminar.
     *
     * Mas o que se espera é a LH NOVA aparecer, e ela nasce no PLANO, que é a parte barata: 6
     * páginas, 18 s. Só ele desce para um minuto; execução e em curso ficam nos cinco.
     *
     * A conta do que isso custa AO CLIENTE, que é o limite que importa: de ~1,2 para ~6 páginas por
     * minuto. Cinco vezes mais, sobre um número pequeno. Ler tudo de 20 em 20 segundos seria quinze
     * vezes sobre um número grande — e o portal é do fornecedor, não nosso.
     *
     * 18 s de trabalho numa janela de 60 s deixa folga de sobra. Se um ciclo estourar o intervalo,
     * nada empilha: `repetir` só agenda o próximo quando o anterior termina.
     */
    intervaloPlanoMs: 5 * 60 * 1000,
    /**
     * O PLANO INCREMENTAL — a leitura rápida que só pergunta o que mudou (2026-08-22).
     *
     * A execução sempre filtrou por `mtime` e volta com 1 página em 1 s. O plano perguntava "me dá
     * tudo de novo": 6 páginas e 542 viagens a cada ciclo, para encontrar as duas que mudaram.
     *
     * MEDIDO NO PORTAL antes de escrever isto, porque o parâmetro não é documentado e o robô nunca
     * o tinha usado neste endpoint — o mesmo `sta`, com e sem `mtime`, na mesma sessão:
     *
     *   sem filtro        542 viagens
     *   mtime últimas 6h   48
     *   mtime última 1h     2
     *
     * Filtra de verdade. Então o plano vira DOIS ciclos: este, de vinte em vinte segundos, e o
     * completo, que fica nos cinco minutos.
     */
    intervaloPlanoNovoMs: 20 * 1000,
    /**
     * A janela do incremental é TRÊS VEZES o intervalo dele, e a folga é o ponto.
     *
     * Um ciclo que falhe — rede oscilando, portal lento, aba recarregando — não pode custar uma LH
     * que só apareceria cinco minutos depois, no completo. Com a janela maior que o passo, o ciclo
     * seguinte relê o que o anterior perdeu. O preço é reler duas ou três viagens; o preço de não
     * ter a folga é alguém procurando na tela uma viagem que existe no portal.
     */
    planoNovoJanelaSegundos: 60,
    /**
     * O LEILÃO DE SPOT, DE CINCO EM CINCO SEGUNDOS (2026-08-24, a pedido).
     *
     * A oferta fica aberta DEZ MINUTOS e é disputada — quem vê primeiro dá o lance. Até hoje quem
     * avisava era um monitor numa VM Windows, a cada 30 segundos, e essa VM travava sozinha sem que
     * ninguém percebesse: ela era o único robô que não mandava sinal de vida.
     *
     * MEDIDO ANTES DE ESCREVER, e é o que torna cinco segundos barato: os campos do leilão
     * (`bid_status`, `bid_price`, `price_bidding_ddl`) já vêm nesta MESMA listagem que o robô lê há
     * meses, e eram simplesmente ignorados. Com o filtro incremental, a pergunta "mudou algo nos
     * últimos 15 segundos?" volta em 70 ms quando nada mudou — que é quase sempre. A consulta cheia
     * levava 1.533 ms. Cinco segundos aqui pesa MENOS no portal do cliente do que os 30 segundos do
     * monitor antigo.
     *
     * A janela de DATAS é curta de propósito: oferta de spot é para viagem próxima, e -0/+3 dias
     * cobre 209 viagens em vez de 442. Menos página, menos tempo, mesma cobertura.
     */
    intervaloSpotMs: 5 * 1000,
    /** Três vezes o intervalo, pela mesma razão do incremental do plano: um ciclo que falhe não custa uma oferta. */
    spotJanelaSegundos: 15,
    spotDiasAdiante: 3,
    /** `bid_status = 10` é "em leilão". Medido: 10 aparece em 17 de 442; 0 é sem leilão e 40 é encerrado. */
    spotBidStatusAberto: 10,
    intervaloExecucaoMs: 5 * 60 * 1000,
    /** Viagens por página. O portal aceita 100; o TMS aplica uma página por vez. */
    porPagina: 100,
    /**
     * Teto de páginas por ciclo — trava contra laço infinito. Precisa caber a varredura de arranque
     * (30 dias ≈ 2.400 viagens no histórico observado), com folga. Bater o teto NÃO é silencioso.
     */
    maxPaginas: 40,
    /**
     * Janela do plano: 15 dias para trás, uma semana à frente (1.6.0).
     *
     * Eram 1 dia para trás, e o preço disso apareceu inteiro na medição: uma viagem fica no
     * Planejado ESPERANDO ACEITAÇÃO por dias — 55 estavam assim, algumas de 11/08 —, e ao passar de
     * um dia ela saía do campo de visão do robô e CONGELAVA no TMS. Sem preço, sem mudança de
     * status, sem detectar cancelamento: parada para sempre, gritando alerta, enquanto no portal
     * seguia viva e já precificada (uma delas, R$ 4.548,30 que o TMS não tinha).
     *
     * O corte era visível a olho nu: nenhuma viagem com data anterior a ontem tinha valor. Nenhuma.
     *
     * Quinze dias custa TRÊS páginas por ciclo em vez de 2 (292 viagens, medido em 2026-08-19),
     * bem abaixo do teto de 40. É barato perto de perder de vista uma viagem que o cliente ainda
     * considera dele — e barato o bastante para o ciclo rodar de cinco em cinco minutos.
     */
    planoDiasAtras: 15,
    /**
     * TRINTA DIAS À FRENTE, e não sete (2026-08-21).
     *
     * O sete nasceu quando o robô só servia para ACOMPANHAR execução: viagem de daqui a duas semanas
     * não tinha o que acompanhar. Depois o TMS passou a decidir aceite e atribuição, e o número
     * ficou curto sem que ninguém percebesse — o alcance vira o limite do que dá para trabalhar.
     *
     * O sintoma foi concreto: a LT0Q8T02EN8G1, aceita no portal e com coleta em 30/08, simplesmente
     * não existia no TMS. O usuário foi atribuí-la e não a encontrou. Uma viagem que a empresa já se
     * comprometeu a fazer, invisível para o sistema que decide quem a faz.
     *
     * Medido no portal: a janela de 7 dias vê 472 viagens (22 esperando decisão); a de 30 vê 616
     * (23). O cliente publica até ~10 dias à frente, então o 30 dá folga em vez de raspar o limite —
     * e o custo é ir de 5 para 7 páginas por ciclo, ~3 segundos a cada cinco minutos.
     */
    planoDiasAdiante: 30,
    /**
     * A aba "Aceito" — as viagens que estão ACONTECENDO agora (2026-08-16).
     *
     * O portal tem três abas e o robô lia duas. As 73 viagens em curso ficavam invisíveis: elas saem
     * do Planejado assim que são aceitas e só reaparecem no Concluído quando terminam. Enquanto
     * isso, o TMS achava que 73 caminhões nunca tinham chegado para carregar — e alertava por isso,
     * embora o portal registrasse chegada, carga e partida de cada um.
     *
     * Entra como `in_progress` (1.5.0). Entrava como execução, e aí o TMS não podia criar viagem a
     * partir daqui: 49 das 73 nem existiam nele, porque foram aceitas antes de alguém olhar o
     * Planejado. Iam rodar e terminar fora do sistema.
     */
    intervaloEmCursoMs: 5 * 60 * 1000,
    emCursoDiasAtras: 3,
    emCursoDiasAdiante: 7,
    /** Janela da execução: o que mudou nas últimas horas (o portal filtra por mtime). */
    execucaoHorasAtras: 6,
    /**
     * A PRIMEIRA execução depois que o robô sobe olha muito mais para trás — 30 dias.
     *
     * Uma janela de 6 horas é ótima em regime, e péssima depois de qualquer interrupção: o robô
     * fora do ar por sete horas (reinício, queda de rede, VM reiniciada) perderia para sempre tudo
     * o que aconteceu no intervalo, porque o portal filtra por data de MODIFICAÇÃO e uma viagem
     * concluída não é modificada de novo. Uma varredura larga no arranque faz o robô se curar
     * sozinho, e é barata: acontece uma vez por sessão.
     *
     * Eram 30 dias, e 30 é exatamente o número que não serve (2026-08-18). Uma correção no TMS —
     * fechar a viagem que o portal diz Completed sem hora de descarga — precisava que o robô
     * relesse as viagens afetadas, e a mais antiga delas tinha `mtime` de 30,3 dias. A varredura
     * passou raspando por fora e o conserto não alcançou nada.
     *
     * O portal guarda por volta de 45 dias de histórico. Cobrir a janela INTEIRA é o que faz
     * "reinicie o robô" ser uma resposta verdadeira quando o TMS aprende a ler algo melhor — com 30
     * dias, era uma resposta que parecia certa e não era.
     */
    execucaoHorasPrimeiroCiclo: 24 * 45,
  };

  const log = (...a) => console.log("[TMS robô]", ...a);
  const erro = (...a) => console.warn("[TMS robô]", ...a);

  /** O id da estação que o próprio portal guarda — nunca fixo no código. */
  function estacao() {
    const id = localStorage.getItem("stationId");
    if (!id) throw new Error("stationId não encontrado: a sessão do portal caiu?");
    return id;
  }

  const agora = () => Math.floor(Date.now() / 1000);
  const DIA = 86400;

  /** Uma página de uma das duas listagens. Somente GET, com a sessão do próprio navegador. */
  async function buscarPagina(caminho, filtro, pagina) {
    const u = new URL(caminho, location.origin);
    for (const [k, v] of Object.entries(filtro)) u.searchParams.set(k, String(v));
    u.searchParams.set("pageno", String(pagina));
    u.searchParams.set("count", String(CONFIG.porPagina));
    u.searchParams.set("agency_current_station_id", estacao());

    const r = await fetch(u.toString(), { credentials: "include" });
    if (!r.ok) throw new Error(`portal respondeu HTTP ${r.status}`);
    return r.json();
  }

  /**
   * Entrega uma página ao TMS. `GM_xmlhttpRequest` em vez de `fetch` porque a chamada é
   * cross-origin: assim o TMS não precisa abrir CORS para o domínio do cliente.
   */
  /**
   * O PULSO DO ROBÔ (2026-08-21): quanto o ciclo ANTERIOR de cada modo levou, e o intervalo dele.
   *
   * Vai pendurado na entrega seguinte, e não numa chamada própria: uma requisição a mais só para
   * dizer "estou bem" seria mais tráfego para vigiar tráfego. O número é do ciclo anterior porque a
   * duração deste só se conhece quando ele termina — e aí a entrega já foi.
   *
   * Serve para a tela de Status avisar que a VM está sufocando ANTES de o dado parar: configurado
   * 10s, levando 45s é sintoma; dado que parou é consequência.
   */
  const ultimoCiclo = {};

  function entregar(modo, payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.tms}/api/imports/portal-feed`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.token}`,
        },
        data: JSON.stringify({
          mode: modo,
          customerCode: CONFIG.customerCode,
          payload,
          ...(ultimoCiclo[modo] ?? {}),
        }),
        timeout: 120000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            let corpo = {};
            try {
              corpo = JSON.parse(res.responseText);
            } catch {
              /* resumo é opcional */
            }
            resolve(corpo);
          } else {
            reject(
              new Error(`TMS respondeu ${res.status}: ${String(res.responseText).slice(0, 200)}`),
            );
          }
        },
        onerror: () => reject(new Error("falha de rede ao falar com o TMS")),
        ontimeout: () => reject(new Error("TMS não respondeu a tempo")),
      });
    });
  }

  /**
   * O detalhe de UMA viagem — a única coisa que exige uma chamada por viagem.
   *
   * Só o detalhe traz o "Operador de atribuição". Buscar isso para as 500 viagens de cada ciclo
   * seria absurdo; então o TMS responde quais ainda faltam (`needDetail`) e o robô busca só essas.
   * A lista encolhe sozinha até zerar.
   */
  async function detalharViagens(numerosLH, lista) {
    // O detalhe é buscado pelo id NUMÉRICO do portal, e o TMS só conhece o número da LH. A ponte
    // entre os dois está na própria página que acabou de ser lida.
    const idPorNumero = new Map((lista ?? []).map((t) => [t.trip_number, t.id]));
    let feitos = 0;
    // Toda falha aqui é CONTADA e dita no fim. A primeira versão engolia tudo em silêncio, e o
    // resultado foi um "zero gravados" sem nenhuma pista de onde a corrente arrebentava.
    const falhas = { semId: 0, httpDoPortal: 0, retcodeDoPortal: 0, aoEntregar: 0 };
    let ultimoErro = "";
    for (const numero of numerosLH) {
      const id = idPorNumero.get(numero);
      if (!id) {
        falhas.semId += 1;
        continue;
      }
      try {
        const u = new URL("/api/line_haul/agency/trip/detail", location.origin);
        u.searchParams.set("trip_id", String(id));
        u.searchParams.set("agency_current_station_id", estacao());
        const r = await fetch(u.toString(), { credentials: "include" });
        if (!r.ok) {
          falhas.httpDoPortal += 1;
          ultimoErro = `portal HTTP ${r.status}`;
          continue;
        }
        const payload = await r.json();
        if (payload?.retcode !== 0) {
          falhas.retcodeDoPortal += 1;
          ultimoErro = `portal retcode ${payload?.retcode}`;
          continue;
        }
        await entregar("detail", payload);
        feitos += 1;
      } catch (e) {
        falhas.aoEntregar += 1;
        ultimoErro = String(e?.message ?? e).slice(0, 160);
      }
    }
    const totalFalhas =
      falhas.semId + falhas.httpDoPortal + falhas.retcodeDoPortal + falhas.aoEntregar;
    if (totalFalhas > 0) {
      erro(
        `detalhe: ${feitos} ok, ${totalFalhas} falharam ` +
          `(sem id ${falhas.semId}, http ${falhas.httpDoPortal}, retcode ${falhas.retcodeDoPortal}, ` +
          `entrega ${falhas.aoEntregar}) — último: ${ultimoErro}`,
      );
    }
    return feitos;
  }

  /** Um ciclo: pagina a listagem e entrega cada página. Devolve o que aconteceu, para o log. */
  async function ciclo(modo, caminho, filtro) {
    let paginas = 0;
    let viagens = 0;
    let truncou = 0;
    let detalhes = 0;
    const estacoesDesconhecidas = new Set();

    for (let pagina = 1; pagina <= CONFIG.maxPaginas; pagina += 1) {
      const payload = await buscarPagina(caminho, filtro, pagina);
      const lista = payload?.data?.list ?? [];
      if (lista.length === 0) break;

      const resumo = await entregar(modo, payload);
      paginas += 1;
      viagens += lista.length;
      for (const e of resumo?.unknownStations ?? []) estacoesDesconhecidas.add(e);

      // O TMS diz quais viagens ainda estão sem o operador de atribuição; só essas custam uma
      // chamada extra, e a lista some sozinha conforme elas são preenchidas.
      if (resumo?.needDetail?.length) {
        log(`${modo}: TMS pediu detalhe de ${resumo.needDetail.length} viagem(ns)`);
        detalhes += await detalharViagens(resumo.needDetail, lista);
      }

      // Última página: o portal já disse quantas existem no total.
      const total = payload?.data?.total ?? 0;
      if (pagina * CONFIG.porPagina >= total) break;
      // Bateu o teto com viagens ainda por ler: diz quantas ficaram, em vez de fingir que acabou.
      if (pagina === CONFIG.maxPaginas) truncou = total - pagina * CONFIG.porPagina;
    }

    return {
      paginas,
      viagens,
      truncou,
      detalhes,
      estacoesDesconhecidas: [...estacoesDesconhecidas],
    };
  }

  /**
   * Agenda o próximo ciclo A PARTIR DO FIM deste — nunca em paralelo com ele mesmo. Se um ciclo
   * demora mais que o intervalo, o seguinte simplesmente começa depois; nada se acumula, nada
   * recursa, e um erro não interrompe a corrente.
   */
  function repetir(nome, intervaloMs, tarefa, modo) {
    let rodando = false;
    const passo = async () => {
      if (rodando) return;
      rodando = true;
      const t0 = Date.now();
      try {
        const r = await tarefa();
        log(
          `${nome}: ${r.viagens} viagens em ${r.paginas} página(s)${r.detalhes ? `, ${r.detalhes} detalhe(s)` : ""}, ${Math.round((Date.now() - t0) / 1000)}s`,
        );
        if (r.truncou > 0) {
          erro(`${nome}: teto de páginas atingido — ${r.truncou} viagens NÃO foram lidas`);
        }
        if (r.estacoesDesconhecidas.length) {
          erro(`${nome}: estações sem cadastro no TMS →`, r.estacoesDesconhecidas.join(", "));
        }
      } catch (e) {
        erro(`${nome} falhou (tenta de novo no próximo ciclo):`, e?.message ?? e);
      } finally {
        // O pulso deste ciclo viaja na entrega do PRÓXIMO — ver `ultimoCiclo`.
        if (modo) ultimoCiclo[modo] = { cicloMs: intervaloMs, duracaoMs: Date.now() - t0 };
        rodando = false;
        setTimeout(passo, intervaloMs);
      }
    };
    setTimeout(passo, 5000); // deixa a página assentar antes do primeiro ciclo
  }

  /**
   * O LEILÃO DE SPOT — a oferta que dura dez minutos (2026-08-24, a pedido).
   *
   * ── POR QUE ISTO MORA AQUI, E NÃO NUM ROBÔ PRÓPRIO ────────────────────────────────────────────
   *
   * Havia um monitor separado, numa VM Windows, lendo a mesma listagem a cada 30 segundos. A VM
   * travava sozinha — e como ele era o ÚNICO robô sem sinal de vida, ninguém sabia dizer se o
   * silêncio era falta de oferta ou máquina morta. Aqui ele herda tudo o que já funciona: a sessão,
   * o token, o pulso, e uma VM que está de pé há dezessete semanas.
   *
   * E não custa chamada nenhuma a mais ao cliente do que custaria um robô próprio: é a mesma
   * listagem do plano, com a mesma pergunta incremental.
   *
   * ── O QUE ELE MANDA, E O QUE NÃO INVENTA ──────────────────────────────────────────────────────
   *
   * A rota `/api/imports/spot-offer` foi desenhada para o monitor antigo, e o contrato dela é
   * mantido INTEIRO — mesmos campos, mesmos nomes. Isso é de propósito: a tela, o som, o aviso do
   * sistema e o cartão do dia já leem esse formato e estão validados em produção. Trocar o formato
   * junto com a origem seria mudar duas coisas ao mesmo tempo e não saber qual quebrou.
   *
   * O preço vai como TEXTO, como o portal manda. Converter para número aqui obrigaria a decidir o
   * que fazer com centavo, moeda e vazio — decisões que pertencem a quem exibe, não a quem lê.
   */
  const spotJaVistos = new Set();

  function paraOferta(v) {
    const paradas = Array.isArray(v.trip_station) ? v.trip_station : [];
    const nomes = paradas.map((p) => p.station_name).filter(Boolean);
    const primeira = paradas[0];
    /** O STA da PRIMEIRA parada: a hora de comparecer na origem, que é o que a sala precisa ler. */
    const staOrigem = primeira?.sta ? new Date(primeira.sta * 1000).toISOString() : undefined;
    return {
      portalTripId: String(v.trip_id ?? v.id ?? v.trip_number ?? ""),
      tripNumber: v.trip_number ? String(v.trip_number) : undefined,
      // "ORIGEM  ->  DESTINO", o texto que a sala lê de longe. Com mais de duas paradas, mostra as
      // pontas: o caminho do meio não cabe num cartão que se lê em três segundos.
      route: nomes.length > 1 ? `${nomes[0]}  ->  ${nomes[nomes.length - 1]}` : (nomes[0] ?? "—"),
      vehicle: v.vehicle_type_name ? String(v.vehicle_type_name) : undefined,
      price: v.bid_price != null ? String(v.bid_price) : undefined,
      originArrival: staOrigem,
      operator: v.operator ? String(v.operator) : undefined,
      createdAtPortal: v.ctime ? new Date(v.ctime * 1000).toISOString() : undefined,
    };
  }

  function entregarOferta(oferta) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `${CONFIG.tms}/api/imports/spot-offer`,
        headers: { "Content-Type": "application/json" },
        // O token vai no CORPO, como o monitor antigo fazia: `Authorization` obrigaria a um
        // preflight que a origem do portal do cliente teria de negociar.
        data: JSON.stringify({ token: CONFIG.token, offer: oferta }),
        timeout: 30000,
        onload: (res) =>
          res.status >= 200 && res.status < 300
            ? resolve()
            : reject(new Error(`TMS respondeu ${res.status}`)),
        onerror: () => reject(new Error("falha de rede")),
        ontimeout: () => reject(new Error("TMS não respondeu a tempo")),
      });
    });
  }

  async function cicloSpot() {
    const payload = await buscarPagina(
      "/api/line_haul/agency/trip/list",
      {
        query_type: 1,
        sta: `${agora()},${agora() + CONFIG.spotDiasAdiante * DIA}`,
        mtime: `${agora() - CONFIG.spotJanelaSegundos},${agora()}`,
      },
      1,
    );
    const lista = payload?.data?.list ?? [];
    const emLeilao = lista.filter((v) => v.bid_status === CONFIG.spotBidStatusAberto);

    let novas = 0;
    for (const v of emLeilao) {
      const oferta = paraOferta(v);
      if (!oferta.portalTripId) continue;
      // O TMS também ignora repetido (a chave é o id do portal), mas mandar de novo a cada cinco
      // segundos encheria o log do servidor com o mesmo aviso enquanto o leilão estiver aberto.
      if (spotJaVistos.has(oferta.portalTripId)) continue;
      spotJaVistos.add(oferta.portalTripId);
      try {
        await entregarOferta(oferta);
        novas += 1;
        log(`SPOT: ${oferta.tripNumber ?? oferta.portalTripId} · ${oferta.route}`);
      } catch (e) {
        // Solta da memória para o próximo ciclo tentar de novo: perder uma oferta por uma falha de
        // rede é o oposto do que este ciclo existe para fazer.
        spotJaVistos.delete(oferta.portalTripId);
        erro("SPOT: não consegui entregar", String(e?.message ?? e));
      }
    }
    return novas;
  }

  /**
   * O LAÇO DO SPOT É PRÓPRIO, e não o `repetir` dos outros ciclos — por duas razões.
   *
   * SILÊNCIO. O `repetir` registra uma linha por ciclo, o que serve num ciclo de cinco minutos e
   * afogaria o console num de cinco segundos: seriam doze linhas por minuto, dezessete mil por dia,
   * e a linha que importa — "SPOT: chegou uma oferta" — se perderia no meio. Aqui só se escreve
   * quando há o que dizer.
   *
   * E NÃO ESCREVE PULSO PRÓPRIO. O pulso existe para dizer se um PROCESSO está vivo, e este ciclo
   * não é um processo: ele roda dentro do robô do portal, que já pulsa a cada cinco minutos pelo
   * ciclo do plano. Se aquele pulso está fresco, este laço está de pé — eram duas máquinas antes,
   * e é uma agora. Um pulso separado aqui diria a mesma coisa duas vezes, e um pulso que só se
   * escreve quando há oferta (elas são raras: de 3 a 21 por dia) nasceria velho e acusaria morte
   * onde há sossego.
   */
  (async function lacoDoSpot() {
    for (;;) {
      try {
        await cicloSpot();
      } catch (e) {
        // Sem barulho a cada falha: num laço de cinco segundos, uma oscilação de rede viraria
        // dezenas de linhas iguais. O ciclo seguinte tenta de novo, e a janela de 15 s cobre o furo.
        erro("spot falhou (tenta de novo):", String(e?.message ?? e).slice(0, 120));
      }
      await new Promise((r) => setTimeout(r, CONFIG.intervaloSpotMs));
    }
  })();

  log("ativo. Somente leitura: duas listagens, nenhum clique.");

  /**
   * O PLANO COMPLETO — a lista inteira, de cinco em cinco minutos.
   *
   * Continua existindo mesmo com o incremental, e por um motivo que o incremental não cobre:
   * `mtime` mostra o que MUDOU, e viagem RETIRADA do portal não muda — ela some. Quem percebe a
   * sumida é justamente quem relê a lista inteira e nota a ausência. Sem este ciclo, viagem
   * cancelada no portal ficaria viva no TMS para sempre, gritando alerta.
   */
  repetir("plano completo", CONFIG.intervaloPlanoMs, () =>
    ciclo("plan", "/api/line_haul/agency/trip/list", {
      query_type: 1,
      sta: `${agora() - CONFIG.planoDiasAtras * DIA},${agora() + CONFIG.planoDiasAdiante * DIA}`,
    }),
    "plan",
  );

  /**
   * O PLANO INCREMENTAL — o que mudou nos últimos segundos, de vinte em vinte.
   *
   * Mesmo endpoint, mesma entrega, mesmo `query_type`: para o TMS não há diferença nenhuma entre
   * uma página que veio daqui e uma que veio do completo. A única diferença é a pergunta feita ao
   * portal — e é ela que faz 1 página no lugar de 6.
   *
   * ELE NÃO ESCREVE O PULSO, e isso é deliberado. O pulso é gravado por modo de ENTREGA, e os dois
   * ciclos entregam como `plan` — dividiriam o mesmo relógio. Pior: num período sem mudança nenhuma
   * este ciclo não entrega nada (não há página), então a tela de Status veria "configurado 20 s,
   * sem notícia há três minutos" e acusaria sufoco onde só há sossego. O relógio do plano continua
   * sendo o do ciclo completo, que entrega sempre.
   */
  repetir("plano novo", CONFIG.intervaloPlanoNovoMs, () =>
    ciclo("plan", "/api/line_haul/agency/trip/list", {
      query_type: 1,
      sta: `${agora() - CONFIG.planoDiasAtras * DIA},${agora() + CONFIG.planoDiasAdiante * DIA}`,
      mtime: `${agora() - CONFIG.planoNovoJanelaSegundos},${agora()}`,
    }),
  );

  // A aba "Aceito": o que está na estrada agora. Mesmo endpoint do plano, outro `query_type`.
  //
  // Vai como `in_progress` desde a 1.5.0, e não mais como execução. Ia como execução por prudência —
  // "o robô nunca cria viagem" — e o preço apareceu na medição: 49 das 73 viagens em curso não
  // existiam no TMS. Foram aceitas antes de o robô começar a olhar o Planejado, então nunca passaram
  // por lá enquanto olhávamos, e o caminho de execução, por regra, não cria. Iam rodar e terminar
  // fora do sistema. Quem decide o que cada aba pode fazer é o TMS; aqui só se diz de onde veio.
  repetir("em curso", CONFIG.intervaloEmCursoMs, () =>
    ciclo("in_progress", "/api/line_haul/agency/trip/list", {
      query_type: 2,
      sta: `${agora() - CONFIG.emCursoDiasAtras * DIA},${agora() + CONFIG.emCursoDiasAdiante * DIA}`,
    }),
    "in_progress",
  );

  /**
   * A aba "Concluído", lida de dois jeitos (1.7.0).
   *
   * O ciclo NORMAL olha as últimas horas: são viagens que o TMS vinha acompanhando e acabaram de
   * terminar, e elas seguem o caminho de sempre — concluem e entram na fila de faturamento.
   *
   * A PRIMEIRA leitura depois que o script sobe é outra coisa: 30 dias de histórico, entregues como
   * `history`. O TMS começa em 06/08 e o portal tem viagem desde 18/07, então esse arranque é o que
   * traz o que faltava. Elas fecham como Concluída ou Cancelada e NÃO entram na fila do dinheiro —
   * já foram cobradas por fora, e item de faturamento duplicado não se desfaz com um clique.
   *
   * Quem decide isso tudo é o TMS. Aqui só se diz de onde veio e se é a varredura de arranque.
   */
  let primeiraExecucao = true;
  // O modo alterna entre `history` (primeiro ciclo) e `execution`, mas o RELÓGIO é um só — por isso
  // a chave do pulso é fixa, e não o modo que a entrega usou.
  repetir(
    "execução",
    CONFIG.intervaloExecucaoMs,
    () => {
      const arranque = primeiraExecucao;
      const horas = arranque ? CONFIG.execucaoHorasPrimeiroCiclo : CONFIG.execucaoHorasAtras;
      primeiraExecucao = false;
      return ciclo(arranque ? "history" : "execution", "/api/line_haul/agency/trip/history/list", {
        mtime: `${agora() - horas * 3600},${agora()}`,
      });
    },
    "execution",
  );
})();
