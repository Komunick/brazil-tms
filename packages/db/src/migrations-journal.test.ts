import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import journal from "../migrations/meta/_journal.json";

/**
 * TODA MIGRAÇÃO PRECISA ESTAR NO JOURNAL — e este teste existe porque a falta dela é MUDA.
 *
 * O que aconteceu em 30/08: a migração `0058` foi escrita à mão, como este repositório exige, e
 * ninguém a registrou no `meta/_journal.json`. O `drizzle-kit migrate` lê o JOURNAL, não a pasta:
 * viu 58 entradas, aplicou as 58 que já estavam aplicadas, e reportou SUCESSO.
 *
 * O deploy passou verde. A CI passou verde. O código foi para o ar esperando uma coluna que não
 * existia, e a única pista era um `select count(*)` no banco dizendo 58 onde havia 59 arquivos.
 *
 * ── POR QUE OS DOIS SENTIDOS ─────────────────────────────────────────────────────────────────
 *
 * Arquivo SEM journal é o erro acima: a migração nunca roda, e nada acusa.
 *
 * Journal SEM arquivo é o oposto e é pior: o drizzle procura um `.sql` que não existe e a migração
 * ESTOURA — mas só na máquina que ainda não a aplicou, o que geralmente é a produção, no deploy,
 * com todo mundo esperando.
 *
 * ── E A ORDEM ────────────────────────────────────────────────────────────────────────────────
 *
 * `idx` decide a sequência de aplicação. Duas entradas com o mesmo `idx`, ou um `idx` fora de
 * ordem, fazem uma migração rodar antes da tabela que ela altera existir.
 */
const DIR = join(__dirname, "..", "migrations");

describe("o journal das migrações", () => {
  const arquivos = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
  const tags = journal.entries.map((e) => e.tag);

  it("tem uma entrada para CADA arquivo .sql — sem isso a migração nunca roda", () => {
    expect(arquivos.filter((a) => !tags.includes(a))).toEqual([]);
  });

  it("não aponta para arquivo que não existe — isso quebra o deploy de quem ainda não migrou", () => {
    expect(tags.filter((t) => !arquivos.includes(t))).toEqual([]);
  });

  it("os idx são únicos e em ordem crescente", () => {
    const idx = journal.entries.map((e) => e.idx);
    expect(new Set(idx).size).toBe(idx.length);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});
