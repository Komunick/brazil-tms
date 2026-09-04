import { describe, expect, it } from "vitest";
import { ehTrocaDeAtribuicao, motivoDaTrocaServe } from "./troca-de-atribuicao";

/**
 * A REGRA QUE A TELA E O BANCO PRECISAM RESPONDER IGUAL (2026-09-04).
 *
 * Se elas divergirem, o resultado é o pior possível: a tela não mostra o campo de motivo, a pessoa
 * aperta, e o servidor recusa pedindo um motivo que ela não tem onde escrever — sem nada no código
 * apontando a causa, porque os dois lados estariam obedecendo à sua própria versão da regra.
 *
 * Estes casos são o contrato entre os dois.
 */
describe("ehTrocaDeAtribuicao", () => {
  it("trocar quem já estava escalado É troca", () => {
    expect(ehTrocaDeAtribuicao({ motoristaAtual: "111", motoristaNovo: "222" })).toBe(true);
  });

  /**
   * A PRIMEIRA ATRIBUIÇÃO NÃO É TROCA — e esta é a exclusão que mais importa.
   *
   * São centenas por dia. Um campo obrigatório no gesto comum vira "asdf" digitado por reflexo, e aí
   * o registro existe e não diz nada — que é pior do que não registrar.
   */
  it("a primeira atribuição NÃO é troca", () => {
    expect(ehTrocaDeAtribuicao({ motoristaAtual: null, motoristaNovo: "222" })).toBe(false);
    expect(ehTrocaDeAtribuicao({ motoristaAtual: "", motoristaNovo: "222" })).toBe(false);
    expect(ehTrocaDeAtribuicao({ motoristaAtual: "   ", motoristaNovo: "222" })).toBe(false);
  });

  /**
   * REENVIAR O MESMO NÃO É TROCA. Acontece ao corrigir a placa, ou ao repetir uma ordem que o portal
   * recusou — cobrar motivo ali puniria justamente quem está consertando.
   */
  it("reenviar o MESMO motorista não é troca", () => {
    expect(ehTrocaDeAtribuicao({ motoristaAtual: "111", motoristaNovo: "111" })).toBe(false);
  });

  /**
   * O PORTAL MANDA TEXTO, A TELA GUARDA TEXTO, O BANCO RECEBE NÚMERO.
   *
   * Sem normalizar, `111` e `"111"` pareceriam pessoas diferentes — e a tela pediria motivo para uma
   * troca que não existe. É a divergência mais provável entre os dois lados, e por isso está aqui.
   */
  it("número e texto do mesmo id são a MESMA pessoa", () => {
    expect(ehTrocaDeAtribuicao({ motoristaAtual: "111", motoristaNovo: 111 })).toBe(false);
    expect(ehTrocaDeAtribuicao({ motoristaAtual: 111, motoristaNovo: "111" })).toBe(false);
    expect(ehTrocaDeAtribuicao({ motoristaAtual: " 111 ", motoristaNovo: 111 })).toBe(false);
  });

  it("sem saber quem é o novo, não se exige nada", () => {
    // "Não sei" nunca deve virar exigência: travaria o gesto sem ter o que perguntar.
    expect(ehTrocaDeAtribuicao({ motoristaAtual: "111", motoristaNovo: null })).toBe(false);
  });
});

describe("motivoDaTrocaServe", () => {
  it("vazio e espaço não servem", () => {
    expect(motivoDaTrocaServe(null)).toBe(false);
    expect(motivoDaTrocaServe("")).toBe(false);
    expect(motivoDaTrocaServe("   ")).toBe(false);
    expect(motivoDaTrocaServe("ab")).toBe(false);
  });

  it("três letras já passam — barra o Enter vazio, não julga o conteúdo", () => {
    // Julgar se o motivo é BOM não é trabalho de código: quem lê a linha do tempo julga.
    expect(motivoDaTrocaServe("quebrou")).toBe(true);
    expect(motivoDaTrocaServe("  quebrou  ")).toBe(true);
  });
});
