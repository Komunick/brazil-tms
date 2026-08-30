import { and, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { userWatchedTrips } from "../../schema";

/**
 * MINHA PROGRAMAÇÃO — a lista pessoal, com o que é preciso para agir sobre ela (2026-08-23).
 *
 * A linha traz o que a pessoa procura quando abre a lista: qual LH, para onde vai, quando é a
 * coleta, em que pé está, QUEM está dirigindo, com que placa e QUAL O TELEFONE.
 *
 * ── O TELEFONE VEM DO NOSSO CADASTRO, CASADO PELO NOME ─────────────────────────────────────────
 *
 * O portal manda o nome do motorista e o id DELE, não o nosso; o telefone está no cadastro de
 * motoristas do TMS. A única chave que os dois lados compartilham é o nome, e casar por nome é
 * frágil por natureza — um acento fora do lugar já custou três motoristas que existiam e o sistema
 * jurava não existirem.
 *
 * Medido antes de escrever (2026-08-23): das 110 viagens ativas com motorista, 107 casam com o
 * cadastro e 97 têm telefone. Onde não casa, a tela mostra o nome e diz que não tem contato — em
 * vez de esconder a viagem ou inventar um número.
 *
 * `upper(trim(...))` dos dois lados porque o portal manda em caixa alta e o cadastro não.
 *
 * ── A PLACA VEM DO PORTAL, NÃO DA NOSSA ATRIBUIÇÃO ─────────────────────────────────────────────
 *
 * É o que o CLIENTE enxerga, e é o que o motorista vai apresentar na estação. A atribuição do TMS
 * pode divergir — e quando diverge, quem manda na portaria é a do portal.
 */
export interface ViagemAcompanhada {
  tripId: string;
  externalTripId: string | null;
  origem: string | null;
  destino: string | null;
  /** O STA: a hora em que o motorista tem de estar na origem. */
  coleta: string | null;
  status: string;
  acceptanceStatus: string | null;
  portalStatus: string | null;
  motorista: string | null;
  placa: string | null;
  /** Telefone do cadastro, quando o nome casa. `null` = não achamos, e a tela diz isso. */
  telefone: string | null;
}

export async function readMinhaProgramacao(userId: string): Promise<ViagemAcompanhada[]> {
  const linhas = await db.execute<{
    trip_id: string;
    external_trip_id: string | null;
    origem: string | null;
    destino: string | null;
    coleta: string | null;
    status: string;
    aceitacao: string | null;
    status_portal: string | null;
    motorista: string | null;
    placa: string | null;
    telefone: string | null;
  }>(sql`
    select
      t.id as trip_id,
      t.external_trip_id,
      lo.name as origem,
      ld.name as destino,
      to_char(t.planned_pickup_window_start at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as coleta,
      t.current_status::text as status,
      t.customer_fields ->> 'Aceitação (portal)' as aceitacao,
      t.customer_fields ->> 'Status (portal)' as status_portal,
      t.customer_fields ->> 'Motorista (portal)' as motorista,
      t.customer_fields ->> 'Placa (portal)' as placa,
      (
        select d.phone from drivers d
        where upper(trim(d.name)) = upper(trim(t.customer_fields ->> 'Motorista (portal)'))
          and d.phone is not null and d.archived_at is null
        limit 1
      ) as telefone
    from ${userWatchedTrips} w
    join trips t on t.id = w.trip_id
    left join locations lo on lo.id = t.origin_location_id
    left join locations ld on ld.id = t.destination_location_id
    where w.user_id = ${userId}
    order by w.created_at
  `);

  return linhas.map((r) => ({
    tripId: r.trip_id,
    externalTripId: r.external_trip_id,
    origem: r.origem,
    destino: r.destino,
    coleta: r.coleta,
    status: r.status,
    acceptanceStatus: r.aceitacao,
    portalStatus: r.status_portal,
    motorista: r.motorista,
    placa: r.placa,
    telefone: r.telefone,
  }));
}

/** Entrar na lista é idempotente: clicar duas vezes não duplica nem dá erro na cara de ninguém. */
/**
 * O QUADRO DA PROGRAMAÇÃO — o que substitui a planilha (2026-08-24, a pedido).
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────────────────────
 *
 * A operação programa numa planilha do Google com 12.317 linhas — uma por LH, colorida à mão, com
 * motorista, cavalo, carreta, CPF e telefone repetidos ao lado de cada viagem. Tudo isso o TMS já
 * sabe: o que faltava era mostrar do jeito que se trabalha, que é POR DIA e com o dia de ontem
 * ainda à vista.
 *
 * ── ONTEM ENTRA, E É O PONTO MAIS FÁCIL DE ERRAR ──────────────────────────────────────────────
 *
 * Uma programação que começa em "hoje" perde a viagem que saiu ontem à noite e ainda está na
 * estrada — que é justamente a que alguém precisa acompanhar de manhã. A janela vai de ontem em
 * diante, e cada linha diz a que dia pertence.
 *
 * ── O DIA É O DA COLETA, EM SÃO PAULO ─────────────────────────────────────────────────────────
 *
 * `planned_pickup_window_start` convertido para o fuso da empresa ANTES de virar data. Sem a
 * conversão, tudo o que sai depois das 21h cairia no dia seguinte — e a programação da noite, que é
 * quando a operação mais roda, apareceria no dia errado.
 *
 * ── AS DUAS HORAS DA COLETA SÃO AS DUAS COLUNAS DA PLANILHA ───────────────────────────────────
 *
 * "ETA ORIGEM" e "CPT ORIGEM" são o início e o fim da janela de coleta, que o TMS já guarda
 * separados. Conferido contra a planilha: 04:00/06:00, 10:00/11:01, 11:00/13:00.
 *
 * ── MOTORISTA E PLACA: O PORTAL MANDA, A ATRIBUIÇÃO COMPLETA ──────────────────────────────────
 *
 * A planilha mostra o que a portaria vai conferir, e isso é o que o CLIENTE enxerga — por isso o
 * nome e a placa saem de `customer_fields`. CPF e telefone não existem lá: vêm do nosso cadastro,
 * casados pelo nome, com a mesma ressalva de sempre (nome é chave frágil; onde não casa, a linha
 * mostra traço em vez de inventar).
 */
export interface LinhaDaProgramacao {
  tripId: string;
  externalTripId: string | null;
  /** `YYYY-MM-DD` no fuso da empresa — é por ele que a tela agrupa. */
  dia: string;
  regiao: string | null;
  origem: string | null;
  destino: string | null;
  /** Início e fim da janela de coleta: as colunas "ETA ORIGEM" e "CPT ORIGEM" da planilha. */
  etaOrigem: string | null;
  cptOrigem: string | null;
  etaDestino: string | null;
  perfil: string | null;
  solicitacao: string | null;
  /**
   * A DOCA (30/08, a pedido: "a função de doca junto com o carregamento").
   *
   * Vem do mesmo `operational_fields` da solicitação. Aparece na linha ANTES do status, porque é a
   * informação que quem acompanha o carregamento procura junto com ele — saber que a viagem está
   * "Carregando" sem saber ONDE manda a pessoa perguntar por rádio.
   */
  doca: string | null;
  status: string;
  acceptanceStatus: string | null;
  portalStatus: string | null;
  motorista: string | null;
  placa: string | null;
  /**
   * A PLACA QUE FICOU SÓ NO TMS (30/08, a pedido).
   *
   * O caso que ela existe para contar: uma CARRETA rodou no lugar de um TRUCK. O portal aceita uma
   * placa só numa LH de truck — vai a do cavalo — e a segunda ficava guardada em
   * `portal_commands.plates_internas` sem NENHUMA tela para mostrá-la.
   *
   * É por isso que a planilha do faturamento sobrevivia a esta: o TMS capturava o dado e o escondia,
   * e pagar pela tarifa de carreta dependia de alguém anotar do lado de fora.
   */
  placaInterna: string | null;
  cpf: string | null;
  telefone: string | null;
  /**
   * O PREVISTO — quem VAI dirigir, quando ainda não há atribuição (2026-08-26).
   *
   * Vem em branco assim que o portal escala alguém de verdade: a intenção não disputa espaço com
   * o fato. Quem decide isso é a consulta, não a tela — ver o `case` no SELECT.
   */
  /**
   * O STATUS QUE A OPERAÇÃO MARCOU — a coluna que a planilha tem (2026-08-26).
   *
   * `statusOperacional` e não `status`, porque `status` já é o da VIAGEM, que vem do portal. São
   * coisas diferentes e ficam na mesma linha: um diz o que aconteceu com a carga, o outro o que a
   * operação fez sobre ela. Chamar os dois de status foi o primeiro erro que o compilador pegou.
   *
   * Compartilhado, ao contrário da cor: a planilha tem UMA coluna que todo mundo lê. `null` é o
   * normal da esmagadora maioria das linhas.
   */
  statusOperacional: "A_ENVIAR" | "ENVIADO" | "PROG_OK" | "NO_SHOW" | null;
  previstoMotorista: string | null;
  previstoPlaca: string | null;
  /** Quantos recados a viagem tem. É só o número: o texto se lê abrindo a LH. */
  comentarios: number;
  /** A camada pessoal: cor posta por quem está olhando, e se ela escondeu esta linha. */
  cor: string | null;
  oculta: boolean;
}

export async function readProgramacao(
  userId: string,
  opcoes: { diasAtras?: number; diasAdiante?: number; regioes?: readonly string[] } = {},
): Promise<LinhaDaProgramacao[]> {
  const diasAtras = opcoes.diasAtras ?? 1;
  const diasAdiante = opcoes.diasAdiante ?? 7;
  const regioes = (opcoes.regioes ?? []).filter((r) => r.trim() !== "");

  /**
   * O FILTRO DE FRENTES É MONTADO, NÃO INTERPOLADO COMO ARRAY.
   *
   * ``sql`... = any(${lista})` `` NÃO expande array no drizzle — a consulta compila e não casa

   * nada,
   * em silêncio. Já custou caro uma vez nesta base (o filtro de placas bloqueadas, 2026-08-25).
   * `sql.join` gera um parâmetro por valor, que é o caminho que o drizzle garante.
   *
   * Lista vazia = sem recorte, e não "nenhuma frente": quem não escolheu quer ver tudo.
   */
  const filtroDeFrente =
    regioes.length === 0
      ? sql`true`
      : sql`lo.region::text in (${sql.join(
          regioes.map((r) => sql`${r}`),
          sql`, `,
        )})`;

  const linhas = await db.execute<{
    trip_id: string;
    external_trip_id: string | null;
    dia: string;
    regiao: string | null;
    origem: string | null;
    destino: string | null;
    eta_origem: string | null;
    cpt_origem: string | null;
    eta_destino: string | null;
    perfil: string | null;
    solicitacao: string | null;
  /**
   * A DOCA (30/08, a pedido: "a função de doca junto com o carregamento").
   *
   * Vem do mesmo `operational_fields` da solicitação. Aparece na linha ANTES do status, porque é a
   * informação que quem acompanha o carregamento procura junto com ele — saber que a viagem está
   * "Carregando" sem saber ONDE manda a pessoa perguntar por rádio.
   */
  doca: string | null;
    status: string;
    aceitacao: string | null;
    status_portal: string | null;
    motorista: string | null;
    placa: string | null;
    placa_interna: string | null;
    cpf: string | null;
    telefone: string | null;
    cor: string | null;
    oculta: boolean;
    status_operacional: string | null;
    previsto_motorista: string | null;
    previsto_placa: string | null;
    comentarios: number;
  }>(sql`
    with motorista_do_portal as (
      -- Um SELECT por viagem para achar CPF e telefone seria uma ida ao banco por linha. Aqui o
      -- cadastro inteiro entra uma vez, dobrado pelo nome, e o casamento vira um join.
      select distinct on (upper(btrim(name))) upper(btrim(name)) as nome, cpf, phone
        from drivers
       where archived_at is null
       order by upper(btrim(name)), (phone is null), (cpf is null)
    )
    select
      t.id as trip_id,
      t.external_trip_id,
      to_char(t.planned_pickup_window_start at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
      lo.region::text as regiao,
      lo.name as origem,
      ld.name as destino,
      to_char(t.planned_pickup_window_start at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as eta_origem,
      to_char(t.planned_pickup_window_end   at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as cpt_origem,
      to_char(t.planned_delivery_window_end at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as eta_destino,
      t.planned_vehicle_type::text as perfil,
      t.operational_fields ->> 'solicitacao' as solicitacao,
      /*
       * A DOCA VEM DO PORTAL (30/08), com o campo digitado como reserva.
       *
       * "Doca (portal)" é o "Número do Doca" da tela deles, gravado pelo ciclo do plano — dado
       * automático, sempre atual. O operational_fields é o que alguém digitou à mão, e continua
       * valendo quando o portal não disse nada (viagem de import manual, por exemplo).
       *
       * O PORTAL VENCE porque é ele quem sabe: a doca é decisão da estação, não nossa. Se os dois
       * discordarem, o que está escrito lá é o que a portaria vai cobrar.
       */
      coalesce(
        t.customer_fields ->> 'Doca (portal)',
        t.operational_fields ->> 'doca'
      ) as doca,
      t.current_status::text as status,
      t.customer_fields ->> 'Aceitação (portal)' as aceitacao,
      t.customer_fields ->> 'Status (portal)' as status_portal,
      t.customer_fields ->> 'Motorista (portal)' as motorista,
      t.customer_fields ->> 'Placa (portal)' as placa,
      /*
       * A PLACA QUE NÃO FOI AO PORTAL — a carreta que rodou no lugar do truck (30/08).
       *
       * Vem da ÚLTIMA ordem de atribuição concluída, e só dela: uma ordem que falhou não descreve o
       * que está na estrada, e uma ordem antiga descreveria a atribuição anterior.
       *
       * Um "left join lateral" e não subconsulta no SELECT: a esmagadora maioria das viagens não tem
       * placa interna, e o lateral não paga nada por elas.
       */
      pi.plates_internas as placa_interna,
      m.cpf,
      m.phone as telefone,
      w.cor,
      coalesce(w.oculta, false) as oculta,
      /*
        O PREVISTO SÓ APARECE ENQUANTO NÃO HÁ ATRIBUIÇÃO.
        Assim que o portal escala alguém, a intenção some da linha — mostrar os dois lado a lado
        obrigaria quem olha a decidir qual vale, e essa dúvida é justamente o que a coluna existe
        para não criar. A linha continua no banco: se a atribuição cair, o previsto reaparece.
      */
      pv.status as status_operacional,
      case when nullif(btrim(t.customer_fields ->> 'Motorista (portal)'), '') is null
           then dpv.name end as previsto_motorista,
      case when nullif(btrim(t.customer_fields ->> 'Placa (portal)'), '') is null
           then pv.placa end as previsto_placa,
      /*
        Subconsulta correlacionada e não CTE: são no máximo algumas centenas de linhas, cada uma
        resolvida por "trip_comments_trip_idx". Uma CTE agregando a tabela inteira seria mais
        trabalho para o banco a cada carga da tela, e a tela carrega sozinha de minuto em minuto.
      */
      (select count(*)::int from trip_comments tc
        where tc.trip_id = t.id and tc.apagado_em is null) as comentarios
    from trips t
    left join locations lo on lo.id = t.origin_location_id
    left join locations ld on ld.id = t.destination_location_id
    left join motorista_do_portal m
      on m.nome = upper(btrim(t.customer_fields ->> 'Motorista (portal)'))
    left join ${userWatchedTrips} w on w.trip_id = t.id and w.user_id = ${userId}
    left join trip_programacao pv on pv.trip_id = t.id
    -- O nome sai do cadastro na leitura, nunca de uma copia guardada: "portal_driver_id" e a chave
    -- estavel, e um nome copiado envelheceria sem que ninguém soubesse de onde veio.
    left join drivers dpv on dpv.portal_driver_id = pv.portal_driver_id
    /*
     * A PLACA QUE NÃO FOI AO PORTAL, da ÚLTIMA atribuição CONCLUÍDA (30/08).
     *
     * Exige status "done" e não a mais recente qualquer: uma ordem que falhou não descreve o que está
     * na estrada, e mostrá-la faria a linha afirmar uma carreta que nunca foi aceita.
     *
     * Lateral com "limit 1" em vez de subconsulta no SELECT: a esmagadora maioria das viagens não
     * tem placa interna, e o lateral não paga nada por elas.
     */
    left join lateral (
      select pc.plates_internas
        from portal_commands pc
       where pc.trip_id = t.id and pc.action = 'assign' and pc.status = 'done'
         and pc.plates_internas is not null
       order by pc.requested_at desc
       limit 1
    ) pi on true
    where t.planned_pickup_window_start is not null
      -- A janela é em DIAS de calendário, não em horas: "ontem" tem de trazer a viagem das 06h de
      -- ontem, e subtrair 24 horas de agora a deixaria de fora pela manhã.
      and (t.planned_pickup_window_start at time zone 'America/Sao_Paulo')::date
            >= (now() at time zone 'America/Sao_Paulo')::date - ${diasAtras}::int
      and (t.planned_pickup_window_start at time zone 'America/Sao_Paulo')::date
            <= (now() at time zone 'America/Sao_Paulo')::date + ${diasAdiante}::int
      -- ENCERRADA sai; CANCELADA passou a FICAR (30/08, a pedido).
      --
      -- As duas saíam juntas, com a mesma justificativa ("a planilha não guarda o que morreu"), e
      -- elas não são a mesma coisa. Encerrada acabou de acontecer e não pede nada de ninguém.
      -- Cancelada é uma viagem que estava no quadro e SUMIU — e sumir sem deixar rastro faz quem
      -- procura por ela achar que perdeu a linha, ou que o TMS perdeu.
      --
      -- Ela chega escondida: o filtro de status da tela começa com 'cancelled' desligado, e quem
      -- quiser ver liga. Trazê-la acesa encheria o quadro do dia de viagem que não vai acontecer.
      and t.current_status not in ('billing_pending', 'billing_ready', 'billed')
      and ${filtroDeFrente}
    order by t.planned_pickup_window_start, t.external_trip_id
  `);

  return linhas.map((r) => ({
    tripId: r.trip_id,
    externalTripId: r.external_trip_id,
    dia: r.dia,
    regiao: r.regiao,
    origem: r.origem,
    destino: r.destino,
    etaOrigem: r.eta_origem,
    cptOrigem: r.cpt_origem,
    etaDestino: r.eta_destino,
    perfil: r.perfil,
    solicitacao: r.solicitacao,
    doca: r.doca,
    status: r.status,
    acceptanceStatus: r.aceitacao,
    portalStatus: r.status_portal,
    motorista: r.motorista,
    placa: r.placa,
    placaInterna: r.placa_interna,
    cpf: r.cpf,
    telefone: r.telefone,
    cor: r.cor,

    oculta: r.oculta,

    statusOperacional:
      (r.status_operacional as "A_ENVIAR" | "ENVIADO" | "PROG_OK" | "NO_SHOW" | null) ?? null,
    previstoMotorista: r.previsto_motorista,

    previstoPlaca: r.previsto_placa,

    comentarios: Number(r.comentarios ?? 0),
  }));
}

/**
 * A MARCA PESSOAL: a cor e o esconder, numa linha só por (pessoa, viagem).
 *
 * `onConflictDoUpdate` porque a mesma linha carrega as duas coisas — quem esconde uma LH que já
 * estava colorida não pode perder a cor, e vice-versa. Passar `undefined` mantém o que estava.
 */
export async function marcarViagem(
  userId: string,
  tripId: string,
  marca: { cor?: string | null; oculta?: boolean },
): Promise<void> {
  await db
    .insert(userWatchedTrips)
    .values({ userId, tripId, cor: marca.cor ?? null, oculta: marca.oculta ?? false })
    .onConflictDoUpdate({
      target: [userWatchedTrips.userId, userWatchedTrips.tripId],
      set: {
        ...(marca.cor !== undefined ? { cor: marca.cor } : {}),
        ...(marca.oculta !== undefined ? { oculta: marca.oculta } : {}),
      },
    });
}

export async function acompanharViagem(userId: string, tripId: string): Promise<void> {
  await db.insert(userWatchedTrips).values({ userId, tripId }).onConflictDoNothing();
}

export async function pararDeAcompanhar(userId: string, tripId: string): Promise<void> {
  await db
    .delete(userWatchedTrips)
    .where(and(eq(userWatchedTrips.userId, userId), eq(userWatchedTrips.tripId, tripId)));
}
