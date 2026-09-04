import { sql } from "drizzle-orm";
import { db } from "../client";
import { tripProgramacao, type StatusDaProgramacao } from "../../schema";

/**
 * O QUE A OPERAÇÃO DECIDIU SOBRE A VIAGEM — ler e gravar (2026-08-26, a pedido).
 *
 * Duas decisões numa linha por viagem: o PREVISTO (quem vai dirigir, antes de a ordem existir) e o
 * STATUS (a enviar, enviado, prog OK, no show). O porquê de morarem juntas, e de o previsto não ser
 * `trip_assignments`, está em `schema/trip-programacao.ts`.
 *
 * ── AS DUAS GRAVAÇÕES SÃO SEPARADAS, DE PROPÓSITO ─────────────────────────────────────────────
 *
 * `salvarPrevisto` e `marcarStatus` escrevem na mesma linha e não se atropelam: cada uma toca só as
 * suas colunas. Uma função só, que recebesse tudo, obrigaria a tela a mandar o previsto ao mudar o
 * status — e o dia em que ela mandasse `undefined` por engano apagaria o previsto de alguém.
 */

export interface ProgramacaoDaViagem {
  tripId: string;
  portalDriverId: string | null;
  /** O nome resolvido no cadastro, para a tela não ter de traduzir o id. `null` = não achamos. */
  motorista: string | null;
  placa: string | null;
  definidoPor: string | null;
  atualizadoEm: string;
  status: StatusDaProgramacao | null;
  statusPor: string | null;
  statusEm: string | null;
}

/**
 * O NOME SAI DO CADASTRO NA HORA DA LEITURA, e não de uma cópia guardada.
 *
 * Guardar o nome junto seria mais barato e ficaria velho: o motorista que troca de nome no portal
 * apareceria com o antigo para sempre, e ninguém saberia de onde aquilo veio. `portal_driver_id` é
 * a chave estável; o nome é derivado, e derivado se lê.
 *
 * Os três `left join` porque nenhum dos lados é garantido: o motorista pode ter sumido do espelho,
 * e os usuários podem ter sido removidos. Uma linha sem nome ainda é útil.
 */
export async function lerProgramacaoDaViagem(tripId: string): Promise<ProgramacaoDaViagem | null> {
  const linhas = await db.execute<{
    trip_id: string;
    portal_driver_id: string | null;
    motorista: string | null;
    placa: string | null;
    definido_por: string | null;
    atualizado_em: Date;
    status: string | null;
    status_por: string | null;
    status_em: Date | null;
  }>(sql`
    select p.trip_id, p.portal_driver_id, d.name as motorista, p.placa,
           u.name as definido_por, p.atualizado_em,
           p.status, us.name as status_por, p.status_em
      from trip_programacao p
      left join drivers d on d.portal_driver_id = p.portal_driver_id
      left join users u  on u.id = p.definido_por_user_id
      left join users us on us.id = p.status_por_user_id
     where p.trip_id = ${tripId}
  `);
  const r = linhas[0];
  if (!r) return null;
  return {
    tripId: r.trip_id,
    portalDriverId: r.portal_driver_id,
    motorista: r.motorista,
    placa: r.placa,
    definidoPor: r.definido_por,
    atualizadoEm: new Date(r.atualizado_em).toISOString(),
    status: (r.status as StatusDaProgramacao | null) ?? null,
    statusPor: r.status_por,
    statusEm: r.status_em ? new Date(r.status_em).toISOString() : null,
  };
}

/**
 * Grava o previsto, ou o LIMPA quando os dois campos vêm vazios.
 *
 * Limpar não apaga a linha quando há status: apagá-lo junto seria desfazer uma decisão que a pessoa
 * não tomou. A linha que fica sem NADA, essa sim, sai.
 */
export async function salvarPrevisto(
  tripId: string,
  userId: string,
  dados: { portalDriverId?: string | null; placa?: string | null },
): Promise<void> {
  const motorista = limpar(dados.portalDriverId);
  const placa = limpar(dados.placa);

  if (motorista === null && placa === null) {
    /**
     * APAGAR VEM ANTES DE LIMPAR, e a ordem é a correção.
     *
     * O caminho ingênuo é um UPDATE pondo tudo em `null`. Ele FALHA quando não há status: o CHECK
     * `trip_programacao_algo_ck` recusa a linha vazia, e a pessoa recebe um erro de banco por ter
     * apagado um campo — o gesto mais inofensivo da tela.
     *
     * Primeiro o DELETE leva a linha que ficaria vazia; o UPDATE seguinte só encontra as que têm
     * status, e nessas o CHECK passa. Duas instruções, nenhuma condição no código.
     */
    await db.execute(sql`
      delete from trip_programacao
       where trip_id = ${tripId} and status is null and sm is null and cte is null
    `);
    await db.execute(sql`
      update trip_programacao
         set portal_driver_id = null, placa = null, definido_por_user_id = null,
             atualizado_em = now()
       where trip_id = ${tripId}
    `);
    return;
  }

  await db
    .insert(tripProgramacao)
    .values({ tripId, portalDriverId: motorista, placa, definidoPorUserId: userId })
    .onConflictDoUpdate({
      target: tripProgramacao.tripId,
      set: {
        portalDriverId: motorista,
        placa,
        // Quem regrava passa a ser o dono da previsão: a tela mostra quem decidiu por último, que é
        // a quem se pergunta quando ela não bate com o que aconteceu.
        definidoPorUserId: userId,
        atualizadoEm: sql`now()`,
      },
    });
}

