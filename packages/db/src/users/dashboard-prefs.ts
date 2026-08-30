import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import type { ProgramacaoPrefs } from "@brazil-tms/shared";
import { userDashboardPrefs } from "../../schema";

/**
 * O painel de cada usuário: o que ele escondeu e o que deixou encolhido (2026-08-23).
 *
 * Só o desvio é guardado — o porquê está em `schemas/dashboard-prefs.ts` no `shared`, junto da
 * armadilha que essa escolha evita (cartão novo sumindo em silêncio para quem já personalizou).
 */

/** Teto de chaves por lista. O mesmo do schema Zod, repetido aqui porque o banco é a última porta. */
const TETO_DE_CHAVES = 60;

export interface PainelGuardado {
  hidden: string[];
  minimized: string[];
}

/** Quem nunca personalizou não tem linha, e isso é o padrão: nada escondido, nada encolhido. */
export async function readDashboardPrefs(userId: string): Promise<PainelGuardado> {
  const [linha] = await db
    .select({
      hidden: userDashboardPrefs.hiddenCards,
      minimized: userDashboardPrefs.minimizedCards,
      programacao: userDashboardPrefs.programacaoPrefs,
    })
    .from(userDashboardPrefs)
    .where(eq(userDashboardPrefs.userId, userId))
    .limit(1);
  /**
   * O jsonb vazio (`{}`, o default da coluna) vira `undefined`, e não um objeto de campos vazios.
   *
   * A distinção é o que faz a cancelada nascer escondida: um objeto com `status: []` diria "esta
   * pessoa escolheu não esconder nada", e o padrão seria perdido no primeiro carregamento.
   */
  const prog = linha?.programacao as ProgramacaoPrefs | undefined;
  return {
    hidden: linha?.hidden ?? [],
    minimized: linha?.minimized ?? [],
    ...(prog && Object.keys(prog).length > 0 ? { programacao: prog } : {}),
  };
}

function limpar(chaves: string[]): string[] {
  return [...new Set(chaves.map((c) => c.trim()).filter((c) => c !== ""))].slice(0, TETO_DE_CHAVES);
}

/**
 * Grava as listas inteiras, não um item de cada vez.
 *
 * A tela manda o estado final, e é o que fica: sem `add`/`remove` não existe o caso de duas abas
 * abertas somarem uma escolha que ninguém fez. A última gravação vence, que é o comportamento que
 * qualquer pessoa espera de uma preferência de tela.
 *
 * Devolve o que REALMENTE ficou guardado (aparado e sem repetição), para a tela não seguir achando
 * que gravou algo diferente.
 */
export async function writeDashboardPrefs(
  userId: string,
  entrada: PainelGuardado,
): Promise<PainelGuardado> {
  const limpo = { hidden: limpar(entrada.hidden), minimized: limpar(entrada.minimized) };
  await db
    .insert(userDashboardPrefs)
    .values({ userId, hiddenCards: limpo.hidden, minimizedCards: limpo.minimized })
    .onConflictDoUpdate({
      target: userDashboardPrefs.userId,
      set: {
        hiddenCards: limpo.hidden,
        minimizedCards: limpo.minimized,
        updatedAt: sql`now()`,
      },
    });
  return limpo;
}
