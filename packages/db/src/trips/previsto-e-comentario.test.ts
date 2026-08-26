import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tripComments, tripPrevisto } from "../../schema";

/**
 * A MIGRAÇÃO E O SCHEMA PRECISAM CONCORDAR (2026-08-26, a pedido).
 *
 * Neste repositório a migração é escrita À MÃO — `drizzle-kit generate` não serve, porque o journal
 * tem quase cinquenta entradas e ele diffa contra um snapshot antigo, recriando tabelas de
 * produção. O preço dessa escolha é que nada, sozinho, obriga o SQL e o schema a dizerem a mesma
 * coisa: são duas declarações independentes, e o drizzle acredita na segunda.
 *
 * ── COMO ISSO QUEBRA DE VERDADE ───────────────────────────────────────────────────────────────
 *
 * Uma coluna que existe no schema e não na migração passa em todo teste unitário e falha na
 * primeira consulta contra o banco de produção — depois do deploy, longe de quem escreveu.
 *
 * Uma TRAVA que existe só num dos lados é pior, porque não falha: o `trip_previsto_algo_ck` é o que
 * impede uma linha de previsto vazia, e sem ele a tela mostraria "Previsto" apontando para nada.
 *
 * Este teste não substitui rodar a migração. Ele pega o esquecimento, que é o erro comum.
 */
describe("a migração 0050 e o schema", () => {
  const sql = readFileSync(
    join(__dirname, "../../migrations/0050_previsto_e_comentario.sql"),
    "utf8",
  );

  /**
   * Os nomes de coluna que o drizzle vai usar na consulta — a verdade do lado do código.
   *
   * O filtro por `columnType` não é zelo: a tabela do drizzle carrega junto o método `enableRLS`,
   * que também tem `.name`, e sem ele o teste procuraria uma coluna chamada "enableRLS" na
   * migração — falhando por um motivo que não tem nada a ver com o que ele existe para provar.
   */
  const colunasDe = (tabela: object): string[] =>
    Object.values(tabela)
      .filter(
        (c): c is { name: string } =>
          typeof c === "object" && c !== null && "columnType" in c && "name" in c,
      )
      .map((c) => c.name);

  it("cria as duas tabelas", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "trip_previsto"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "trip_comments"');
  });

  it("toda coluna do schema existe na migração", () => {
    for (const coluna of colunasDe(tripPrevisto)) {
      expect(sql, `trip_previsto.${coluna} não está na migração`).toContain(`"${coluna}"`);
    }
    for (const coluna of colunasDe(tripComments)) {
      expect(sql, `trip_comments.${coluna} não está na migração`).toContain(`"${coluna}"`);
    }
  });

  /**
   * A trava que impede o previsto vazio.
   *
   * Sem ela a tela mostraria o selo "Previsto" ao lado de nada — e ninguém saberia se aquilo é um
   * defeito ou alguém que apagou pela metade. Quem limpa os dois campos está desmarcando, e o
   * caminho para isso é a linha sair, não ficar vazia.
   */
  it("trava o previsto vazio no banco, e não só no código", () => {
    expect(sql).toContain('"trip_previsto_algo_ck"');
    expect(sql).toContain("portal_driver_id");
    expect(sql).toContain("placa");
  });

  it("trava o comentário em branco", () => {
    expect(sql).toContain('"trip_comments_texto_ck"');
    expect(sql).toMatch(/btrim\("texto"\)\s*<>\s*''/);
  });

  /**
   * O índice é `(trip_id, criado_em DESC)`, e o par importa.
   *
   * As duas leituras que existem são "os comentários desta viagem, do mais recente" e "quantos tem
   * cada uma das centenas de linhas da programação". Por `trip_id` sozinho, a contagem da tela
   * ordenaria em memória a cada carga — e a tela recarrega sozinha.
   */
  it("indexa por viagem E por data", () => {
    expect(sql).toMatch(
      /"trip_comments_trip_idx"\s*\r?\n?\s*ON "trip_comments" \("trip_id", "criado_em" DESC\)/,
    );
  });

  /**
   * A cascata na VIAGEM é obrigatória; no AUTOR, proibida.
   *
   * A varredura de retiradas APAGA viagem que sumiu do portal. Sem a cascata, ela falharia com
   * violação de chave estrangeira e a limpeza inteira travaria por causa de um recado.
   *
   * No autor é o contrário: um comentário sem dono seria pior que um comentário de alguém que saiu
   * da empresa. A conversa precisa continuar dizendo quem falou.
   */
  it("cascateia pela viagem e não pelo autor", () => {
    expect(sql).toMatch(/"trip_id" uuid[^,]*REFERENCES "trips"\("id"\) ON DELETE CASCADE/);
    const autor = sql.match(/"autor_user_id"[^,]*/)?.[0] ?? "";
    expect(autor).toContain('REFERENCES "users"("id")');
    expect(autor).not.toContain("CASCADE");
  });
});
