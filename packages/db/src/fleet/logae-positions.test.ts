import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, frotaComPosicao, gravarPosicoesDaGerenciadora } from "../index";

/**
 * A GRAVAÇÃO DAS POSIÇÕES, CONTRA O BANCO DE VERDADE (2026-08-26, depois de quebrar).
 *
 * ── POR QUE ESTE TESTE PRECISA DE BANCO ───────────────────────────────────────────────────────
 *
 * Porque o defeito que ele existe para pegar VIVE NA SERIALIZAÇÃO, e mock não serializa nada.
 *
 * A primeira versão passava o `Date` direto para o template do drizzle. O que chegava ao Postgres
 * era `Wed Aug 26 2026 17:23:02 GMT+0000 (Coordinated Universal Time)` — `toString()`, não ISO — e
 * o INSERT inteiro falhava. Os testes de unidade do job passaram todos; a mesma consulta escrita à
 * mão no psql funcionou; só a combinação drizzle + `Date` quebrava.
 *
 * E cascateou: o insert falhando fez o pg-boss reexecutar, as chamadas em rajada bateram no limite
 * de dez segundos da Integra, e o log passou a gritar "CONSUMO INDEVIDO" — um sintoma que não tinha
 * nada a ver com a causa.
 *
 * Pula sem `DATABASE_URL`, na mesma convenção dos outros testes de integração:
 *   $env:DATABASE_URL='postgres://...'; pnpm exec vitest run --project db
 */
const temBanco = Boolean(process.env.DATABASE_URL);

/** Prefixo improvável, para a limpeza não encostar em placa de verdade. */
const PREFIXO = "ZZTEST";

describe.skipIf(!temBanco)("gravarPosicoesDaGerenciadora (integração)", () => {
  afterAll(async () => {
    if (!temBanco) return;
    await db.execute(sql`delete from logae_positions where placa like ${PREFIXO + "%"}`);
  });

  it("grava a data sem quebrar — era aqui que o INSERT inteiro falhava", async () => {
    const quando = new Date("2026-08-26T17:23:02.000Z");
    await gravarPosicoesDaGerenciadora([
      {
        placa: `${PREFIXO}01`,
        latitude: -23.5505,
        longitude: -46.6333,
        cidade: "SAO PAULO",
        uf: "SP",
        cpfMotorista: "08004345441",
        ignicao: "L",
        referencia: "2.19 km de algum lugar",

        velocidade: null,

        tipoRastreador: null,

        distUltPosicao: null,
        posicaoEm: quando,
      },
    ]);

    const linhas = await db.execute<{ posicao_em: Date }>(
      sql`select posicao_em from logae_positions where placa = ${PREFIXO + "01"}`,
    );
    expect(linhas).toHaveLength(1);
    // O instante tem de sobreviver à ida e à volta — não basta "gravou alguma coisa".
    expect(new Date(linhas[0]!.posicao_em).toISOString()).toBe(quando.toISOString());
  });

  it("aceita o lote com data ausente ao lado de data presente", async () => {
    await gravarPosicoesDaGerenciadora([
      {
        placa: `${PREFIXO}02`,
        latitude: -20,
        longitude: -44,
        cidade: null,
        uf: null,
        cpfMotorista: null,
        ignicao: null,
        referencia: null,

        velocidade: null,

        tipoRastreador: null,

        distUltPosicao: null,
        posicaoEm: null,
      },
      {
        placa: `${PREFIXO}03`,
        latitude: -21,
        longitude: -45,
        cidade: "X",
        uf: "MG",
        cpfMotorista: null,
        ignicao: "D",
        referencia: null,

        velocidade: null,

        tipoRastreador: null,

        distUltPosicao: null,
        posicaoEm: new Date("2026-08-26T10:00:00.000Z"),
      },
    ]);
    const linhas = await db.execute<{ placa: string }>(
      sql`select placa from logae_positions where placa like ${PREFIXO + "0%"} order by placa`,
    );
    expect(linhas.map((l) => l.placa)).toContain(`${PREFIXO}02`);
    expect(linhas.map((l) => l.placa)).toContain(`${PREFIXO}03`);
  });

  /**
   * REGRAVAR A MESMA PLACA SOBRESCREVE — é o `on conflict` que faz o job ser idempotente.
   *
   * Sem isso, o job de minuto em minuto empilharia uma linha por ciclo e a tabela viraria histórico
   * por acidente, sem ninguém decidir isso.
   */
  it("sobrescreve a mesma placa em vez de acumular", async () => {
    const base = {
      placa: `${PREFIXO}04`,
      longitude: -44,
      uf: "MG",
      cpfMotorista: null,
      ignicao: null,
      referencia: null,

      velocidade: null,

      tipoRastreador: null,

      distUltPosicao: null,
    };
    await gravarPosicoesDaGerenciadora([
      { ...base, latitude: -10, cidade: "ANTES", posicaoEm: new Date("2026-08-26T09:00:00.000Z") },
    ]);
    await gravarPosicoesDaGerenciadora([
      { ...base, latitude: -11, cidade: "DEPOIS", posicaoEm: new Date("2026-08-26T10:00:00.000Z") },
    ]);
    const linhas = await db.execute<{ cidade: string; latitude: number }>(
      sql`select cidade, latitude from logae_positions where placa = ${PREFIXO + "04"}`,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.cidade).toBe("DEPOIS");
    expect(Number(linhas[0]!.latitude)).toBe(-11);
  });

  /**
   * A LEITURA DESCARTA ZERO-ZERO — e é a segunda metade da defesa.
   *
   * A gravação guarda a linha sem coordenada de propósito ("conheço este caminhão e não sei onde
   * está" é informação). Quem não pode deixar passar é o mapa: zero-zero é um ponto real no
   * Atlântico, e um caminhão boiando no oceano custa a confiança de quem olha.
   */
  it("a leitura não devolve quem está sem coordenada", async () => {
    await gravarPosicoesDaGerenciadora([
      {
        placa: `${PREFIXO}05`,
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
        posicaoEm: new Date(),
      },
    ]);
    const frota = await frotaComPosicao();
    expect(frota.map((v) => v.placa)).not.toContain(`${PREFIXO}05`);
  });
});
