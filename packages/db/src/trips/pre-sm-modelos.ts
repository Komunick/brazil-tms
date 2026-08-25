import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../client";
import { writeAudit } from "../audit/write-audit";
import { preSmRouteModels } from "../../schema";

/**
 * A PONTE ROTA → MODELO, e quem pode atravessá-la (2026-08-25, fatia 026).
 *
 * A carga PROPÕE; uma pessoa CONFIRMA; só linha confirmada cria Pré-SM.
 *
 * ── POR QUE A CONFERÊNCIA HUMANA NÃO É BUROCRACIA ─────────────────────────────────────────────
 *
 * O casamento é por nome de estação, com quatro tolerâncias que saíram de erro medido. Ele acerta
 * 84% das viagens — e o que erra não erra em branco: erra apontando para OUTRA rota. Uma Pré-SM
 * criada com o modelo errado é escolta contratada para um trajeto que o caminhão não vai fazer, e
 * ninguém percebe até o veículo estar na estrada.
 *
 * O normalizador errou duas vezes no dia em que foi escrito. A conferência existe por causa disso,
 * não por precaução genérica.
 */

export interface CorrespondenciaDaRota {
  id: string;
  origemNorm: string;
  destinoNorm: string;
  codModelo: number;
  descricao: string;
  confirmadoEm: string | null;
}

/**
 * Grava as propostas da carga, sem confirmar nenhuma.
 *
 * `DO NOTHING` em conflito, e não `DO UPDATE`: se a rota já existe, ou ela foi confirmada — e
 * sobrescrever apagaria a conferência de alguém — ou está esperando conferência, e a proposta nova
 * é a mesma. Em nenhum dos dois casos o certo é mexer.
 *
 * A exceção legítima — o modelo daquela rota mudou na gerenciadora — é trabalho de cadastro, feito
 * na tela, com a pessoa vendo o que está trocando.
 */
export async function gravarPropostasDeModelo(
  propostas: readonly {
    origemNorm: string;
    destinoNorm: string;
    codModelo: number;
    descricao: string;
  }[],
): Promise<{ novas: number }> {
  if (propostas.length === 0) return { novas: 0 };

  const linhas = await db
    .insert(preSmRouteModels)
    .values(propostas.map((p) => ({ ...p })))
    .onConflictDoNothing({
      target: [preSmRouteModels.origemNorm, preSmRouteModels.destinoNorm],
    })
    .returning({ id: preSmRouteModels.id });

  return { novas: linhas.length };
}

/** Tudo, para a tela de conferência — as não confirmadas primeiro, que são o trabalho pendente. */
export async function listarCorrespondencias(): Promise<CorrespondenciaDaRota[]> {
  const linhas = await db
    .select()
    .from(preSmRouteModels)
    .orderBy(sql`${preSmRouteModels.confirmadoEm} nulls first`, preSmRouteModels.origemNorm);

  return linhas.map((l) => ({
    id: l.id,
    origemNorm: l.origemNorm,
    destinoNorm: l.destinoNorm,
    codModelo: l.codModelo,
    descricao: l.descricao,
    confirmadoEm: l.confirmadoEm?.toISOString() ?? null,
  }));
}

/**
 * Confirma (ou desfaz) uma correspondência — é o que a faz valer para criar Pré-SM.
 *
 * A auditoria vai na MESMA transação da mudança, e não na rota que chama. Confirmar autoriza gasto:
 * a gerenciadora cobra por solicitação. Um registro que pode falhar depois do `update` deixaria
 * exatamente o rastro que importa faltando justamente quando alguém for procurá-lo.
 *
 * Desfazer existe porque conferência é feita por gente e gente erra. Sem isso, uma confirmação
 * equivocada só se corrige direto no banco — e aí ninguém corrige, e a rota errada continua
 * criando Pré-SM.
 */
