import { describe, expect, it } from "vitest";
import { aplicarPlacaSugerida } from "./placa-sugerida";

/**
 * O defeito relatado em 31/08: num truck, a segunda sugestão clicada não fazia nada.
 *
 * A regra antiga preenchia "o primeiro campo vazio" e desistia quando não havia nenhum. Num truck há
 * UM campo, então o primeiro clique era o único que funcionava, e a tela ficava com a placa grudada
 * sem nenhum sinal de que o clique tinha sido recebido.
 */
describe("aplicarPlacaSugerida", () => {
  it("num campo só, a segunda sugestão TROCA a primeira — era isto que não acontecia", () => {
    const primeiro = aplicarPlacaSugerida([""], "ABC1D23");
    expect(primeiro).toEqual({ placas: ["ABC1D23"], substituiu: null });

    const segundo = aplicarPlacaSugerida(primeiro.placas, "XYZ4E56");
    expect(segundo).toEqual({ placas: ["XYZ4E56"], substituiu: 0 });
  });

  it("com campo vazio, preenche o vazio e NÃO mexe no que já está escolhido", () => {
    // O comportamento da carreta, que ninguém reclamou e não pode mudar: cavalo no primeiro campo,
    // reboque no segundo. Sobrescrever o campo 1 aqui apagaria o que a pessoa acabou de escolher.
    expect(aplicarPlacaSugerida(["ABC1D23", ""], "XYZ4E56")).toEqual({
      placas: ["ABC1D23", "XYZ4E56"],
      substituiu: null,
    });
  });

  it("placa que já está num dos campos não faz nada — nem duplica, nem desmarca", () => {
    /**
     * Duas razões, e as duas importam: o portal recusa a ordem inteira quando recebe o par
     * duplicado, e um clique que TIRA a placa transformaria o clique repetido — que acontece — em
     * perda silenciosa da escolha.
     */
    expect(aplicarPlacaSugerida(["ABC1D23", "XYZ4E56"], "ABC1D23")).toEqual({
      placas: ["ABC1D23", "XYZ4E56"],
      substituiu: null,
    });
    expect(aplicarPlacaSugerida(["ABC1D23", "XYZ4E56"], "XYZ4E56").substituiu).toBeNull();
  });

  it("compara NORMALIZADO — `abc-1d23` e `ABC1D23` são a mesma placa", () => {
    /**
     * O portal manda `ABC1D23`; o cadastro pode guardar `ABC-1D23`. Comparar cru trataria as duas
     * como placas diferentes: a sugestão TROCARIA o campo por uma placa igual à que já estava, e
     * numa carreta chegaria a formar o par duplicado que o portal recusa.
     *
     * O campo fica como estava, hífen e tudo. Reescrevê-lo em nome da normalização seria mexer no
     * que a pessoa digitou para não fazer nada — a única coisa que este caso não pode fazer.
     */
    expect(aplicarPlacaSugerida(["ABC-1D23"], "abc1d23")).toEqual({
      placas: ["ABC-1D23"],
      substituiu: null,
    });
  });

  it("dois campos cheios: troca o PRIMEIRO, que é o que vai ao portal", () => {
    expect(aplicarPlacaSugerida(["ABC1D23", "XYZ4E56"], "QQQ9Z99")).toEqual({
      placas: ["QQQ9Z99", "XYZ4E56"],
      substituiu: 0,
    });
  });

  it("sem campo nenhum não inventa campo", () => {
    // O botão "remover placa" pode esvaziar a lista. Um `[0]` cego criaria um campo que a tela não
    // desenha, e a placa iria para a ordem sem nunca ter sido vista.
    expect(aplicarPlacaSugerida([], "ABC1D23")).toEqual({ placas: [], substituiu: null });
  });
});
