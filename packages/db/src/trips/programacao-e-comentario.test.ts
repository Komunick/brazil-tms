import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STATUS_DA_PROGRAMACAO } from "@brazil-tms/shared";
import { tripComments, tripProgramacao } from "../../schema";

/**
 * A MIGRAÇÃO E O SCHEMA PRECISAM CONCORDAR (2026-08-26, a pedido).
 *
 * Neste repositório a migração é escrita À MÃO — `drizzle-kit generate` não serve, porque o journal
 * tem mais de cinquenta entradas e ele diffa contra um snapshot antigo, recriando tabelas de
 * produção. O preço dessa escolha é que nada, sozinho, obriga o SQL e o schema a dizerem a mesma
 * coisa: são duas declarações independentes, e o drizzle acredita na segunda.
 *
 * ── COMO ISSO QUEBRA DE VERDADE ───────────────────────────────────────────────────────────────
 *
 * Uma coluna que existe no schema e não na migração passa em todo teste unitário e falha na
 * primeira consulta contra o banco de produção — depois do deploy, longe de quem escreveu.
 *
 * Uma TRAVA que existe só num dos lados é pior, porque não falha: o `trip_programacao_algo_ck` é o
 * que impede uma linha vazia, e sem ele a tela mostraria "Previsto" apontando para nada.
 *
 * ── AS DUAS MIGRAÇÕES SÃO LIDAS JUNTAS ────────────────────────────────────────────────────────
 *
 * A tabela nasceu na `0050` como `trip_previsto` e ganhou o status na `0051`, que a renomeou. A
 * forma final é a soma das duas, e conferir só uma acusaria falta do que a outra fez.
 *
 * Este teste não substitui rodar a migração. Ele pega o esquecimento, que é o erro comum.
 */
describe("as migrações da programação e o schema", () => {
  /*
    A `0061` entrou em 31/08 com a SM; a `0065` em 04/09 com o CTE. Ler todas juntas é o que mantém a
    afirmação verdadeira: o teste diz "toda coluna do schema existe nas migrações", e sem a nova ele
    passaria a acusar como ausente uma coluna que existe — ensinando quem vier depois a desconfiar
    dele.

    QUEM ACRESCENTAR COLUNA A ESTA TABELA acrescenta a migração aqui. O teste falha primeiro com a
    mensagem certa ("cte não está nas migrações"), e é assim que ele avisa.
  */
  const migracoes = [
    "0050_previsto_e_comentario",
    "0051_status_da_programacao",
    "0061_sm_da_programacao",
    "0065_cte_da_programacao",
  ]
    .map((tag) => readFileSync(join(__dirname, `../../migrations/${tag}.sql`), "utf8"))
    .join("\n");

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

  it("cria as duas tabelas, e renomeia a que mudou de nome", () => {
    expect(migracoes).toContain('CREATE TABLE IF NOT EXISTS "trip_previsto"');
    expect(migracoes).toContain('ALTER TABLE "trip_previsto" RENAME TO "trip_programacao"');
    expect(migracoes).toContain('CREATE TABLE IF NOT EXISTS "trip_comments"');
  });

  it("toda coluna do schema existe nas migrações", () => {
    for (const coluna of colunasDe(tripProgramacao)) {
      expect(migracoes, `trip_programacao.${coluna} não está nas migrações`).toContain(
        `"${coluna}"`,
      );
    }
    for (const coluna of colunasDe(tripComments)) {
      expect(migracoes, `trip_comments.${coluna} não está nas migrações`).toContain(`"${coluna}"`);
    }
  });

  /**
   * A LISTA DE STATUS ESTÁ DECLARADA EM TRÊS LUGARES, e é o preço de o banco também precisar saber.
   *
   * O valor em `@brazil-tms/shared` (que a tela lê), o `$type` do schema, e o CHECK em SQL. Os dois
   * primeiros o compilador amarra; o terceiro, não — e um status novo que entrasse só no código
   * seria recusado pelo banco na hora de gravar, com um erro que não diz o que houve.
   */
  it("o CHECK do banco lista exatamente os mesmos status do código", () => {
    const check = migracoes.match(/"trip_programacao_status_ck" CHECK \([\s\S]*?\);/)?.[0] ?? "";
    expect(check).not.toBe("");
    for (const s of STATUS_DA_PROGRAMACAO) {
      expect(check, `${s} não está no CHECK`).toContain(`'${s}'`);
    }
    // E o contrário: nada no CHECK que o código não conheça.
    const noCheck = [...check.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);
    for (const s of noCheck) {
      expect(
        STATUS_DA_PROGRAMACAO as readonly string[],
        `${s} está no CHECK e não no código`,
      ).toContain(s);
    }
  });

  /**
   * A trava que impede a linha vazia — e ela teve de CRESCER na 0051.
   *
   * Antes dizia "tem motorista ou placa". Agora o status também é motivo para a linha existir, e é
   * o caso mais comum: o portal já escalou alguém, e o que falta registrar é o que a operação fez.
   * Sem esta troca, marcar só o status seria recusado pelo banco.
   */
  it("a trava de linha vazia aceita o status como motivo de existir", () => {
    const algo = migracoes.lastIndexOf('"trip_programacao_algo_ck" CHECK');
    expect(algo).toBeGreaterThan(-1);
    const trecho = migracoes.slice(algo, algo + 300);
    expect(trecho).toContain("portal_driver_id");
    expect(trecho).toContain("placa");
    expect(trecho).toContain('"status" IS NOT NULL');
  });

  it("trava o comentário em branco", () => {
    expect(migracoes).toContain('"trip_comments_texto_ck"');
    expect(migracoes).toMatch(/btrim\("texto"\)\s*<>\s*''/);
  });

  /**
   * O índice é `(trip_id, criado_em DESC)`, e o par importa.
   *
   * As duas leituras que existem são "os comentários desta viagem, do mais recente" e "quantos tem
   * cada uma das centenas de linhas da programação". Por `trip_id` sozinho, a contagem da tela
   * ordenaria em memória a cada carga — e a tela recarrega sozinha.
   */
  it("indexa os comentários por viagem E por data", () => {
    expect(migracoes).toMatch(
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
    expect(migracoes).toMatch(/"trip_id" uuid[^,]*REFERENCES "trips"\("id"\) ON DELETE CASCADE/);
    const autor = migracoes.match(/"autor_user_id"[^,]*/)?.[0] ?? "";
    expect(autor).toContain('REFERENCES "users"("id")');
    expect(autor).not.toContain("CASCADE");
  });

  /**
   * `definido_por_user_id` PRECISOU perder o NOT NULL na 0051.
   *
   * Ele existia porque só havia previsto, e previsto tem dono. Agora uma linha pode nascer só com
   * status — e aí quem tem dono é o status. Manter o NOT NULL obrigaria a gravar um dono de
   * previsto que não existe, e o INSERT do status falharia.
   */
  it("solta o NOT NULL do dono do previsto", () => {
    expect(migracoes).toContain('ALTER COLUMN "definido_por_user_id" DROP NOT NULL');
  });
});
