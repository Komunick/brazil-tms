import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { tripPrevisto } from "../../schema";

/**
 * O PREVISTO DE UMA VIAGEM — ler, gravar e desmarcar (2026-08-26, a pedido).
 *
 * É a intenção de quem monta o dia, guardada antes de a atribuição existir. O porquê de ela morar
 * numa tabela própria, e não em `trip_assignments`, está em `schema/trip-previsto.ts` — em resumo:
 * a escala interna foi retirada desta tela justamente por gravar aqui e não ir ao portal, e repor
 * o mesmo dado no mesmo lugar recriaria o mesmo engano.
 */

export interface Previsto {
  tripId: string;
  portalDriverId: string | null;
  /** O nome resolvido no cadastro, para a tela não ter de traduzir o id. `null` = não achamos. */
  motorista: string | null;
  placa: string | null;
  definidoPorUserId: string;
  definidoPor: string | null;
  atualizadoEm: string;
}

/**
 * O NOME SAI DO CADASTRO NA HORA DA LEITURA, e não de uma cópia guardada.
 *
 * Guardar o nome junto seria mais barato e ficaria velho: o motorista que troca de nome no portal
 * apareceria com o antigo para sempre, e ninguém saberia de onde aquilo veio. `portal_driver_id` é
 * a chave estável; o nome é derivado, e derivado se lê.
 *
 * `left join` nos dois lados porque nenhum dos dois é garantido: o motorista pode ter sumido do
 * espelho, e o usuário que definiu pode ter sido removido. Um previsto sem nome ainda é útil — a
 * placa continua ali.
 */
export async function lerPrevisto(tripId: string): Promise<Previsto | null> {
  const linhas = await db.execute<{
    trip_id: string;
    portal_driver_id: string | null;
    motorista: string | null;
    placa: string | null;
    definido_por_user_id: string;
    definido_por: string | null;
    atualizado_em: Date;
  }>(sql`
    select p.trip_id, p.portal_driver_id, d.name as motorista, p.placa,
           p.definido_por_user_id, u.name as definido_por, p.atualizado_em
      from trip_previsto p
      left join drivers d on d.portal_driver_id = p.portal_driver_id
      left join users u on u.id = p.definido_por_user_id
     where p.trip_id = ${tripId}
  `);
  const r = linhas[0];
  if (!r) return null;
  return {
    tripId: r.trip_id,
    portalDriverId: r.portal_driver_id,
    motorista: r.motorista,
    placa: r.placa,
    definidoPorUserId: r.definido_por_user_id,
    definidoPor: r.definido_por,
    atualizadoEm: new Date(r.atualizado_em).toISOString(),
  };
}

/**
 * Grava o previsto, ou o APAGA quando os dois campos vêm vazios.
 *
 * Desmarcar é o mesmo gesto de marcar com tudo em branco — é assim que a tela pensa, e obrigar a
 * pessoa a achar um botão separado de "remover" seria inventar um passo. Quem apaga tudo está
 * desmarcando, e o banco recusaria a linha vazia de qualquer forma (`trip_previsto_algo_ck`).
 *
 * Devolve `true` quando ficou algo gravado, `false` quando a linha saiu.
 */
export async function salvarPrevisto(
  tripId: string,
  userId: string,
  dados: { portalDriverId?: string | null; placa?: string | null },
): Promise<boolean> {
  const motorista = limpar(dados.portalDriverId);
  const placa = limpar(dados.placa);

  if (motorista === null && placa === null) {
    await db.delete(tripPrevisto).where(eq(tripPrevisto.tripId, tripId));
    return false;
  }

  await db
    .insert(tripPrevisto)
    .values({ tripId, portalDriverId: motorista, placa, definidoPorUserId: userId })
    .onConflictDoUpdate({
      target: tripPrevisto.tripId,
      set: {
        portalDriverId: motorista,
        placa,
        // Quem regrava passa a ser o dono da previsão: a tela mostra quem decidiu por último, que é
        // a quem se pergunta quando ela não bate com o que aconteceu.
        definidoPorUserId: userId,
        atualizadoEm: sql`now()`,
      },
    });
  return true;
}

/** `""` e `"   "` são ausência, não valor — a trava do banco os recusaria mais adiante. */
function limpar(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
