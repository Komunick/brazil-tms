import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../client";
import { writeAudit } from "../audit/write-audit";
import { preSmCityLinks } from "../../schema";

/**
 * A PONTE ESTAÇÃO → CIDADE, e quem pode atravessá-la (2026-08-26, fatia 027).
 *
 * A carga PROPÕE; uma pessoa CONFIRMA; só linha confirmada vale para criar Pré-SM.
 *
 * ── POR QUE A CONFERÊNCIA HUMANA NÃO É BUROCRACIA ─────────────────────────────────────────────
 *
 * O casamento sai do NOME da estação — `SOC_MG_BETIM` vira `MG · BETIM` — e tolera sufixo de bairro
 * ou distrito descartando termos do fim. Quando erra, **erra apontando para OUTRA cidade**, não em
 * branco: `RECIFE MURIBECA` poderia cair em `RECIFE` mesmo se Muribeca fosse município próprio.
 *
 * Uma Pré-SM com a cidade errada é escolta contratada para um trajeto que o caminhão não vai fazer.
 *
 * ── ESTE ARQUIVO É IRMÃO DE `pre-sm-rotas.ts` ─────────────────────────────────────────────────
 *
 * Mesmo formato, mesma regra, tabela separada. São **dois** casos, e o princípio I da constituição
 * manda esperar o terceiro antes de generalizar: uma "tabela de correspondências" com coluna de
 * tipo economizaria dez linhas e custaria um `where` em toda consulta.
 */

export interface CorrespondenciaDaCidade {
  id: string;
  estacaoNorm: string;
  uf: string;
  cidadeNome: string;
  codIbge: number;
  descricao: string;
  confirmadoEm: string | null;
}

/**
 * Grava as propostas da carga, sem confirmar nenhuma.
 *
 * `DO NOTHING` em conflito, e **nunca** `DO UPDATE`: se a estação já existe, ou alguém a confirmou —
 * e sobrescrever apagaria a conferência dela — ou está esperando conferência, e a proposta nova é a
 * mesma. Em nenhum dos dois casos o certo é mexer.
 *
 * A exceção legítima — o cadastro mudou na gerenciadora — é trabalho de tela, com a pessoa vendo o
 * que está trocando.
 */
export async function gravarPropostasDeCidade(
  propostas: readonly {
    estacaoNorm: string;
    uf: string;
    cidadeNome: string;
    codIbge: number;
    descricao: string;
  }[],
): Promise<{ novas: number }> {
  if (propostas.length === 0) return { novas: 0 };

  const linhas = await db
    .insert(preSmCityLinks)
    .values(propostas.map((p) => ({ ...p })))
    .onConflictDoNothing({ target: [preSmCityLinks.estacaoNorm] })
    .returning({ id: preSmCityLinks.id });

  return { novas: linhas.length };
}

/** Tudo, para a tela — as não confirmadas primeiro, que são o trabalho pendente. */
export async function listarCorrespondenciasDeCidade(): Promise<CorrespondenciaDaCidade[]> {
  const linhas = await db
    .select()
    .from(preSmCityLinks)
    .orderBy(sql`${preSmCityLinks.confirmadoEm} nulls first`, preSmCityLinks.estacaoNorm);

  return linhas.map((l) => ({
    id: l.id,
    estacaoNorm: l.estacaoNorm,
    uf: l.uf,
    cidadeNome: l.cidadeNome,
    codIbge: l.codIbge,
    descricao: l.descricao,
    confirmadoEm: l.confirmadoEm?.toISOString() ?? null,
  }));
}

/**
 * Confirma (ou desfaz) uma correspondência — é o que a faz valer.
 *
 * A auditoria vai na MESMA transação da mudança, e não na rota que chama. Confirmar autoriza gasto:
 * a gerenciadora cobra por solicitação. Um registro que pode falhar depois do `update` deixaria
 * exatamente o rastro que importa faltando justamente quando alguém for procurá-lo.
 *
 * Desfazer existe porque conferência é feita por gente e gente erra. Sem isso, uma confirmação
 * equivocada só se corrige direto no banco — e aí ninguém corrige.
 */
export async function definirConfirmacaoDaCidade(entrada: {
  id: string;
  confirmar: boolean;
  actorUserId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx
      .update(preSmCityLinks)
      .set({
        confirmadoEm: entrada.confirmar ? new Date() : null,
        atualizadoEm: new Date(),
      })
      .where(
        and(
          eq(preSmCityLinks.id, entrada.id),
          // O `where` exige o estado OPOSTO: confirmar o que já está confirmado devolve `false` em
          // vez de gravar uma auditoria de mudança que não houve.
          entrada.confirmar
            ? sql`${preSmCityLinks.confirmadoEm} is null`
            : isNotNull(preSmCityLinks.confirmadoEm),
        ),
      )
      .returning({ id: preSmCityLinks.id });

    if (r.length === 0) return false;

    await writeAudit(tx, {
      actorUserId: entrada.actorUserId,
      action: entrada.confirmar ? "pre_sm.cidade.confirmar" : "pre_sm.cidade.desconfirmar",
      entityType: "pre_sm_city_link",
      entityId: entrada.id,
      previousValue: { confirmado: !entrada.confirmar },
      newValue: { confirmado: entrada.confirmar },
    });
    return true;
  });
}

/**
 * O IBGE que VALE para esta estação — a única leitura que a criação da Pré-SM pode usar.
 *
 * `confirmadoEm is not null` é a trava, e ela está AQUI, não em quem chama: uma verificação que mora
 * no chamador é uma verificação que o próximo chamador esquece.
 *
 * Devolve `null` para estação sem correspondência E para correspondência ainda não conferida. Os
 * dois viram o mesmo desfecho — a Pré-SM não é criada e a fila diz por quê —, e distingui-los aqui
 * daria a quem chama uma escolha que ele não deve ter.
 */
export async function ibgeConfirmadoDaEstacao(estacaoNorm: string): Promise<number | null> {
  const [linha] = await db
    .select({ cod: preSmCityLinks.codIbge })
    .from(preSmCityLinks)
    .where(
      and(
        eq(preSmCityLinks.estacaoNorm, estacaoNorm),
        isNotNull(preSmCityLinks.confirmadoEm),
      ),
    )
    .limit(1);
  return linha?.cod ?? null;
}
