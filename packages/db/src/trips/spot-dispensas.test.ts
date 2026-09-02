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
  /**
   * AS DUAS MIGRAÇÕES SÃO LIDAS JUNTAS, e a forma final é a soma delas.
   *
   * A `0062` criou a tabela com chave `(oferta, pessoa)`, de quando ignorar limpava só a tela de
   * quem clicava. A `0063` encolheu a chave para a oferta e acrescentou o `motivo`, quando a decisão
   * passou a valer para a equipe.
   *
   * Conferir só a primeira acusaria como ausente uma coluna que EXISTE — e um guarda que acusa o
   * certo ensina quem vier depois a desconfiar dele, que é o pior estado em que ele pode ficar.
   */
  const migracao = ["0062_dispensa_de_oferta", "0063_spot_decisao_da_equipe"]
    .map((tag) => readFileSync(join(__dirname, `../../migrations/${tag}.sql`), "utf8"))
    .join("\n");

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
    /*
      AS COLUNAS ESPERADAS, por NOME e não por contagem.

      A primeira versão contava (`toBe(3)`), e a conta quebrou no dia seguinte quando o `motivo`
      entrou — sem dizer nada útil, só "esperava 3, veio 4". Por nome, o teste continua pegando o
      esquecimento e ainda diz QUAL coluna apareceu ou sumiu.

      A lista existe também contra o caso em que ela vier vazia: aí o laço abaixo não rodaria e o
      guarda passaria sem provar nada, que é o modo clássico de um teste ficar verde por acidente.
    */
    expect(colunas.sort()).toEqual(["dispensada_em", "motivo", "spot_offer_id", "user_id"]);
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
   * FR-014 por construção — e o MECANISMO mudou em 2026-09-02, a garantia não.
   *
   * Este guarda exigia `estado !== "aceito"`: a oferta aceita não chegava à tela, ponto. Agora ela
   * chega por DEZ SEGUNDOS, marcada com quem aceitou, para a equipe ver quem decidiu — e só depois o
   * servidor para de trazê-la.
   *
   * O que se garante continua igual: **quem tira o cartão da tela é o SERVIDOR**. Mudou o QUANDO ele
   * para de trazer, não o QUEM decide isso. Por isso a asserção passou a exigir a JANELA, que é o
   * que hoje faz a oferta sair.
   *
   * As duas formas de quebrar isto são silenciosas: sem a janela, o aviso some e ninguém vê quem
   * decidiu; sem o descarte, o cartão fica preso na tela para sempre.
   */
  it("a oferta decidida sai da lista pela janela dos dez segundos", () => {
    expect(fonte, "a janela da decisão sumiu — a oferta decidida nunca sairia").toContain(
      "decisaoAindaVisivel",
    );
    expect(
      fonte,
      "a leitura parou de descartar a decisão vencida — o cartão ficaria preso na tela",
    ).toContain("return null");
  });

  /**
   * A dispensa continua filtrada no SERVIDOR — o que mudou foi DE QUEM ela vale (2026-09-01).
   *
   * O campo era `dispensadaPorMim` e escondia só de quem tinha clicado. Ignorar virou uma decisão da
   * equipe, tomada por quem tem `decidir_spot`, e a oferta sai da tela de todos — então o campo
   * perdeu o dono e virou `dispensada`.
   *
   * Filtrar aqui e não na tela continua valendo pelo mesmo motivo de antes: na tela, o ignorar
   * dependeria de cada uma das três telas lembrar de filtrar.
   */
  it("a oferta ignorada sai para todos, e quem a tira é o servidor", () => {
    expect(fonte, "a leitura parou de olhar a HORA da dispensa — sem ela não há janela").toContain(
      "dispensadaEm",
    );
    expect(
      fonte,
      "voltou a filtrar por pessoa — a decisão vale para a equipe desde 01/09",
    ).not.toMatch(/dispensadaPorMim/);
  });
});
