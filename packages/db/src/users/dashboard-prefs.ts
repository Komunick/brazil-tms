import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { userDashboardPrefs } from "../../schema";

/**
 * O painel de cada usuário: leitura e gravação do que ele escondeu (2026-08-23, a pedido).
 *
 * Só o desvio é guardado — o porquê está em `schemas/dashboard-prefs.ts` no `shared`, junto da
 * armadilha que essa escolha evita (cartão novo sumindo em silêncio para quem já personalizou).
 */

/** Teto de chaves por usuário. O mesmo do schema Zod, repetido aqui porque o banco é a última porta. */
const TETO_DE_CHAVES = 60;

/** Quem nunca personalizou não tem linha, e isso é o padrão: nada escondido. */
export async function readDashboardHidden(userId: string): Promise<string[]> {
  const [linha] = await db
    .select({ hidden: userDashboardPrefs.hiddenCards })
    .from(userDashboardPrefs)
    .where(eq(userDashboardPrefs.userId, userId))
    .limit(1);
  return linha?.hidden ?? [];
}

/**
 * Grava a lista inteira, não um item de cada vez.
 *
 * A tela manda o estado final do que está escondido, e é o que fica: sem `add`/`remove` não existe
 * o caso de duas abas abertas somarem uma escolha que ninguém fez. A última gravação vence, que é o
 * comportamento que qualquer pessoa espera de uma preferência de tela.
 *
 * Devolve o que REALMENTE ficou guardado (aparado e sem repetição), para a tela não seguir achando
 * que gravou algo diferente.
 */
export async function writeDashboardHidden(userId: string, hidden: string[]): Promise<string[]> {
  const limpo = [...new Set(hidden.map((c) => c.trim()).filter((c) => c !== ""))].slice(
    0,
    TETO_DE_CHAVES,
  );
  await db
    .insert(userDashboardPrefs)
    .values({ userId, hiddenCards: limpo })
    .onConflictDoUpdate({
      target: userDashboardPrefs.userId,
      set: { hiddenCards: limpo, updatedAt: sql`now()` },
    });
  return limpo;
}
