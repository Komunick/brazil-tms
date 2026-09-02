import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  dayRangeSaoPaulo,
  decisaoAindaVisivel,
  estadoDaOferta,
  podeMandarAceite,
  type DecisaoDaOferta,
  type EstadoDaOferta,
  type SpotOfferInput,
} from "@brazil-tms/shared";
import { db } from "../client";
import { spotOffers, trips } from "../../schema";

/**
 * A oferta de spot, gravada e lida (2026-08-18). Ver `schema/spot-offers.ts` para o porquê da tabela
 * separada e de os campos serem texto.
 */

export interface SpotOfferView {
  id: string;
  portalTripId: string;
  tripNumber: string | null;
  route: string;
  vehicle: string | null;
  price: string | null;
  originArrival: string | null;
  departure: string | null;
  arrival: string | null;
  operator: string | null;
  receivedAt: string;

  /**
   * EM QUE PÉ ESTÁ A DECISÃO — e ele é DERIVADO, nunca guardado (2026-09-01).
   *
   * Os cinco campos abaixo não existem em coluna nenhuma de `spot_offers`. Saem da viagem
   * (`Aceitação (portal)`) e da fila de ordens (`portal_commands`), que já guardavam tudo isto
   * antes desta fatia existir. Ver `spot-decisao.ts` para o porquê de não copiá-los.
   */
  estado: EstadoDaOferta;
  /**
   * A DECISÃO, enquanto a janela dos dez segundos está aberta (2026-09-02).
   *
   * Nula na esmagadora maioria das leituras — a oferta passa a vida esperando. Quando existe, o
   * cartão para de oferecer botão e passa a dizer QUEM decidiu, com uma contagem até sair.
   */
  decisao: DecisaoDaOferta | null;
  /** A viagem no TMS, quando ela existe. É o endereço da ordem de aceite. */
  tripId: string | null;
  /** Conveniência da tela para o botão poder DIZER por que está desligado. A autoridade é o servidor. */
  podeAceitar: boolean;
  /** Quem mandou a ordem que está em voo — para o cartão dizer por quem, sem uma segunda busca. */
  decidiuNome: string | null;
  /** O texto que o portal devolveu na recusa, cru. A tradução do que já vimos é da tela. */
  erroDoPortal: string | null;
}

/**
 * Grava a oferta, ou não faz nada se ela já é conhecida.
 *
 * `DO NOTHING` e não `DO UPDATE`: reenvio é sinal de que o monitor reiniciou e está recontando o que
 * ainda está em leilão, não de que a oferta mudou. Atualizar o `received_at` faria uma oferta de
 * ontem voltar a ser "recente" e reaparecer na TV.
 *
 * Devolve se era nova — é o que o monitor loga do lado dele.
 */
export async function recordSpotOffer(offer: SpotOfferInput): Promise<{ nova: boolean }> {
  const inserted = await db
    .insert(spotOffers)
    .values({
      portalTripId: offer.portalTripId,
      tripNumber: offer.tripNumber ?? null,
      route: offer.route,
      vehicle: offer.vehicle ?? null,
      price: offer.price ?? null,
      originArrival: offer.originArrival ?? null,
      departure: offer.departure ?? null,
      arrival: offer.arrival ?? null,
      operator: offer.operator ?? null,
      createdAtPortal: offer.createdAtPortal ?? null,
    })
    .onConflictDoNothing({ target: spotOffers.portalTripId })
    .returning({ id: spotOffers.id });
  return { nova: inserted.length > 0 };
}

/**
 * A LISTA DO DIA, e não uma janela de minutos (2026-08-18).
 *
 * Nasceu como "os últimos dez minutos", que era o suficiente quando o único destino era o aviso de
 * trinta segundos. Com o cartãozinho de histórico no painel, a pergunta virou outra: "o que passou
 * hoje?" — e uma janela de minutos apagaria a oferta das 8h antes do café.
 *
 * Uma lista só serve aos dois: o aviso decide o que anunciar pela MEMÓRIA da tela (ver
 * `novasOfertas`), não pelo tamanho da janela. Duas consultas com recortes diferentes seriam duas
 * verdades sobre a mesma coisa.
 *
 * ── O ESTADO DA DECISÃO ENTRA AQUI, E NÃO NUMA CONSULTA PRÓPRIA (2026-09-01) ──────────────────
 *
 * O cartão precisa saber, por oferta, se dá para aceitar e em que pé a decisão está. Tudo isso já
 * está gravado — na viagem e na fila de ordens —, e é buscado no MESMO ida-e-volta que já existia.
 *
 * Uma segunda consulta seria duas leituras do mesmo assunto com dois ritmos, e o comentário da rota
 * `/api/spot-offers` já explica por que ela nasceu justamente para evitar isso.
 *
 * O CUSTO IMPORTA E FOI MEDIDO: esta consulta roda de 5 em 5 segundos, com a aba escondida, em toda
 * tela aberta do TMS. O `left join` para `trips` custou 2,5 ms contra a produção em 01/09, e o teto
 * de 30 linhas continua valendo — as subconsultas são por linha, sobre índice, e o volume real é de
 * 5 a 10 ofertas por dia.
 *
 * O VÍNCULO É PELO NÚMERO DA LH (`trip_number` = `external_trip_id`), e não pelo id do portal:
 * `trips` não tem coluna de id do portal — ele mora em `customer_fields`, que não é indexável de
 * forma barata. Medido: casa em 98 de 132 ofertas; as outras 34 nunca viraram viagem, e para elas o
 * estado é `sem_viagem`.
 */
