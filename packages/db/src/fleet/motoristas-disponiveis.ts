import { sql } from "drizzle-orm";
import {
  cabeNaAba,
  estaLivre,
  placasDoPortal,
  situacaoDaViagem,
  type SituacaoDoMotorista,
} from "@brazil-tms/shared";
import { db } from "../client";

/**
 * MOTORISTAS DISPONÍVEIS — a planilha PROGRAMAÇÃO SHOPEE FROTA, viva (fatia 031, 03/09).
 *
 * ══ A FONTE: O PORTAL, E NÃO A NOSSA ATRIBUIÇÃO ══════════════════════════════════════════════
 *
 * Esta é A decisão da fatia, e ela é contraintuitiva: `trip_assignments` **não** é a fonte de quem
 * está dirigindo. Três medidas contra a produção em 03/09, sobre 7 dias:
 *
 *   · **49 viagens de 760** têm motorista no portal e NENHUMA atribuição nossa. O inverso é ZERO.
 *     Na janela desta aba isso são **67 motoristas invisíveis**.
 *   · O `ID do motorista (portal)` acha um cadastro nosso em **49 de 49** dessas órfãs. Cobertura
 *     total — 1.492 dos 1.518 motoristas têm `portal_driver_id`.
 *   · **Em 18 de 406 pares a atribuição nossa aponta para OUTRA PESSOA.** Não é grafia diferente, é
 *     gente diferente: "VANDRE PESSOA NOGUEIRA" contra "RAPHAEL MARTINS RABELO", "PAULO ROBERTO
 *     SILVA TEIXEIRA" contra "DARLA BEZERRA DOS SANTOS". Em **todos os 18** o id do portal resolve
 *     para o nome do portal: a nossa atribuição é a versão VELHA de uma viagem reatribuída lá.
 *
 * O sintoma de errar isto seria duplo e silencioso: motorista EM VIAGEM aparecendo como livre, e
 * motorista livre não aparecendo. É literalmente o erro que `../trips/placas-do-motorista.ts`
 * documenta no próprio cabeçalho — a primeira versão dele lia só a NOSSA caixa de saída, e não
 * enxergava quem foi escalado direto no portal, que é a maioria.
 *
 * A atribuição nossa continua no `coalesce`, e só ali: ela cobre a viagem que o TMS acabou de
 * atribuir e que o portal ainda não refletiu (o robô lê de 20 em 20 segundos).
 *
 * ══ A VARREDURA NÃO É A JANELA DA ABA ═══════════════════════════════════════════════════════
 *
 * Varremos 8 dias para achar a ÚLTIMA viagem de cada motorista, e só DEPOIS recortamos. Varrer só a
 * janela faria a "última" ser a última *dentro dela* — e um motorista com viagem futura apareceria
 * como livre, que é exatamente o que a aba existe para não dizer.
 *
 * Oito dias bastam: o corte da aba é de sete, e viagem futura entra por não haver limite superior.
 * Medido: 8 dias custam 10,9 ms; 45 dias custam 18,3 ms para o MESMO resultado.
 *
 * ══ A ORDEM DA ESCOLHA, e o que a simulação ensinou ═════════════════════════════════════════
 *
 * "A última viagem é a que chega por último" está quase certo, e o "quase" foi achado SIMULANDO
 * contra a produção — nenhum teste de unidade pegaria, porque a regra estava sendo obedecida.
 *
 * Dois motoristas apareceriam como LIVRES estando na estrada: a última deles, pela data, era uma
 * viagem **cancelada** que chegaria mais tarde, e a viagem `in_transit` que eles rodavam de fato
 * chegava antes.
 *
 * Isso levou a duas correções, nesta ordem:
 *
 *   1. **Viagem aberta ganha de viagem concluída**, e só depois vale a data. É o que o pedido do
 *      usuário já dizia — "o motorista sai da aba quando entrar em uma viagem".
 *   2. **Cancelada não entra na aba** (usuário, 03/09: "canceladas pode ignorar"). Além de resolver
 *      o mesmo caso pela raiz, isso CORRIGE nove linhas: eram nove motoristas cuja cancelada estava
 *      na frente de uma viagem concluída de verdade, e que agora aparecem como FINALIZADO.
 *
 * O preço são **sete motoristas** que somem — a cancelada era a única viagem recente deles. Estão
 * livres, mas a aba não teria nada de verdadeiro para contar sobre a última rota.
 *
 * ══ O CUSTO, MEDIDO ═════════════════════════════════════════════════════════════════════════
 *
 * `explain (analyze, buffers)` contra a produção em 03/09: **10,9 ms**, 215 linhas, todos os buffers
 * em `shared hit` — nada de disco. Sem índice novo: o plano usa hash join sobre varredura sequencial
 * de tabelas pequenas (1.518 motoristas, 4.056 viagens em 8 dias), e um índice que o planejador não
 * usaria seria custo de escrita sem retorno. Revisitar se passar de 50 ms.
 *
 * ══ NÃO ESCREVE NADA ════════════════════════════════════════════════════════════════════════
 *
 * Nem aqui, nem em lugar nenhum da fatia. "Disponível" não é dado nosso — é conclusão tirada a cada
 * leitura. Guardá-la criaria uma segunda verdade que diverge do portal em silêncio.
 */

