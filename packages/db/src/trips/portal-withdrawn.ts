import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { ACTIVE_TRIP_STATUSES, type TripQueue } from "@brazil-tms/shared";
import { db } from "../client";
import { alerts, importRows, tripEvents, trips } from "../../schema";
import { writeAudit } from "../audit/write-audit";

/**
 * A viagem que o cliente RETIROU (2026-08-18).
 *
 * O portal não avisa quando desiste de uma proposta: ela some do Planejado e pronto. Do lado de cá a
 * viagem seguia viva para sempre — cobrando atribuição, alertando, entrando na contagem do dia. Foram
 * duas limpezas manuais em uma noite (60 viagens, depois mais 14) antes de ficar claro que isto não é
 * um resíduo histórico: é o funcionamento normal do portal, e vai acontecer todo dia.
 *
 * A regra é ausência: a viagem tem carimbo de já ter sido vista, o robô continua varrendo a janela
 * onde ela está, e mesmo assim ela não aparece há horas. Isso é o cliente tendo tirado.
 *
 * ── APAGA, E A DISTINÇÃO É O CANCELADA ─────────────────────────────────────────────────────────
 *
 * A regra veio do usuário e é exata: viagem que o portal mostra CANCELADA fica — é história real, e
 * "por que essa não rodou?" é pergunta legítima. Some só a que NÃO EXISTE no portal, e essa nunca
 * chegou a ser uma viagem: foi uma proposta retirada antes de qualquer coisa acontecer.
 *
 * A distinção se sustenta sozinha, sem precisar de um teste de "está cancelada lá?": a viagem que o
 * portal cancela chega aqui como `cancelled`, e esta varredura só olha `received`. Uma cancelada é
 * inalcançável por construção, não por cuidado.
 *
 * Cancelar em vez de apagar foi o desenho anterior e resolveria a poluição — 641 canceladas geram
 * zero avisos, medido. Mas jogaria os fantasmas no MESMO balde das cancelações de verdade, e o
 * número de "Cancelada" do painel deixaria de dizer alguma coisa: hoje são 637 reais contra 4
 * fantasmas, e com a varredura diária a proporção se inverteria.
 *
 * O que resta como registro é a auditoria: `trip.purge_withdrawn` não tem chave estrangeira para a
 * viagem e sobrevive a ela, com o número da LH, o cliente e há quantas horas sumira.
 *
 * ── AS CINCO TRAVAS ────────────────────────────────────────────────────────────────────────────
 *
 *   SÓ QUEM JÁ FOI VISTA. `portalLastSeenAt` nulo é "nunca apareceu numa listagem" — viagem digitada
 *   à mão, importação de planilha. Ausência não significa nada para quem nunca esteve lá.
 *
 *   SÓ "RECEBIDA". Uma viagem despachada tem motorista e caminhão envolvidos; se sumiu do portal
 *   estando em curso, isso é uma conversa entre pessoas, não uma remoção automática. É também esta
 *   trava que torna a cancelada intocável.
 *
 *   SÓ DENTRO DA JANELA VARRIDA. O robô olha de 15 dias atrás a 7 à frente. Fora disso ele não passa,
 *   e a ausência só diz que ninguém olhou — nunca que o cliente retirou.
 *
 *   SÓ COM O ROBÔ ALIMENTANDO. Ver `feedEstaFresco`: se ele parou, ausência não prova nada sobre
 *   viagem nenhuma. É a trava do dia ruim, e é ela — não a contagem — que protege contra a página
 *   vazia por erro de rede.
 *
 *   SÓ SEM TRAÇO OPERACIONAL. Nada de atribuição, documento, item de fatura, exceção — nem ORDEM DE
 *   PORTAL. Nenhuma candidata deveria ter, e é justamente por isso que se verifica.
 *
 * ── A SEXTA TRAVA, E POR QUE ELA DESMENTE O PARÁGRAFO ACIMA (2026-08-28) ───────────────────────
 *
 * "Nunca chegou a ser uma viagem: foi uma proposta retirada antes de qualquer coisa acontecer" vale
 * enquanto ninguém tiver apertado Aceitar. Se apertou, aconteceu: há compromisso com o cliente, e
 * some do portal por motivo NOSSO — a aba do Aceito era lida com 7 dias à frente contra os 30 do
 * Planejado, e carga aceita para além de uma semana caía no vão entre as duas listas.
 *
 * Por isso a ordem de portal entrou na lista de traços. Até 28/08 quem impedia era a chave
 * estrangeira, derrubando a varredura inteira com `23503` a cada meia hora — proteção por acidente,
 * que levava junto as remoções legítimas. Ver o comentário na consulta.
 */

