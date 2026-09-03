import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A CONFERÊNCIA É SÓ LEITURA, e isso precisa continuar verdade (2026-09-03).
 *
 * ── POR QUE UM TESTE QUE LÊ O FONTE ───────────────────────────────────────────────────────────
 *
 * O job chama a Integra de verdade; um teste de comportamento exigiria credencial e gastaria o
 * limite de frequência da gerenciadora para provar o óbvio. O defeito que realmente ameaça esta
 * fatia é outro, e é de intenção: alguém achar que, já que a conferência descobriu que o motorista
 * NÃO está cadastrado lá, ela poderia "aproveitar e cadastrar". Ou pior — já que ela descobriu que
 * não há pesquisa, aproveitar e pedir.
 *
 * O primeiro cria cadastro sem ninguém ter mandado. O segundo **gasta dinheiro**, e gasta a partir
 * de um botão cuja promessa na tela é "conferir". Os dois passariam no typecheck e em todo teste
 * que existe hoje.
 *
 * Este arquivo transforma essa promessa em algo que quebra.
 */
const fonte = readFileSync(join(__dirname, "conferir-raster.ts"), "utf8")
  /*
    COMENTÁRIO SAI ANTES DA ASSERÇÃO.

    Este projeto já errou isto duas vezes: a asserção pegava a frase que EXPLICA a regra, e o
    "conserto" natural era apagar o porquê. Aqui o cabeçalho fala de `setMotorista` justamente para
    dizer que ele não é chamado — a explicação derrubaria o teste que ela justifica.
  */
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

describe("o job da conferência na gerenciadora", () => {
  /**
   * Escrever na gerenciadora é `set*` — a fronteira inteira cabe num teste só.
   *
   * Os temporizadores do JavaScript entram no mesmo padrão e não têm nada a ver com isto; ficam de
   * fora por NOME, e não afrouxando o padrão, que é o que deixaria `setMotorista` passar junto.
   */
  it("não chama NENHUMA escrita da Integra", () => {
    const escritas = [...fonte.matchAll(/\bset[A-Z]\w*(?=\s*\()/g)]
      .map((m) => m[0])
      .filter((nome) => !["setTimeout", "setInterval", "setImmediate"].includes(nome));
    expect(
      escritas,
      "a conferência passou a ESCREVER na gerenciadora — o botão diz 'conferir' e faria outra coisa",
    ).toEqual([]);
  });

  it("não pede pesquisa — a única chamada que custa dinheiro", () => {
    expect(
      fonte,
      "pedir pesquisa a partir da conferência gastaria a partir de um botão que promete leitura",
    ).not.toContain("setSolicitacaoPesquisaConsulta");
    expect(fonte).not.toContain("motoristaPesquisar");
  });

  /**
   * OS TRÊS VÍNCULOS, e não o escolhido na hora.
   *
   * A consulta da gerenciadora só encontra a pesquisa se o vínculo bater. Medido em produção: a
   * pesquisa do CPF 08389766469 existe sob **A**, e perguntando como F ou T a resposta é "não
   * existe". Perguntar por um vínculo só responderia "pode mandar" exatamente no caso que a fatia
   * existe para evitar — e o segundo pedido nasceria e seria cobrado sem ninguém notar.
   */
  it("pergunta pelos TRÊS vínculos, percorrendo a lista compartilhada", () => {
    expect(
      fonte,
      "a consulta deixou de percorrer os três vínculos — uma pesquisa em vínculo diferente vira " +
        "invisível, e o guarda libera o gasto",
    ).toContain("VINCULOS_DA_PESQUISA");
  });

  /**
   * A FALHA É GRAVADA. Sem isto a tela fica dizendo "nunca conferido" depois de alguém conferir, e
   * quem lê conclui que o botão não funciona — e vai pedir a pesquisa pela tela da gerenciadora.
   */
  it("grava também quando a gerenciadora não responde", () => {
    const captura = fonte.slice(fonte.indexOf("catch"));
    expect(captura, "a falha da conferência foi engolida").toContain("gravarConferenciaNaRaster");
  });
});