export async function definirConfirmacaoDaCorrespondencia(entrada: {
  id: string;
  confirmar: boolean;
  actorUserId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx
      .update(preSmRouteModels)
      .set({
        confirmadoEm: entrada.confirmar ? new Date() : null,
        atualizadoEm: new Date(),
      })
      .where(
        and(
          eq(preSmRouteModels.id, entrada.id),
          // O `where` exige o estado OPOSTO: confirmar o que já está confirmado devolve `false` em
          // vez de gravar uma auditoria de mudança que não houve.
          entrada.confirmar
            ? sql`${preSmRouteModels.confirmadoEm} is null`
            : isNotNull(preSmRouteModels.confirmadoEm),
        ),
      )
      .returning({ id: preSmRouteModels.id });

    if (r.length === 0) return false;

    await writeAudit(tx, {
      actorUserId: entrada.actorUserId,
      action: entrada.confirmar ? "pre_sm.modelo.confirmar" : "pre_sm.modelo.desconfirmar",
      entityType: "pre_sm_route_model",
      entityId: entrada.id,
      // O estado desta linha É a confirmação, então o antes/depois é ela mesma. Guardar isso em vez
      // de `null` deixa a auditoria legível sem ir buscar a linha, que pode ter mudado de novo.
      previousValue: { confirmado: !entrada.confirmar },
      newValue: { confirmado: entrada.confirmar },
    });
    return true;
  });
}

/**
 * O MODELO QUE VALE para esta rota — a única leitura que a criação da Pré-SM pode usar.
 *
 * `confirmadoEm is not null` é a trava (T025). Ela está AQUI, e não em quem chama, de propósito: uma
 * verificação que mora no chamador é uma verificação que o próximo chamador esquece.
 *
 * Devolve `null` para rota sem modelo E para rota com modelo ainda não conferido. Os dois viram o
 * mesmo desfecho — a Pré-SM não é criada e a viagem diz por quê (FR-012) —, e distingui-los aqui
 * daria a quem chama uma escolha que ele não deve ter.
 */
export async function modeloConfirmadoDaRota(
  origemNorm: string,
  destinoNorm: string,
): Promise<number | null> {
  const [linha] = await db
    .select({ cod: preSmRouteModels.codModelo })
    .from(preSmRouteModels)
    .where(
      and(
        eq(preSmRouteModels.origemNorm, origemNorm),
        eq(preSmRouteModels.destinoNorm, destinoNorm),
        isNotNull(preSmRouteModels.confirmadoEm),
      ),
    )
    .limit(1);
  return linha?.cod ?? null;
}

/**
 * AS ROTAS QUE A CARGA VAI TENTAR CASAR — os pares distintos que as viagens realmente têm.
 *
 * ── POR QUE DAQUI, E NÃO DA TABELA `lanes` ────────────────────────────────────────────────────
 *
 * `lanes` é a malha comercial; a criação da Pré-SM lê `locations.name` pelo `origin_location_id` da
 * VIAGEM (ver `pre-sm-dados.ts`). Propor a partir da malha e buscar a partir da viagem faria a
 * carga gravar com uma chave e a busca procurar por outra — e nenhuma rota casaria, **sem nenhum
 * erro aparecer**. A mesma fonte dos dois lados é o que impede isso.
 *
 * ── A JANELA SÓ LIMITA ESTA RODADA, NÃO A TABELA ──────────────────────────────────────────────
 *
 * Rota que não rodou no período não é proposta agora. Como a gravação é `DO NOTHING` e a carga é
 * repetível, uma rota sazonal entra na rodada seguinte em que ela aparecer — as linhas se acumulam.
 * O ganho é a lista de conferência ficar do tamanho do trabalho real, e não do histórico inteiro.
 */
export async function rotasParaCorrespondencia(
  diasParaTras = 90,
): Promise<{ origem: string; destino: string; viagens: number }[]> {
  const linhas = await db.execute<{ origem: string; destino: string; viagens: number }>(sql`
    select o.name as origem, d.name as destino, count(*)::int as viagens
    from trips t
    join locations o on o.id = t.origin_location_id
    join locations d on d.id = t.destination_location_id
    where t.created_at >= now() - make_interval(days => ${diasParaTras})
    group by o.name, d.name
    -- As de maior volume primeiro: se a conferência for feita pela metade, que a metade feita seja
    -- a que carrega mais viagem.
    order by viagens desc
  `);

  return [...linhas];
}
