import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { linhaDeValores } from "./logae-positions";

/**
 * O PARÂMETRO DE DATA PRECISA SAIR COMO TEXTO ISO (2026-08-26, depois de quebrar em produção).
 *
 * ── O DEFEITO QUE ISTO PEGA ───────────────────────────────────────────────────────────────────
 *
 * A primeira versão passava o `Date` direto para o template do drizzle. O que chegava ao Postgres
 * era `Wed Aug 26 2026 17:23:02 GMT+0000 (Coordinated Universal Time)` — `toString()`, não ISO — e
 * o INSERT INTEIRO falhava. Não a linha: a instrução toda, com as 91 posições dentro.
 *
 * ── POR QUE NENHUM TESTE PEGOU ANTES ──────────────────────────────────────────────────────────
 *
 * Os testes do job usam mock do banco, e mock não serializa nada. A mesma consulta escrita à mão no
 * psql funcionava. Só a combinação drizzle + `Date` quebrava — e o erro do drizzle mostra a
 * consulta e os parâmetros mas ESCONDE a mensagem do Postgres, que fica em `.cause`.
 *
 * ── E POR QUE ESTE NÃO PRECISA DE BANCO ───────────────────────────────────────────────────────
 *
 * Porque o defeito acontece ANTES do banco, na hora de montar os parâmetros. `PgDialect` compila o
 * fragmento sem conexão nenhuma, e o que ele devolve é exatamente o que iria pelo fio. Um teste de
 * integração também pegaria, mas só rodaria em máquina com `DATABASE_URL` — este roda na CI.
 */
describe("linhaDeValores", () => {
  const dialeto = new PgDialect();
  const base = {
    placa: "ABC1D23",
    latitude: -23.5505,
    longitude: -46.6333,
    cidade: "SAO PAULO",
    uf: "SP",
    cpfMotorista: "08004345441",
    ignicao: "L",
    referencia: "2.19 km de algum lugar",
    velocidade: 78,
    tipoRastreador: "RA",
    distUltPosicao: 12.4,
  };

  it("manda a data como ISO, e nunca como Date", () => {
    const quando = new Date("2026-08-26T17:23:02.000Z");
    const { params } = dialeto.sqlToQuery(linhaDeValores({ ...base, posicaoEm: quando }));

    // A data é o ÚLTIMO parâmetro, e o índice mudou quando velocidade, tipo de rastreador e
    // distância entraram antes dela. É por isso que o teste conta a partir do fim.
    const data = params[params.length - 1];
    // O ponto do teste: se isto for um Date, o INSERT quebra no Postgres.
    expect(data).toBeTypeOf("string");
    expect(data).toBe("2026-08-26T17:23:02.000Z");
    expect(String(data)).not.toContain("Coordinated Universal Time");
  });

  it("data ausente vira null, e não a string 'null'", () => {
    const { params } = dialeto.sqlToQuery(linhaDeValores({ ...base, posicaoEm: null }));
    expect(params[params.length - 1]).toBeNull();
  });

  it("os doze parâmetros saem na ordem das colunas", () => {
    const { sql: texto, params } = dialeto.sqlToQuery(
      linhaDeValores({ ...base, posicaoEm: new Date("2026-01-01T00:00:00.000Z") }),
    );
    // Doze parâmetros e um `now()` literal — a última coluna não é parâmetro.
    expect(params).toHaveLength(12);
    expect(texto).toContain("now()");
    expect(params.slice(0, 11)).toEqual([
      "ABC1D23",
      -23.5505,
      -46.6333,
      "SAO PAULO",
      "SP",
      "08004345441",
      "L",
      "2.19 km de algum lugar",
      78,
      "RA",
      12.4,
    ]);
  });

  /**
   * Nulos precisam chegar como NULL de verdade, e não virar texto.
   *
   * Uma latitude `"null"` seria recusada pela coluna `double precision` — e recusaria o lote todo,
   * exatamente como a data fez.
   */
  it("nulos atravessam como null", () => {
    const { params } = dialeto.sqlToQuery(
      linhaDeValores({
        placa: "XYZ9W88",
        latitude: null,
        longitude: null,
        cidade: null,
        uf: null,
        cpfMotorista: null,
        ignicao: null,
        referencia: null,
        velocidade: null,
        tipoRastreador: null,
        distUltPosicao: null,
        posicaoEm: null,
      }),
    );
    expect(params[0]).toBe("XYZ9W88");
    // Onze nulos: tudo menos a placa. Escrito por contagem para o teste acompanhar a coluna nova
    // sem alguém precisar contar `null` a olho.
    expect(params.slice(1)).toEqual(Array.from({ length: 11 }, () => null));
  });
});