export interface MotoristaDisponivel {
  driverId: string;
  nome: string;
  origem: string;
  destino: string;
  /** A primeira placa do portal. `null` quando ele não mandou nenhuma. */
  cavalo: string | null;
  /** A segunda placa. `null` quando não há — **nunca** o cavalo repetido. */
  carreta: string | null;
  /** Início e conclusão PLANEJADOS, em UTC. Quem formata em São Paulo é a tela. */
  inicio: string | null;
  conclusao: string;
  situacao: SituacaoDoMotorista;
  /** O status corrente da viagem, para a tela rotular o "a caminho" com o catálogo que já existe. */
  statusDaViagem: string;
  tripId: string;
  impedimento: { motivo: "bloqueado" | "inativo"; detalhe: string | null } | null;
}

export interface MotoristasDisponiveisResposta {
  motoristas: MotoristaDisponivel[];
  contagem: { disponiveis: number; aCaminho: number };
}

/** Quantos dias para trás a varredura olha. Ver "A VARREDURA NÃO É A JANELA" no cabeçalho. */
const DIAS_DE_VARREDURA = 8;

type Linha = {
  driver_id: string;
  nome: string;
  origem: string;
  destino: string;
  placas_portal: string | null;
  inicio: Date | null;
  conclusao: Date;
  status: string;
  trip_id: string;
  driver_status: string;
  blocked_at: Date | null;
  blocked_reason: string | null;
};