/**
 * Marca o status — ou o tira, com `null`.
 *
 * Tirar é clicar de novo no que já estava marcado; a tela trata isso e manda `null`. Não existe um
 * quinto valor "sem status" de propósito: ausência é ausência, e inventar um valor para ela criaria
 * duas formas de dizer a mesma coisa no banco.
 */
export async function marcarStatus(
  tripId: string,
  userId: string,
  status: StatusDaProgramacao | null,
): Promise<void> {
  if (status === null) {
    // Mesma ordem de `salvarPrevisto`, e pela mesma razão: o DELETE leva a linha que ficaria vazia,
    // e o UPDATE só alcança as que ainda têm previsto.
    await db.execute(sql`
      delete from trip_programacao
       where trip_id = ${tripId}
         and nullif(btrim(portal_driver_id), '') is null
         and nullif(btrim(placa), '') is null
         and sm is null
         and cte is null
    `);
    await db.execute(sql`
      update trip_programacao
         set status = null, status_por_user_id = null, status_em = null
       where trip_id = ${tripId}
    `);
    return;
  }

  await db
    .insert(tripProgramacao)
    .values({ tripId, status, statusPorUserId: userId, statusEm: sql`now()` })
    .onConflictDoUpdate({
      target: tripProgramacao.tripId,
      set: { status, statusPorUserId: userId, statusEm: sql`now()` },
    });
}

/** `""` e `"   "` são ausência, não valor — a trava do banco os recusaria mais adiante. */
function limpar(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * Marca a SM da viagem — sim, não, ou limpa (2026-08-31, a pedido).
 *
 * ── A MESMA FORMA DE `marcarStatus`, E PELA MESMA RAZÃO ───────────────────────────────────────
 *
 * Limpar (`null`) apaga a linha se ela ficaria sem NADA — sem previsto, sem placa e sem status —,
 * porque uma linha que não diz nada é uma linha que a trava do banco recusa. Com qualquer outra
 * coisa presente, só o campo da SM é zerado.
 *
 * ── E OS OUTROS DOIS CAMINHOS DE LIMPEZA GANHARAM `and sm is null` ────────────────────────────
 *
 * `salvarPrevisto` e `marcarStatus` apagavam a linha quando o resto estava vazio. Sem essa condição,
 * limpar o status de uma viagem apagaria junto uma SM marcada — e ninguém ligaria uma coisa à outra:
 * a pessoa tirou o "Enviado" e o "SM: Sim" sumiu.
 */
export async function marcarSm(tripId: string, userId: string, sm: boolean | null): Promise<void> {
  if (sm === null) {
    await db.execute(sql`
      delete from trip_programacao
       where trip_id = ${tripId}
         and nullif(btrim(portal_driver_id), '') is null
         and nullif(btrim(placa), '') is null
         and status is null
         and cte is null
    `);
    await db.execute(sql`
      update trip_programacao
         set sm = null, sm_por_user_id = null, sm_em = null
       where trip_id = ${tripId}
    `);
    return;
  }

  await db
    .insert(tripProgramacao)
    .values({ tripId, sm, smPorUserId: userId, smEm: sql`now()` })
    .onConflictDoUpdate({
      target: tripProgramacao.tripId,
      set: { sm, smPorUserId: userId, smEm: sql`now()` },
    });
}

/**
 * O CTE FOI EMITIDO? — a terceira marcação da linha (2026-09-04, a pedido).
 *
 * Irmã de `marcarSm` em tudo: mesmos três estados, mesma limpeza, mesma trava de linha vazia. Se um
 * dia as duas divergirem, é sinal de que uma delas foi mexida sem a outra.
 *
 * ── E OS OUTROS TRÊS CAMINHOS DE LIMPEZA GANHARAM `and cte is null` ───────────────────────────
 *
 * Pelo mesmo motivo que já valia para o SM: sem essa condição, limpar o status de uma viagem
 * apagaria junto um CTE marcado — e ninguém ligaria uma coisa à outra. A pessoa tira o "Enviado" e o
 * V do CTE some.
 */
export async function marcarCte(
  tripId: string,
  userId: string,
  cte: boolean | null,
): Promise<void> {
  if (cte === null) {
    await db.execute(sql`
      delete from trip_programacao
       where trip_id = ${tripId}
         and nullif(btrim(portal_driver_id), '') is null
         and nullif(btrim(placa), '') is null
         and status is null
         and sm is null
    `);
    await db.execute(sql`
      update trip_programacao
         set cte = null, cte_por_user_id = null, cte_em = null
       where trip_id = ${tripId}
    `);
    return;
  }

  await db
    .insert(tripProgramacao)
    .values({ tripId, cte, ctePorUserId: userId, cteEm: sql`now()` })
    .onConflictDoUpdate({
      target: tripProgramacao.tripId,
      set: { cte, ctePorUserId: userId, cteEm: sql`now()`, atualizadoEm: sql`now()` },
    });
}
