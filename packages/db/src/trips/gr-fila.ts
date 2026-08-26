import { sql } from "drizzle-orm";
import { chaveDaEstacao } from "@brazil-tms/shared";
import { db } from "../client";
import { vinculosDasPlacas } from "./pre-sm-dados";

/**
 * A FILA DA ABA GR — o que está esperando Pré-SM, e o que falta em cada uma (2026-08-26, 027).
 *
 * ── É UMA CONSULTA, NÃO UMA TABELA ────────────────────────────────────────────────────────────
 *
 * Não existe coluna "está pronta para enviar", e isso é decisão. Essa resposta muda quando alguém
 * preenche um CPF, classifica um vínculo ou confirma uma correspondência — e **nenhum desses
 * eventos passa pela viagem**. Uma coluna guardada ficaria velha no instante seguinte e precisaria
 * de alguém para recalculá-la; esse alguém não existe.
 *
 * É o mesmo raciocínio do aviso de divergência da 026, e pela mesma razão.
 *
 * ── AS COLUNAS AMBÍGUAS SÃO QUALIFICADAS DE PROPÓSITO ─────────────────────────────────────────
 *
 * `updated_at` existe em `trips` E em `drivers`. Sem o prefixo, o Postgres recusa a consulta
 * inteira por ambiguidade — e nenhum teste unitário pega isso, porque quem responde é o banco. Já
 * quebrou de verdade na 026.
 */

export interface LinhaDaFilaGR {
  tripId: string;
  externalTripId: string;
  origem: string | null;
  destino: string | null;
  /** A chave normalizada de cada ponta, para casar com a ponte de cidade. */
  origemNorm: string | null;
  destinoNorm: string | null;

  cpfMotorista: string | null;
  nomeMotorista: string | null;
  vinculoMotorista: string | null;
  cpfSegundoMotorista: string | null;
  nomeSegundoMotorista: string | null;
  vinculoSegundoMotorista: string | null;

  placas: { placa: string; vinculo: string | null }[];

  chegadaNaColeta: string | null;
  saidaDaColeta: string | null;
  chegadaNaEntrega: string | null;
  saidaDaEntrega: string | null;

  /** Da ponte de rota, **só se confirmada**. */
  codRota: number | null;
  /** Da ponte de cidade, **só se confirmadas**. */
  codIbgeOrigem: number | null;
  codIbgeDestino: number | null;

  /** O estado da Pré-SM, quando já existe uma linha. */
  preSmStatus: string | null;
  preSmCodigo: string | null;
  preSmMotivo: string | null;
  preSmEm: string | null;
  /**
   * O corpo que FOI enviado, para a aba apontar divergência (FR-016).
   *
   * A comparação em si é pura (`divergenciasDaPreSm`) e vive em `packages/shared` — comparar é
   * regra, e regra se testa. Aqui só se carrega o que ela precisa.
   */
  payloadEnviado: Record<string, unknown> | null;
}

/**
 * As viagens ATRIBUÍDAS, com tudo o que a fila precisa mostrar.
 *
 * Traz também as já enviadas: a aba as mantém visíveis numa seção separada, porque é ali que se vê
 * que a atribuição mudou depois de a escolta já estar contratada (FR-014, FR-016).
 *
 * A ordem é pela urgência da coleta — o que sai primeiro aparece primeiro (FR-004).
 */
