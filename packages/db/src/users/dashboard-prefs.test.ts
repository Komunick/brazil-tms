import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { userDashboardPrefs } from "../../schema";

/**
 * TODA COLUNA DE PREFERÊNCIA PRECISA SER GRAVADA — e uma não era (31/08).
 *
 * `programacao_prefs` existia na migração, existia no schema, era LIDA por `readDashboardPrefs` e a
 * tela mandava o valor a cada clique. `writeDashboardPrefs` simplesmente não a incluía no `insert`.
 *
 * ── POR QUE NADA ACUSOU ────────────────────────────────────────────────────────────────────────
 *
 * O `insert` do drizzle aceita um objeto PARCIAL: coluna omitida é coluna com o default, não erro de
 * tipo. E a interface `PainelGuardado` não declarava o campo, então o `...(prog ? {programacao} : {})`
 * da leitura passava por espalhamento — que não sofre a checagem de propriedade excedente.
 *
 * O desfecho foi o pior possível: a rota respondia `200` com um corpo SEM os filtros, e o cliente
 * adotava essa resposta como verdade. O filtro que a pessoa acabara de marcar se desfazia sozinho, e
 * não havia erro em lugar nenhum para ligar à causa. Medido no dia: `programacao_prefs` diferente de
 * `{}` em ZERO das 12 linhas de produção.
 *
 * ── POR QUE ESTE TESTE É SOBRE O TEXTO DO ARQUIVO ──────────────────────────────────────────────
 *
 * Porque o defeito É uma ausência, e ausência não tem tipo. A pergunta que precisa ser feita é "esta
 * coluna aparece na gravação?", e a única forma de fazê-la sem um banco é lendo a gravação. Vale a
 * feiura: a coluna seguinte que alguém acrescentar ao schema e esquecer aqui cai neste teste, em vez
 * de cair no uso de doze pessoas.
 */
describe("writeDashboardPrefs grava TODAS as colunas de preferência", () => {
  const fonte = readFileSync(join(__dirname, "dashboard-prefs.ts"), "utf8");
  const gravacao = fonte.slice(fonte.indexOf("export async function writeDashboardPrefs"));

  /** `user_id` é a chave e `updated_at` é carimbo — nenhum dos dois é preferência de ninguém. */
  const NAO_SAO_PREFERENCIA = new Set(["user_id", "updated_at"]);

  const colunas = Object.values(getTableColumns(userDashboardPrefs))
    .map((c) => c.name)
    .filter((nome) => !NAO_SAO_PREFERENCIA.has(nome));

  it("o schema tem as três colunas que a tela usa hoje", () => {
    // Guarda o próprio guarda: se alguém renomear as colunas, a lista abaixo esvazia e este arquivo
    // passaria a não afirmar nada — que é como um teste morre sem ninguém notar.
    expect(colunas.sort()).toEqual(["hidden_cards", "minimized_cards", "programacao_prefs"]);
  });

  it.each(colunas)("`%s` aparece na gravação", (coluna) => {
    /*
      Comparado pelo nome da PROPRIEDADE do drizzle (`programacaoPrefs`), que é o que o código
      escreve — a coluna em `snake_case` só aparece no schema e na migração.
    */
    const propriedade = coluna.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    expect(gravacao).toContain(propriedade);
  });

  it("grava nos DOIS caminhos: a linha nova e a que já existe", () => {
    /**
     * `onConflictDoUpdate` é o caminho de quase todo mundo — a linha nasce no primeiro clique e
     * todos os seguintes são atualização. Uma coluna presente só no `values` funcionaria uma vez por
     * pessoa e nunca mais, que é ainda mais difícil de reconhecer como defeito do que nunca gravar.
     */
    const set = gravacao.slice(gravacao.indexOf("onConflictDoUpdate"));
    for (const coluna of colunas) {
      const propriedade = coluna.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      expect(set).toContain(propriedade);
    }
  });
});