export async function readSpotOffersToday(agora = new Date()): Promise<SpotOfferView[]> {
  const { from, to } = dayRangeSaoPaulo(agora);

  /*
    A OFERTA IGNORADA SAI PARA TODOS — e por isso esta consulta não pergunta QUEM está olhando.

    Ela recebia um `userId` e escondia só o que aquela pessoa tinha dispensado (2026-09-01). Com a
    decisão valendo para a equipe, a pergunta virou outra e mais simples: alguém já decidiu sobre
    esta oferta?

    E em 2026-09-02 ela deixou de ser um SIM/NÃO. Era um `exists`, e a oferta sumia no instante do
    clique; agora a leitura precisa do INSTANTE e de QUEM, porque a decisão fica dez segundos na
    tela de todos antes de a oferta sair. Ver `JANELA_DA_DECISAO_MS`.
  */
  const dispensadaEm = sql<string | null>`(
    select d.dispensada_em from spot_offer_dispensas d where d.spot_offer_id = ${spotOffers.id}
  )`;

  const dispensouNome = sql<string | null>`(
    select u.name from spot_offer_dispensas d join users u on u.id = d.user_id
     where d.spot_offer_id = ${spotOffers.id}
  )`;

  const dispensaMotivo = sql<string | null>`(
    select d.motivo from spot_offer_dispensas d where d.spot_offer_id = ${spotOffers.id}
  )`;

  /*
    QUANDO O ACEITE FOI CONFIRMADO PELO PORTAL — e por que só o daqui tem hora.

    `settled_at` da última ordem concluída. Ele existe quando o aceite saiu DESTE sistema; a viagem
    aceita direto no portal chega ao TMS pela leitura do plano, sem instante de clique e sem a quem
    creditar. Nesse caso a oferta sai na hora, como sempre saiu — não há aviso a dar.

    Medido em 01/09: das 19 ofertas de dois dias, quase todas foram aceitas direto no portal. Ou
    seja, o aviso de aceite vale sobretudo para o aceite feito PELO CARTÃO, que é exatamente o gesto
    que esta fatia criou.
  */
  const aceiteEm = sql<string | null>`(
    select pc.settled_at from portal_commands pc
     where pc.trip_id = ${trips.id} and pc.action = 'accept' and pc.status = 'done'
     order by pc.settled_at desc limit 1
  )`;

  /*
    "Há ordem de aceite em voo?" — `pending` é gravada e esperando o robô; `sent` é o robô
    executando. As duas seguram o cartão no estado "enviado", e nas duas uma segunda ordem é
    impossível (índice parcial de `portal_commands`).
  */
  const ordemAberta = sql<boolean>`exists (
    select 1 from portal_commands pc
     where pc.trip_id = ${trips.id} and pc.action = 'accept'
       and pc.status in ('pending', 'sent')
  )`;

  /*
    A ÚLTIMA ordem de aceite, e só ela. Uma viagem pode ter várias tentativas (medido: a
    LT0Q8S02EKYI1 teve três), e o que a tela precisa dizer é o desfecho da mais recente — as
    anteriores são história, e história dessa viagem já está em `portal_commands`.
  */
  const ultimoStatus = sql<string | null>`(
    select pc.status from portal_commands pc
     where pc.trip_id = ${trips.id} and pc.action = 'accept'
     order by pc.requested_at desc limit 1
  )`;

  const ultimoErro = sql<string | null>`(
    select pc.last_error from portal_commands pc
     where pc.trip_id = ${trips.id} and pc.action = 'accept'
     order by pc.requested_at desc limit 1
  )`;

  const decidiuNome = sql<string | null>`(
    select u.name from portal_commands pc join users u on u.id = pc.requested_by
     where pc.trip_id = ${trips.id} and pc.action = 'accept'
     order by pc.requested_at desc limit 1
  )`;

  const rows = await db
    .select({
      oferta: spotOffers,
      tripId: trips.id,
      // O campo do portal chega com acento e espaço no nome; é assim que o robô o grava.
      aceitacaoDoPortal: sql<string | null>`${trips.customerFields}->>'Aceitação (portal)'`,
      ordemAberta,
      ultimoStatus,
      ultimoErro,
      decidiuNome,
      dispensadaEm,
      dispensouNome,
      dispensaMotivo,
      aceiteEm,
    })
    .from(spotOffers)
    .leftJoin(trips, eq(trips.externalTripId, spotOffers.tripNumber))
    .where(and(gte(spotOffers.receivedAt, new Date(from)), lt(spotOffers.receivedAt, new Date(to))))
    .orderBy(desc(spotOffers.receivedAt))
    // Teto de sanidade: num dia de pico o leilão abre dezenas, e a tela mostra as primeiras.
    .limit(30);

  /**
   * O QUE SAI DA LISTA, E POR QUE SAI ANTES DE CHEGAR À TELA.
   *
   * Eram dois `filter` sobre assuntos diferentes: o `aceito` sumia na hora e a dispensa sumia na
   * hora (2026-09-01). Em 2026-09-02 os dois viraram a MESMA pergunta, feita em `paraView`: a
   * decisão ainda está dentro dos dez segundos? Enquanto estiver, a oferta continua vindo, marcada
   * com quem decidiu; passados eles, a leitura para de trazê-la e o cartão sai de todas as telas.
   *
   * O FR-014 CONTINUA PROVADO POR CONSTRUÇÃO. A tela não ganhou caminho de código que remova cartão
   * por decisão — ela desenha o que a leitura traz. Mudou o QUANDO o servidor para de trazer, não o
   * QUEM decide isso. É por aqui que a oferta sai da tela de todas as pessoas de uma vez.
   *
   * O corte é feito DEPOIS do teto de 30 de propósito: o teto é do dia, não da decisão. Filtrar
   * antes faria um dia com muitas ofertas ignoradas puxar ofertas mais antigas para dentro da
   * janela — e duas pessoas veriam recortes diferentes do mesmo dia.
   */
  return rows.map((r) => paraView(r, agora)).filter((v): v is SpotOfferView => v !== null);
}