/**
 * As TRÊS filas do que era "Recebida", cada uma como um predicado (2026-08-18).
 *
 * Ficam juntas de propósito: são a mesma pergunta em posições diferentes do ciclo, e escrever uma
 * sem olhar as outras é exatamente como elas passam a se sobrepor ou a deixar buraco. Juntas cobrem
 * `received` inteiro — a soma das três é o total, e há teste contra o banco provando isso.
 *
 * A ordem importa e é a do ciclo de vida: `awaiting_arrival` é testada ANTES da aceitação, porque
 * toda viagem `Assigned` também está `Accepted`. Invertido, ela cairia em "p/atribuir" e mandaria a
 * operação fazer um trabalho que o cliente já fez.
 */
export function tripQueueSql(queue: TripQueue): SQL<boolean> {
  const aceitacao = sql`(${trips.customerFields} ->> 'Aceitação (portal)')`;
  const statusPortal = sql`(${trips.customerFields} ->> 'Status (portal)')`;
  if (queue === "awaiting_arrival") {
    return sql<boolean>`(${statusPortal} = 'Assigned')`;
  }
  if (queue === "in_analysis") {
    return sql<boolean>`(${statusPortal} IS DISTINCT FROM 'Assigned' AND ${aceitacao} = 'Pending')`;
  }
  // `to_assign` é o resto, e é escrito como resto MESMO: `IS DISTINCT FROM` em vez de `NOT (… = …)`
  // porque viagem sem aceitação gravada tem de cair aqui — é o que `displayStatusOf` faz. Com `NOT`,
  // o nulo devolve nulo e ela sumiria da lista, divergindo calada da regra em TypeScript.
  return sql<boolean>`(${statusPortal} IS DISTINCT FROM 'Assigned' AND ${aceitacao} IS DISTINCT FROM 'Pending')`;
}

/** Marca as viagens desta página como VISTAS agora. Uma instrução por página, não uma por viagem. */
export async function marcarVistasNoPortal(
  customerId: string,
  externalTripIds: string[],
): Promise<number> {
  const ids = [...new Set(externalTripIds.filter((v) => v && v.trim() !== ""))];
  if (ids.length === 0) return 0;
  // Sem tocar em `updatedAt`: ser vista de novo não é uma mudança na viagem, e mexer nele
  // remexeria a ordenação e o "mudou alguma coisa?" de todo mundo a cada quinze minutos.
  await db
    .update(trips)
    .set({ portalLastSeenAt: new Date() })
    .where(and(eq(trips.customerId, customerId), inArray(trips.externalTripId, ids)));
  return ids.length;
}

export interface RetiradasResumo {
  /** Quantas se enquadram na regra. */
  candidatas: number;
  /** Quantas foram efetivamente apagadas. */
  removidas: number;
  /** Verdadeiro quando o robô não está alimentando — nada é cancelado. Ver `feedEstaFresco`. */
  barradoPeloFeed: boolean;
  /** Verdadeiro quando havia mais candidatas que o teto — o resto fica para a varredura seguinte. */
  limitadoPeloTeto: boolean;
  externalTripIds: string[];
}

/**
 * O TETO ERA A TRAVA ERRADA (corrigido em 2026-08-18, no mesmo dia em que nasceu).
 *
 * A ideia era boa e a consequência não: com uma pilha acumulada acima dele, a varredura passava a não
 * fazer NADA — para sempre, e inclusive para as retiradas novas. Medido: 62 candidatas, todas
 * conferidas uma a uma no portal e nenhuma lá, e o TMS travado de meia em meia hora com 253 avisos
 * ativos que ninguém podia resolver. A trava virou o problema que ela existia para evitar.
 *
 * O erro foi usar a QUANTIDADE como sinal. Muitas candidatas não distingue "o cliente retirou muita
 * coisa" de "o robô morreu" — e são situações opostas. O que distingue é olhar o ROBÔ: se ele está
 * alimentando agora, a ausência de uma viagem é informação; se ele parou, ausência não diz nada sobre
 * viagem nenhuma, tenha ela uma ou mil.
 *
 * Ver `feedEstaFresco`. O teto continua existindo, alto, com outra função: limitar o TRABALHO de uma
 * varredura, não julgar se ela deve acontecer.
 */
