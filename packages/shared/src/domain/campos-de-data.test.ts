import { describe, expect, it } from "vitest";
import {
  CAMPOS_DE_DATA,
  CAMPOS_DE_DATA_NO_PASSADO,
  CAMPOS_DO_CADASTRO,
  type CampoDoCadastro,
} from "./motorista-corpo";

/**
 * OS CAMPOS DE DATA DA CONFERÊNCIA (2026-09-05).
 *
 * ── O QUE ACONTECEU ───────────────────────────────────────────────────────────────────────────
 *
 * Um cadastro real foi enviado à gerenciadora com `DataNascimento` = `2035-04-25` — a data de
 * VENCIMENTO da CNH, que a leitura da foto copiou no campo errado. A gerenciadora aceitou (ela não
 * valida esse campo) e o motorista ficou lá dentro nascido no futuro.
 *
 * Ele passou pela conferência de uma pessoa. E passou porque a tela desenhava todos os campos como
 * texto, então a data aparecia crua: `2035-04-25`. Em ordem ISO, no meio de vinte campos, aquilo
 * não é lido como data por quem lê em português — é uma sequência de números. Escrito `25/04/2035`,
 * o 2035 no fim salta aos olhos.
 *
 * O formato errado não CAUSOU o erro. Ele deixou o erro passar, que é pior de achar.
 */
describe("os campos de data do cadastro", () => {
  it("são exatamente os quatro que existem hoje", () => {
    expect([...CAMPOS_DE_DATA].sort()).toEqual(
      ["dataNascimento", "primeiraHabilitacao", "validade", "validadeMopp"].sort(),
    );
  });

  /**
   * O GUARDA QUE PEGA O ESQUECIMENTO.
   *
   * Um campo de data novo entra em `CAMPOS_DO_CADASTRO` e é fácil não lembrar desta lista — e o
   * sintoma seria mudo: a tela volta a mostrar `AAAA-MM-DD` naquele campo, e ninguém nota até o
   * dia em que um valor errado atravessar a conferência.
   *
   * Casa por CONVENÇÃO DE NOME, que é o que dá para automatizar: `data…` e `validade…`. Não pega
   * um nome fora do padrão — `primeiraHabilitacao` é justamente esse caso, e por isso ele está
   * afirmado à mão no teste acima. Se alguém acrescentar outro campo de data com nome sem padrão,
   * este teste NÃO avisa; o de cima avisa, porque a lista exata muda.
   */
  it("todo campo que se chama data… ou validade… está marcado como data", () => {
    const pelaConvencao = CAMPOS_DO_CADASTRO.filter(
      (c) => c.startsWith("data") || c.startsWith("validade"),
    );
    for (const campo of pelaConvencao) {
      expect(CAMPOS_DE_DATA.has(campo), `"${campo}" parece data e não está em CAMPOS_DE_DATA`).toBe(
        true,
      );
    }
  });

  it("todo campo marcado como data existe no cadastro", () => {
    const existentes = new Set<string>(CAMPOS_DO_CADASTRO);
    for (const campo of CAMPOS_DE_DATA) {
      expect(existentes.has(campo), `"${campo}" não é campo do cadastro`).toBe(true);
    }
  });
});

describe("as datas que não podem estar no futuro", () => {
  /**
   * O CASO DO SANDRO. Nascer é fato passado — se este conjunto perder `dataNascimento`, o `max` do
   * campo some e a tela volta a aceitar uma data no futuro sem piscar.
   */
  it("nascimento e primeira habilitação são fatos passados", () => {
    expect(CAMPOS_DE_DATA_NO_PASSADO.has("dataNascimento")).toBe(true);
    expect(CAMPOS_DE_DATA_NO_PASSADO.has("primeiraHabilitacao")).toBe(true);
  });

  /**
   * E O CONTRÁRIO, que é o erro fácil de cometer "por simetria": vencimento no futuro é o normal.
   * Pôr `max` neles impediria justamente o caso certo — uma CNH que vence em 2034.
   */
  it("os vencimentos NÃO entram — futuro é o esperado neles", () => {
    expect(CAMPOS_DE_DATA_NO_PASSADO.has("validade")).toBe(false);
    expect(CAMPOS_DE_DATA_NO_PASSADO.has("validadeMopp")).toBe(false);
  });

  it("é subconjunto dos campos de data", () => {
    for (const campo of CAMPOS_DE_DATA_NO_PASSADO) {
      expect(CAMPOS_DE_DATA.has(campo as CampoDoCadastro), `"${campo}" não é campo de data`).toBe(
        true,
      );
    }
  });
});