/**
 * A oferta ainda tem lugar na tela? — e é AQUI que ela sai, nunca no cliente (2026-09-02).
 *
 * Antes eram dois `filter` sobre coisas diferentes: a dispensa sumia na hora, e o `aceito` sumia na
 * hora. Agora as duas passam pela mesma pergunta — "a decisão ainda está dentro dos dez segundos?"
 * —, e é essa unificação que faz o aviso existir sem um segundo caminho de código.
 *
 * `null` significa "não mande para a tela". A tela continua sem qualquer ramo que remova cartão: ela
 * desenha o que a leitura traz, e some o que a leitura parou de trazer.
 */
function decisaoDaLinha(r: LinhaDaOferta, estado: EstadoDaOferta): DecisaoDaOferta | null {
  if (r.dispensadaEm) {
    return { tipo: "ignorado", porNome: r.dispensouNome, motivo: r.dispensaMotivo };
  }
  return estado === "aceito" ? { tipo: "aceito", porNome: r.decidiuNome, motivo: null } : null;
}

type LinhaDaOferta = {
  oferta: typeof spotOffers.$inferSelect;
  tripId: string | null;
  aceitacaoDoPortal: string | null;
  ordemAberta: boolean;
  ultimoStatus: string | null;
  ultimoErro: string | null;
  decidiuNome: string | null;
  dispensadaEm: string | null;
  dispensouNome: string | null;
  dispensaMotivo: string | null;
  aceiteEm: string | null;
};

function paraView(r: LinhaDaOferta, agora: Date): SpotOfferView | null {
  const situacao = {
    tripId: r.tripId,
    aceitacaoDoPortal: r.aceitacaoDoPortal,
    ordemAberta: Boolean(r.ordemAberta),
    ultimaFalhou: r.ultimoStatus === "failed",
  };
  const estado = estadoDaOferta(situacao);
  const decisao = decisaoDaLinha(r, estado);

  /*
    DECIDIDA, MAS AINDA VISÍVEL? — o único lugar que tira a oferta da tela.

    O instante da decisão é o da dispensa, ou o `settled_at` do aceite. Passados os dez segundos, a
    leitura para de trazer a oferta e o cartão sai de todas as telas de uma vez.
  */
  if (decisao) {
    const quando = decisao.tipo === "ignorado" ? r.dispensadaEm : r.aceiteEm;
    if (!decisaoAindaVisivel(quando ? new Date(quando) : null, agora)) return null;
  }

  return {
    id: r.oferta.id,
    portalTripId: r.oferta.portalTripId,
    tripNumber: r.oferta.tripNumber,
    route: r.oferta.route,
    vehicle: r.oferta.vehicle,
    price: r.oferta.price,
    originArrival: r.oferta.originArrival,
    departure: r.oferta.departure,
    arrival: r.oferta.arrival,
    operator: r.oferta.operator,
    receivedAt: r.oferta.receivedAt.toISOString(),

    estado,
    tripId: r.tripId,
    podeAceitar: podeMandarAceite(situacao),
    // Quem decidiu só interessa enquanto a ordem está em voo; depois dela, a informação é a recusa.
    decidiuNome: estado === "enviado" ? r.decidiuNome : null,
    erroDoPortal: estado === "recusado" ? r.ultimoErro : null,
    decisao,
  };
}
