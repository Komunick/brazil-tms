import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoDaOferta } from "@brazil-tms/shared";

/**
 * A CORREÇÃO DA CONTAGEM DO PAINEL, e a assimetria entre as duas leituras (2026-09-01, fatia 030).
 *
 * Os dois assuntos moram no mesmo arquivo de propósito: eles são fáceis de "consertar" um no outro.
 * Quem encontrar a assimetria vai querer uniformizar; quem encontrar a terceira conta vai querer
 * simplificar de volta para duas. Os testes ficam lado a lado para que a próxima pessoa veja as
 * duas razões juntas.
 */

const fonte = readFileSync(join(__dirname, "programacao.ts"), "utf8")
  // Comentário sai: este arquivo explica a contagem antiga e a nova o tempo todo, e um teste que
  // esbarrasse na explicação levaria alguém a apagar o porquê para deixá-lo verde.
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

describe("a contagem de aceitas do painel", () => {
  /**
   * O DEFEITO QUE ESTA FATIA CORRIGIU DE PASSAGEM.
   *
   * A conta era `t.id is not null` — A VIAGEM EXISTE NO TMS —, e isso contava como PEGA a oferta que
   * ainda esperava decisão no portal. O erro é passageiro (das 98 ofertas que casaram com viagem, 98
   * estão `Accepted` hoje), e por ser passageiro nunca foi notado: quem confere o painel no fim do
   * dia sempre viu o número já correto.
   *
   * Ele errava exatamente na janela que esta fatia habita — os minutos entre a viagem chegar e
   * alguém decidir. Sem este teste, a correção seria efeito colateral que ninguém confere.
   */
  it("não conta 'a viagem existe' como aceita", () => {
    expect(
      fonte,
      "a contagem voltou ao atalho `t.id is not null` — ela precisa perguntar pela ACEITAÇÃO do portal",
    ).not.toMatch(/filter\s*\(\s*where[^)]*t\.id is not null[^)]*\)\s*as\s+aceito/i);
  });

  it("as três contas somam o total, e a terceira existe", () => {
    // Sem `esperando`, a oferta que espera decisão teria de mentir numa das outras duas.
    expect(fonte).toMatch(/as\s+esperando/i);
    expect(fonte).toMatch(/as\s+aceito/i);
    expect(fonte).toMatch(/as\s+nao_aceito/i);
  });

  /**
   * A DERIVAÇÃO É UMA SÓ, e é o que garante o FR-022.
   *
   * A linha do painel traz as ENTRADAS cruas e chama `estadoDaOferta` no mapeamento — a mesma função
   * que a leitura do cartão usa. Reimplementar a máquina de cinco estados em SQL concordaria no dia
   * em que fosse escrita e divergiria em silêncio no primeiro ajuste, com as duas telas dizendo
   * coisas diferentes sobre a mesma oferta e nenhum erro em lugar nenhum.
   */
  it("o estado da linha vem da função compartilhada, não de um SQL paralelo", () => {
    expect(fonte, "o painel parou de usar `estadoDaOferta` — ver FR-022").toContain(
      "estadoDaOferta(",
    );
  });
});

describe("as duas leituras são assimétricas de propósito", () => {
  const cartao = readFileSync(join(__dirname, "spot-offers.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  /**
   * A oferta ACEITA some do cartão e FICA no painel. Parece incoerência e é o FR-014 de um lado e o
   * registro do dia do outro: uma leitura é a fila do que falta decidir, a outra é a história do que
   * aconteceu. Uniformizá-las pareceria faxina e quebraria a garantia por construção.
   */
  it("o cartão exclui a oferta aceita; o painel não", () => {
    expect(cartao, "o cartão parou de excluir o aceito — o FR-014 depende disso").toMatch(
      /estado\s*!==\s*"aceito"/,
    );
    expect(
      fonte,
      "o painel passou a excluir o aceito — ele é o registro do dia e precisa mostrá-lo",
    ).not.toMatch(/estado\s*!==\s*"aceito"/);
  });

  /**
   * A DISPENSA: o cartão ESCONDE, o painel MARCA. É o FR-019 — ignorar limpa a tela de quem clicou,
   * e não apaga a prova de que a oferta chegou.
   */
  it("o cartão esconde o dispensado; o painel apenas marca", () => {
    expect(cartao).toMatch(/!\s*r\.dispensadaPorMim/);
    expect(fonte).toContain("dispensadaPorMim");
    expect(
      fonte,
      "o painel passou a FILTRAR a dispensa — ela ali só marca, ver FR-019",
    ).not.toMatch(/filter\([^)]*dispensadaPorMim/);
  });
});

describe("a derivação usada pelas duas telas", () => {
  /**
   * O caso que a correção do painel depende: viagem no TMS, aceitação ainda pendente. A conta antiga
   * dizia "aceita"; a derivação diz "esperando", que é a verdade e é o que a linha mostra em âmbar.
   */
  it("viagem no TMS ainda pendente é 'esperando', não 'aceito'", () => {
    expect(
      estadoDaOferta({
        tripId: "t1",
        aceitacaoDoPortal: "Pending",
        ordemAberta: false,
        ultimaFalhou: false,
      }),
    ).toBe("esperando");
  });
});
