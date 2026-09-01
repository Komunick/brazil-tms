import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spotOfferDispensas } from "../../schema";

/**
 * A MIGRAÇÃO E O SCHEMA PRECISAM CONCORDAR (2026-09-01, fatia 030).
 *
 * Neste repositório a migração é escrita À MÃO — `drizzle-kit generate` não serve, porque o journal
 * tem mais de sessenta entradas e ele diffa contra um snapshot antigo, recriando tabelas de
 * produção. O preço dessa escolha é que nada, sozinho, obriga o SQL e o schema a dizerem a mesma
 * coisa: são duas declarações independentes, e o drizzle acredita na segunda.
 *
 * Uma coluna que existe no schema e não na migração passa em todo teste unitário e falha na primeira
 * consulta contra o banco de produção — depois do deploy, longe de quem escreveu.
 */
describe("a migração da dispensa e o schema", () => {
  const migracao = readFileSync(
    join(__dirname, "../../migrations/0062_dispensa_de_oferta.sql"),
    "utf8",
  );

  /** Os nomes de coluna que o drizzle vai usar na consulta — a verdade do lado do código. */
  const colunasDe = (tabela: object): string[] =>
    Object.values(tabela)
      .filter(
        (c): c is { name: string } =>
          typeof c === "object" && c !== null && "columnType" in c && "name" in c,
      )
      .map((c) => c.name);

  it("toda coluna do schema existe na migração", () => {
    const colunas = colunasDe(spotOfferDispensas);
    // Se a lista vier vazia, o teste passaria sem provar nada — é o modo clássico de um guarda
    // ficar verde por acidente.
    expect(colunas.length).toBe(3);
    for (const coluna of colunas) {
      expect(migracao, `spot_offer_dispensas.${coluna} não está na migração`).toContain(
        `"${coluna}"`,
      );
    }
  });

  /**
   * A CHAVE COMPOSTA É A REGRA DE NEGÓCIO: dispensar duas vezes é a mesma dispensa.
   *
   * Sem ela, `on conflict do nothing` não teria em que conflitar, e dois cliques — ou duas abas —
   * gravariam duas linhas. A idempotência do gesto depende inteiramente desta chave.
   */
  it("a chave primária é composta por oferta e pessoa", () => {
    expect(migracao).toMatch(
      /PRIMARY KEY\s*\(\s*"spot_offer_id"\s*,\s*"user_id"\s*\)/i,
    );
  });

  /**
   * A CASCATA PELA OFERTA É OBRIGATÓRIA; PELO AUTOR, PROIBIDA.
   *
   * Pela oferta, para que a dispensa nunca trave a remoção dela. Pelo autor, jamais: a dispensa de
   * alguém que saiu da empresa explica por que aquela oferta não estava na tela daquela pessoa, e
   * apagá-la apagaria a explicação.
   */
  it("cascateia pela oferta e não pelo autor", () => {
    expect(migracao).toMatch(
      /"spot_offer_id"[^,]*REFERENCES "spot_offers"\("id"\) ON DELETE CASCADE/,
    );
    const autor = /"user_id"[^,]*/.exec(migracao)?.[0] ?? "";
    expect(autor).toContain('REFERENCES "users"("id")');
    expect(autor, "a cascata no autor apagaria a explicação junto com a pessoa").not.toContain(
      "CASCADE",
    );
  });
});

/**
 * O QUE A LEITURA DO CARTÃO TIRA DA LISTA (2026-09-01).
 *
 * As duas exclusões são o coração de dois requisitos, e as duas são fáceis de remover sem perceber
 * — parecem "filtro a mais" para quem não conhece a razão.
 */
describe("readSpotOffersToday exclui o que não é decisão de ninguém", () => {
  const fonte = readFileSync(join(__dirname, "spot-offers.ts"), "utf8")
    // Comentários saem: este arquivo explica as duas exclusões o tempo todo.
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  /**
   * FR-014 por construção: o cartão sai de todas as telas quando o portal diz `Accepted`, e a
   * garantia não é disciplina — é que a oferta aceita simplesmente não chega à tela. Não havendo o
   * dado, não há como um segundo motivo tirar o cartão.
   */
  it("a oferta aceita não é devolvida", () => {
    expect(fonte, "a exclusão do estado aceito sumiu — ver FR-014").toMatch(
      /estado\s*!==\s*"aceito"/,
    );
  });

  /**
   * FR-018: a dispensa é filtrada no SERVIDOR. Filtrar na tela faria o ignorar depender de cada uma
   * das três telas lembrar de filtrar, e morreria ao recarregar — a oferta voltaria.
   */
  it("a oferta dispensada por quem pergunta não é devolvida", () => {
    expect(fonte, "o filtro da dispensa saiu do servidor — ver FR-018").toMatch(
      /!\s*r\.dispensadaPorMim/,
    );
  });
});