export const TETO = 200;

/** Quantas viagens o robô precisa ter carimbado na última hora para a ausência valer como prova. */
export const MINIMO_VISTAS_NA_HORA = 50;

/**
 * O robô está alimentando AGORA?
 *
 * É a pergunta que a contagem de candidatas tentava responder e não respondia. Um ciclo do plano
 * carimba centenas de viagens de uma vez (496 numa medição), então "menos de cinquenta na última
 * hora" é robô parado, aba fechada ou sessão do portal caída — e nesse estado nenhuma ausência
 * significa coisa alguma.
 */
export async function feedEstaFresco(minimo = MINIMO_VISTAS_NA_HORA): Promise<boolean> {
  const r = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trips)
    .where(sql`${trips.portalLastSeenAt} > now() - interval '1 hour'`);
  return (r[0]?.n ?? 0) >= minimo;
}

/** Horas sem aparecer em NENHUMA listagem até a ausência valer como retirada. */
export const SILENCIO_HORAS = 3;

export async function marcarRetiradasDoPortal(
  actorUserId: string,
  opcoes: {
    diasAtras?: number;
    diasAdiante?: number;
    silencioHoras?: number;
    teto?: number;
    minimoVistas?: number;
  } = {},
): Promise<RetiradasResumo> {
  // A janela do robô, espelhada aqui. Se ela mudar lá, muda aqui — e é por isso que são parâmetros.
  const diasAtras = opcoes.diasAtras ?? 15;
  const diasAdiante = opcoes.diasAdiante ?? 7;
  const silencioHoras = opcoes.silencioHoras ?? SILENCIO_HORAS;
  const teto = opcoes.teto ?? TETO;
  // Injetável para o teste poder exercer os DOIS lados do guarda de frescor. Um banco de teste tem
  // meia dúzia de viagens; com o mínimo de produção fixo, todo caso cairia no "robô parado" e o
  // teste do caminho normal viraria uma tautologia verde que não prova nada.
  const minimoVistas = opcoes.minimoVistas ?? MINIMO_VISTAS_NA_HORA;

  const candidatas = await db
    .select({ id: trips.id, externalTripId: trips.externalTripId })
    .from(trips)
    .where(
      and(
        eq(trips.currentStatus, "received"),
        /**
         * "VEIO DO PORTAL", e não "tem carimbo" (corrigido em 2026-08-18, horas depois de nascer).
         *
         * A trava era `portal_last_seen_at IS NOT NULL`, lendo carimbo nulo como "nunca esteve no
         * portal — viagem digitada à mão". A intenção continua certa e é intocada; o proxy é que
         * estava errado, porque havia um jeito de uma viagem do portal ficar sem carimbo: ela nasce
         * durante a leitura, e o carimbo (um UPDATE) só alcançava quem já existia. A ordem foi
         * consertada em `applyPortalPlan`, mas quem já nasceu torto não tem como se consertar — a
         * viagem retirada nunca mais aparece numa listagem para ser carimbada.
         *
         * Então a pergunta passa a ser a original: esta viagem veio do portal? Só o robô escreve
         * `Status (portal)` em `customer_fields`, e é isso que separa a viagem do portal da digitada
         * à mão — que continua, e agora de verdade, fora do alcance desta varredura.
         *
         * `created_at` como piso é honesto: a viagem foi vista ao menos uma vez, no instante em que
         * o robô a criou a partir de uma listagem.
         */
        sql`${trips.customerFields} ? 'Status (portal)'`,
        sql`coalesce(${trips.portalLastSeenAt}, ${trips.createdAt}) < now() - ${`${silencioHoras} hours`}::interval`,
        sql`${trips.plannedPickupWindowStart} >= now() - ${`${diasAtras} days`}::interval`,
        sql`${trips.plannedPickupWindowStart} <= now() + ${`${diasAdiante} days`}::interval`,
        // Redundante com `received`, e de propósito: se um dia alguém alargar o status acima, a
        // varredura continua incapaz de tocar numa viagem encerrada.
        inArray(trips.currentStatus, [...ACTIVE_TRIP_STATUSES]),
      ),
    );

  const externalTripIds = candidatas.map((c) => c.externalTripId ?? "(sem id)");
  const base = { candidatas: candidatas.length, externalTripIds };
  if (candidatas.length === 0) {
    return { ...base, removidas: 0, barradoPeloFeed: false, limitadoPeloTeto: false };
  }

  /**
   * A TRAVA: o robô está alimentando agora?
   *
   * Esta é a pergunta certa, e ela é feita DEPOIS de ter candidatas para não custar uma consulta em
   * toda varredura vazia. Robô parado, aba fechada, sessão do portal caída — em qualquer um desses
   * estados a ausência de uma viagem na listagem não prova nada sobre ela, e remover seria destruir
   * a operação com a aparência de trabalho.
   */
  if (!(await feedEstaFresco(minimoVistas))) {
    return { ...base, removidas: 0, barradoPeloFeed: true, limitadoPeloTeto: false };
  }

  // O teto agora limita o TRABALHO, não julga se ele deve acontecer: o excedente fica para a
  // varredura seguinte, meia hora depois. Uma pilha grande drena em alguns ciclos em vez de travar
  // o mecanismo para sempre — que foi o que aconteceu com 62 candidatas e teto de 30.
  const aRemover = candidatas.slice(0, teto);
  const ids = aRemover.map((c) => c.id);

  /**
   * APAGA, e não cancela (decisão do usuário, 2026-08-18).
   *
   * A regra que ele deu é precisa e é a que este arquivo segue: viagem que o portal mostra como
   * CANCELADA fica — é história real, e "por que essa não rodou?" é pergunta legítima. Some só a que
   * NÃO EXISTE no portal, e essa nunca foi uma viagem: foi uma proposta que o cliente retirou antes
   * de qualquer coisa acontecer.
   *
   * E há um motivo técnico que empurra na mesma direção. Cancelar já resolveria a poluição — 641
   * canceladas geram zero avisos, medido. Mas jogaria os fantasmas no MESMO balde das cancelações de
   * verdade, e aí o número de "Cancelada" do painel deixaria de significar alguma coisa: hoje ele é
   * 637 reais contra 4 fantasmas, e com a varredura rodando todo dia a proporção se inverteria.
   * Uma viagem que o portal nunca teve não é uma viagem cancelada.
   *
   * O que protege é a ordem das travas, não o ato: só `received`, só com carimbo de já ter sido
   * vista, só dentro da janela varrida, só com o robô alimentando agora, e só quem não tem NENHUM
   * traço operacional. O número de cada remoção sai no log — é o registro que sobra de algo que,
   * por definição, não deveria existir.
   */
  const semTraco = await db
    .select({
      id: trips.id,
      externalTripId: trips.externalTripId,
      customerId: trips.customerId,
      vistaEm: trips.portalLastSeenAt,
    })
    .from(trips)
    .where(
      and(
        inArray(trips.id, ids),
        // A quinta trava, e a mais concreta: qualquer traço operacional veta a remoção. Nenhuma
        // candidata deveria ter algum — atribuição, documento, item de fatura e exceção só existem
        // depois de `received` —, mas "não deveria" não é garantia, e o que está sendo feito aqui
        // não tem volta. Uma linha aqui é um sinal de que a regra acima entendeu algo errado.
        sql`NOT EXISTS (SELECT 1 FROM trip_assignments a WHERE a.trip_id = ${trips.id})`,
        sql`NOT EXISTS (SELECT 1 FROM billing_items b WHERE b.trip_id = ${trips.id})`,
        sql`NOT EXISTS (SELECT 1 FROM documents d WHERE d.trip_id = ${trips.id})`,
        sql`NOT EXISTS (SELECT 1 FROM exceptions x WHERE x.trip_id = ${trips.id})`,
        /**
         * A ORDEM DE PORTAL É TRAÇO OPERACIONAL, e faltava (2026-08-28, incidente medido).
         *
         * A premissa do bloco lá em cima — "essa nunca chegou a ser uma viagem: foi uma proposta
         * retirada antes de qualquer coisa acontecer" — é FALSA quando alguém já apertou Aceitar.
         * Aceitar é compromisso com o cliente, e some do portal por motivo nosso: até 28/08 a aba
         * do Aceito era lida com 7 dias à frente contra os 30 do Planejado, então toda carga aceita
         * com mais de uma semana de antecedência deixava de ser vista e virava candidata aqui.
         *
         * ── O QUE IMPEDIA ATÉ HOJE ERA UM ACIDENTE ────────────────────────────────────────────
         *
         * A chave estrangeira `portal_commands_trip_id_fkey`. Ela barrava o DELETE e a varredura
         * inteira morria com `23503` — de meia em meia hora, desde as 16:00 do dia 28. Isso é
         * proteção por efeito colateral: funciona, mas derruba junto as remoções legítimas, e o
         * conserto "óbvio" (apagar em cascata) transformaria a trava em perda silenciosa de viagem
         * aceita. Escrito como regra, o DELETE nunca é tentado e a varredura volta a rodar.
         *
         * Medido: `LT0Q8V02F17J1` e `LT0Q9502F19L1`, ambas aceitas em 28/08 e sobreviventes só
         * porque a chave estrangeira as segurou. A `LT1Q8S02F13N1`, que veio do spot e não chegou
         * a ter ordem, foi apagada às 10:00 — 3,3 horas depois de nascer.
         */
        sql`NOT EXISTS (SELECT 1 FROM portal_commands p WHERE p.trip_id = ${trips.id})`,
      ),
    );

  if (semTraco.length === 0) {
    return { ...base, removidas: 0, barradoPeloFeed: false, limitadoPeloTeto: false };
  }

  const removiveis = semTraco.map((r) => r.id);
  const agora = Date.now();

  await db.transaction(async (tx) => {
    /**
     * A AUDITORIA VEM PRIMEIRO, e ela NÃO é apagada.
     *
     * `audit_logs` é a única tabela que aponta para a viagem sem chave estrangeira (`entity_id` é
     * polimórfico) e a única marcada como append-only no banco. As duas coisas convergem no que se
     * quer aqui: a linha da viagem some, o registro de que ela existiu e de por que sumiu fica.
     * Escrita antes do `DELETE` e na MESMA transação — se a remoção falhar, o registro cai junto e
     * não sobra auditoria de uma remoção que não houve.
     */
    for (const t of semTraco) {
      await writeAudit(tx, {
        entityType: "trip",
        entityId: t.id,
        action: "trip.purge_withdrawn",
        previousValue: null,
        newValue: {
          externalTripId: t.externalTripId,
          customerId: t.customerId,
          portalLastSeenAt: t.vistaEm?.toISOString() ?? null,
          horasSemAparecer: t.vistaEm
            ? Math.round(((agora - t.vistaEm.getTime()) / 3_600_000) * 10) / 10
            : null,
        },
        actorUserId,
        reason: `retirada do portal (${silencioHoras}h sem aparecer em nenhuma listagem)`,
      });
    }

    // `import_rows.target_trip_id` é ANULÁVEL e tem chave estrangeira: sem isto o `DELETE` abaixo
    // falha com violação de FK, e a varredura inteira volta a não fazer nada — desta vez em silêncio,
    // porque o erro sairia idêntico a cada meia hora. A linha da importação continua lá, apontando
    // para nada, que é a verdade: a viagem que ela criou foi retirada.
    await tx
      .update(importRows)
      .set({ targetTripId: null })
      .where(inArray(importRows.targetTripId, removiveis));

    // Alertas e eventos têm FK e morrem com a viagem. Eventos de uma proposta retirada são o que se
    // esperaria: a criação, e nada mais.
    await tx.delete(alerts).where(inArray(alerts.tripId, removiveis));
    await tx.delete(tripEvents).where(inArray(tripEvents.tripId, removiveis));
    await tx.delete(trips).where(inArray(trips.id, removiveis));
  });

  return {
    candidatas: candidatas.length,
    // O resumo lista o que FOI removido, não o que se cogitou remover: é este número que vai para o
    // log do worker, e é por ele que alguém procura uma LH que sumiu do quadro.
    externalTripIds: semTraco.map((t) => t.externalTripId ?? "(sem id)"),
    removidas: removiveis.length,
    barradoPeloFeed: false,
    limitadoPeloTeto: candidatas.length > teto,
  };
}