export async function filaDaGR(limite = 300): Promise<LinhaDaFilaGR[]> {
  const linhas = await db.execute<Record<string, unknown>>(sql`
    with atribuicao as (
      -- A ordem de atribuição mais recente de cada viagem: é dela que saem placas e motoristas.
      select distinct on (pc.trip_id)
        pc.trip_id, pc.driver_id, pc.second_driver_id, pc.plates
      from portal_commands pc
      where pc.action = 'assign' and pc.status = 'done'
      order by pc.trip_id, pc.settled_at desc nulls last
    ),
    viva as (
      -- A linha de Pré-SM que vale: a viva, ou a mais recente quando não há viva.
      select distinct on (tp.trip_id)
        tp.trip_id, tp.status, tp.codigo, tp.motivo, tp.requested_at, tp.settled_at,
        tp.payload_enviado
      from trip_pre_sm tp
      order by tp.trip_id,
        case when tp.status in ('pendente','criada') then 0 else 1 end,
        tp.requested_at desc
    )
    select
      t.id                                as trip_id,
      t.external_trip_id                  as external_trip_id,
      o.name                              as origem,
      d.name                              as destino,
      t.planned_pickup_window_start       as chegada_coleta,
      t.planned_pickup_window_end         as saida_coleta,
      t.planned_delivery_window_start     as chegada_entrega,
      t.planned_delivery_window_end       as saida_entrega,
      a.plates                            as placas,
      m1.cpf                              as cpf_motorista,
      m1.name                             as nome_motorista,
      m1.ownership_type::text             as vinculo_motorista,
      m2.cpf                              as cpf_motorista2,
      m2.name                             as nome_motorista2,
      m2.ownership_type::text             as vinculo_motorista2,
      v.status                            as pre_sm_status,
      v.codigo                            as pre_sm_codigo,
      v.motivo                            as pre_sm_motivo,
      v.payload_enviado                   as payload_enviado,
      coalesce(v.settled_at, v.requested_at) as pre_sm_em
    from atribuicao a
    join trips t     on t.id = a.trip_id
    join locations o on o.id = t.origin_location_id
    join locations d on d.id = t.destination_location_id
    left join drivers m1 on m1.portal_driver_id = a.driver_id::text
    left join drivers m2 on m2.portal_driver_id = a.second_driver_id::text
    left join viva v on v.trip_id = t.id
    -- Viagem encerrada ou cancelada não precisa mais de escolta; deixá-la na fila seria ruído
    -- permanente que ensina a ignorar a lista.
    where t.current_status not in ('completed', 'cancelled')
    -- t.planned_pickup_window_start QUALIFICADO: ver o comentário do topo sobre ambiguidade.
    order by t.planned_pickup_window_start asc nulls last
    limit ${limite}
  `);

  const cruas = [...linhas];

  /**
   * O ENRIQUECIMENTO ACONTECE EM LOTE, e não linha a linha.
   *
   * Trezentas viagens fariam 900 consultas se cada linha resolvesse as próprias placas e as duas
   * pontes. São três consultas para o conjunto todo — as chaves se repetem muito, porque a malha
   * tem 134 rotas para milhares de viagens.
   */
  const placasPorLinha = cruas.map((r) =>
    String(r.placas ?? "")
      .split(/[,;]/)
      .map((p) => p.toUpperCase().replace(/[^A-Z0-9]/g, ""))
      .filter(Boolean),
  );

  const [vinculos, pontes] = await Promise.all([
    vinculosDasPlacas([...new Set(placasPorLinha.flat())]),
    pontesConfirmadas(
      cruas.map((r) => ({
        origem: (r.origem as string) ?? "",
        destino: (r.destino as string) ?? "",
      })),
    ),
  ]);

  const vincPorPlaca = new Map(vinculos.map((v) => [v.placa, v.vinculo]));

  return cruas.map((r, i) => {
    const origemNorm = chaveDaEstacao((r.origem as string) ?? "");
    const destinoNorm = chaveDaEstacao((r.destino as string) ?? "");
    return {
      tripId: String(r.trip_id),
      externalTripId: String(r.external_trip_id ?? ""),
      origem: (r.origem as string) ?? null,
      destino: (r.destino as string) ?? null,
      origemNorm: origemNorm || null,
      destinoNorm: destinoNorm || null,
      cpfMotorista: (r.cpf_motorista as string) ?? null,
      nomeMotorista: (r.nome_motorista as string) ?? null,
      vinculoMotorista: (r.vinculo_motorista as string) ?? null,
      cpfSegundoMotorista: (r.cpf_motorista2 as string) ?? null,
      nomeSegundoMotorista: (r.nome_motorista2 as string) ?? null,
      vinculoSegundoMotorista: (r.vinculo_motorista2 as string) ?? null,
      placas: placasPorLinha[i]!.map((placa) => ({
        placa,
        vinculo: vincPorPlaca.get(placa) ?? null,
      })),
      chegadaNaColeta: iso(r.chegada_coleta),
      saidaDaColeta: iso(r.saida_coleta),
      chegadaNaEntrega: iso(r.chegada_entrega),
      saidaDaEntrega: iso(r.saida_entrega),
      codRota: pontes.rotas.get(`${origemNorm}>${destinoNorm}`) ?? null,
      codIbgeOrigem: pontes.cidades.get(origemNorm) ?? null,
      codIbgeDestino: pontes.cidades.get(destinoNorm) ?? null,
      preSmStatus: (r.pre_sm_status as string) ?? null,
      preSmCodigo: (r.pre_sm_codigo as string) ?? null,
      preSmMotivo: (r.pre_sm_motivo as string) ?? null,
      preSmEm: iso(r.pre_sm_em),
      payloadEnviado: (r.payload_enviado as Record<string, unknown>) ?? null,
    };
  });
}

/**
 * As duas pontes, **só as confirmadas**, para o conjunto de rotas da fila.
 *
 * `confirmado_em is not null` nos dois lados. A trava está aqui e nas funções de leitura por chave
 * — quem consulta a fila não deve poder escolher ver as não conferidas, porque o que ele faz com
 * elas é criar Pré-SM.
 */
async function pontesConfirmadas(
  rotas: readonly { origem: string; destino: string }[],
): Promise<{ cidades: Map<string, number>; rotas: Map<string, number> }> {
  const cidades = new Map<string, number>();
  const porRota = new Map<string, number>();
  if (rotas.length === 0) return { cidades, rotas: porRota };

  const [c, r] = await Promise.all([
    db.execute<{ estacao_norm: string; cod_ibge: number }>(
      sql`select estacao_norm, cod_ibge from pre_sm_city_links where confirmado_em is not null`,
    ),
    db.execute<{ origem_norm: string; destino_norm: string; cod_rota: number }>(
      sql`select origem_norm, destino_norm, cod_rota from pre_sm_route_links where confirmado_em is not null`,
    ),
  ]);

  for (const x of c) cidades.set(x.estacao_norm, Number(x.cod_ibge));
  for (const x of r) porRota.set(`${x.origem_norm}>${x.destino_norm}`, Number(x.cod_rota));
  return { cidades, rotas: porRota };
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * A MESMA linha da fila, para UMA viagem.
 *
 * O job de criação usa esta função, e não uma consulta própria, de propósito: se a fila e o job
 * lessem o mundo por caminhos diferentes, a tela poderia dizer "pronta" e o envio recusar — ou o
 * contrário. Uma fonte só é o que garante que a linha verde vira Pré-SM.
 *
 * O filtro em memória parece desperdício e não é: a fila tem no máximo algumas centenas de linhas,
 * e ter DUAS consultas com o mesmo `where` é exatamente como elas divergem com o tempo.
 */
export async function linhaDaFilaGR(tripId: string): Promise<LinhaDaFilaGR | null> {
  const todas = await filaDaGR();
  return todas.find((l) => l.tripId === tripId) ?? null;
}