export async function motoristasDisponiveis(
  agora = new Date(),
): Promise<MotoristasDisponiveisResposta> {
  const linhas = await db.execute<Linha>(sql`
    with viagens_com_motorista as (
      select
        coalesce(dp.id, a.driver_id) as driver_id,
        t.id as trip_id,
        t.current_status as status,
        t.planned_pickup_window_start as inicio,
        t.planned_delivery_window_start as conclusao,
        t.origin_location_id,
        t.destination_location_id,
        t.customer_fields->>'Placa (portal)' as placas_portal
      from trips t
      left join drivers dp
        on dp.portal_driver_id = t.customer_fields->>'ID do motorista (portal)'
      left join trip_assignments a
        on a.trip_id = t.id and a.is_current and a.driver_id is not null
      where t.planned_delivery_window_start > now() - interval '${sql.raw(String(DIAS_DE_VARREDURA))} days'
        and coalesce(dp.id, a.driver_id) is not null
        -- Cancelada NÃO entra na aba (decisão do usuário, 03/09). Ver viagemContaParaAAba.
        and t.current_status <> 'cancelled'
    ),
    ultima as (
      -- VIAGEM ABERTA GANHA DE VIAGEM CONCLUÍDA. Ver "A ORDEM DA ESCOLHA" no cabeçalho.
      select distinct on (driver_id) *
      from viagens_com_motorista
      order by driver_id, (status = 'completed') asc, conclusao desc, trip_id
    )
    select
      u.driver_id, d.name as nome, u.trip_id, u.status, u.inicio, u.conclusao, u.placas_portal,
      lo.name as origem, ld.name as destino,
      d.status as driver_status, d.blocked_at, d.blocked_reason
    from ultima u
    join drivers d on d.id = u.driver_id
    join locations lo on lo.id = u.origin_location_id
    join locations ld on ld.id = u.destination_location_id
    where d.archived_at is null
  `);

  const motoristas: MotoristaDisponivel[] = [];
  for (const l of linhas) {
    const situacao = situacaoDaViagem(l.status);
    const conclusao = new Date(l.conclusao);

    /*
      O RECORTE FINAL É DA REGRA PURA, e não do SQL.

      A consulta traz a última viagem de cada motorista; QUEM CABE é decisão de `cabeNaAba`, que
      conhece o fuso de São Paulo e o corte de sete dias. Repetir essa condição aqui em SQL faria
      duas versões da mesma regra, e a de baixo — a testável — deixaria de ser a que manda.
    */
    if (!cabeNaAba({ situacao, conclusao, agora })) continue;

    /*
      AS DUAS PLACAS, pelo separador que já existe.

      `placasDoPortal` mora em `packages/shared` e já trata vírgula, ponto-e-vírgula, placa única e
      vírgula sobrando. Um segundo separador escrito aqui divergiria dele sem erro nenhum.

      A carreta ausente fica NULA — nunca o cavalo repetido. Na atribuição nossa só 218 de 406 têm
      carreta; no portal, 351 de 455 trazem as duas.
    */
    const placas = placasDoPortal(l.placas_portal);

    motoristas.push({
      driverId: l.driver_id,
      nome: l.nome,
      origem: l.origem,
      destino: l.destino,
      cavalo: placas[0] ?? null,
      carreta: placas[1] ?? null,
      inicio: l.inicio ? new Date(l.inicio).toISOString() : null,
      conclusao: conclusao.toISOString(),
      situacao,
      statusDaViagem: l.status,
      tripId: l.trip_id,
      impedimento: impedimentoDoMotorista(l),
    });
  }

  return {
    motoristas,
    contagem: {
      // Finalizado e cancelada somam como disponíveis: nos dois o motorista está livre. A distinção
      // entre eles é o rótulo da LINHA, porque só um deles significa carga entregue.
      disponiveis: motoristas.filter((m) => estaLivre(m.situacao)).length,
      aCaminho: motoristas.filter((m) => !estaLivre(m.situacao)).length,
    },
  };
}

/**
 * O QUE IMPEDE ESTE MOTORISTA DE RECEBER CARGA — e é sempre um dos dois.
 *
 * A regra de QUEM está impedido é a mesma de `driver-block.ts` (`blocked_at` nosso ou `status`
 * diferente de `active`); aqui as duas colunas são lidas só para NOMEAR qual dos dois é, porque a
 * tela precisa dizer o motivo e as duas frases são diferentes.
 *
 * O nosso bloqueio ganha do estado do portal quando os dois valem: ele tem motivo escrito, e é o
 * mais específico dos dois.
 *
 * Impedido NÃO some da lista — decisão do usuário em 03/09. Esconder faria o nome desaparecer sem
 * explicação, e ninguém iria consertar o cadastro. Eram 4 dos 36 finalizados de hoje e ontem.
 */
function impedimentoDoMotorista(l: Linha): MotoristaDisponivel["impedimento"] {
  if (l.blocked_at) return { motivo: "bloqueado", detalhe: l.blocked_reason ?? null };
  if (l.driver_status !== "active") return { motivo: "inativo", detalhe: null };
  return null;
}
