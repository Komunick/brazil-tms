import { describe, expect, it } from "vitest";
import { ehDataCompleta } from "./data-completa";

/**
 * O TESTE QUE TERIA PEGO O DEFEITO NO SEGUNDO EM QUE ELE NASCEU (2026-09-04).
 *
 * A expressão vivia solta dentro do componente de filtros da Torre de Controle, escrita sem as
 * barras invertidas:
 *
 *     /^d{4}-d{2}-d{2}$/
 *
 * Ela é uma expressão VÁLIDA — procura o texto literal "dddd-dd-dd" — então passou pelo typecheck e
 * pelo lint sem uma reclamação. E como o campo apagava o filtro quando ela dizia "não", escolher uma
 * data e sair do campo limpava o filtro. Toda vez.
 *
 * O primeiro caso abaixo é o que falha se a barra sumir de novo.
 */
describe("ehDataCompleta", () => {
  it("uma data de verdade passa", () => {
    // Se este falhar, a expressão perdeu as barras invertidas outra vez.
    expect(ehDataCompleta("2026-08-04")).toBe(true);
    expect(ehDataCompleta("2026-12-31")).toBe(true);
  });

  /**
   * O CASO QUE A FUNÇÃO EXISTE PARA PEGAR.
   *
   * Num campo de data controlado, o navegador reporta o valor INCOMPLETO enquanto a pessoa digita.
   * Mandar isso para o filtro faria a lista recarregar no meio da digitação — e o campo ser
   * redesenhado, apagando o que já tinha sido escrito bem no ano, que é o último pedaço.
   */
  it("data pela metade não passa", () => {
    for (const meio of ["2026", "2026-", "2026-08", "2026-08-", "202-08-04", "2026-8-4"]) {
      expect(ehDataCompleta(meio), `"${meio}" não deveria contar como completa`).toBe(false);
    }
  });

  it("vazio, nulo e indefinido não passam", () => {
    expect(ehDataCompleta("")).toBe(false);
    expect(ehDataCompleta(null)).toBe(false);
    expect(ehDataCompleta(undefined)).toBe(false);
  });

  /**
   * O TEXTO LITERAL QUE A EXPRESSÃO QUEBRADA CASAVA. Ele não pode passar — se passar, alguém trocou
   * `\d` por `d` de novo, e o sintoma volta a ser o filtro de data se apagando ao sair do campo.
   */
  it('"dddd-dd-dd" NÃO passa — era o que a versão quebrada aceitava', () => {
    expect(ehDataCompleta("dddd-dd-dd")).toBe(false);
  });

  /**
   * SÓ A FORMA, e não o calendário: quem recusa mês 13 é o campo nativo do navegador. Duas verdades
   * sobre a mesma data fariam a daqui envelhecer primeiro.
   */
  it("não valida calendário, e isso é deliberado", () => {
    expect(ehDataCompleta("2026-13-45")).toBe(true);
  });

  it("data com hora junto não passa — o filtro é por dia", () => {
    expect(ehDataCompleta("2026-08-04T10:00:00")).toBe(false);
  });
});
