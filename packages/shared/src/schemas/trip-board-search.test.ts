import { describe, expect, it } from "vitest";
import { termosDaBusca } from "./trip-board";

/**
 * COLAR UMA LISTA DE LHs na busca do quadro (2026-08-21, a pedido).
 *
 * A operação recebe LHs em bloco — de planilha, de e-mail, do portal — e antes disto era uma busca
 * por vez. O caso real que motivou tudo tinha 21 códigos, um por linha, alguns com espaço sobrando no
 * fim, e ocupava 298 caracteres: o limite antigo de 200 recusava a colagem inteira com um erro de
 * validação que não dizia que o problema era o tamanho.
 *
 * Os códigos aqui são inventados no formato do cliente, não copiados da operação.
 */
describe("termosDaBusca", () => {
  it("separa uma lista colada com uma quebra de linha por código", () => {
    const colado = ["LT0A1B02C3D41", "LT0A1B02C3D42", "LT0A1B02C3D43"].join("\n");
    expect(termosDaBusca(colado)).toEqual(["LT0A1B02C3D41", "LT0A1B02C3D42", "LT0A1B02C3D43"]);
  });

  /** Planilha manda tabulação, e-mail manda vírgula, o portal manda espaço. Tudo cai aqui. */
  it("aceita quebra de linha, vírgula, ponto e vírgula, tabulação, barra e espaço", () => {
    const bagunca = "LT1,LT2;LT3\tLT4 LT5|LT6\r\nLT7";
    expect(termosDaBusca(bagunca)).toEqual(["LT1", "LT2", "LT3", "LT4", "LT5", "LT6", "LT7"]);
  });

  it("ignora espaço sobrando no fim da linha e linha em branco no meio", () => {
    const colado = "LT0A1B02C3D41   \n\n  LT0A1B02C3D42  \n   \nLT0A1B02C3D43";
    expect(termosDaBusca(colado)).toEqual(["LT0A1B02C3D41", "LT0A1B02C3D42", "LT0A1B02C3D43"]);
  });

  /**
   * Cópia de planilha e de página web traz espaço de largura zero e marca de ordem de bytes grudados
   * no código. Eles NÃO são espaço para o `\s`, então sobreviveriam ao corte e virariam parte do
   * termo — a busca não acharia nada e ninguém veria o motivo.
   */
  it("remove caracteres invisíveis que vêm colados no código", () => {
    const comInvisiveis = "\uFEFFLT0A1B02C3D41\u200B\nLT0A1B02C3D42\u200D";
    expect(termosDaBusca(comInvisiveis)).toEqual(["LT0A1B02C3D41", "LT0A1B02C3D42"]);
  });

  it("não repete o mesmo código duas vezes", () => {
    expect(termosDaBusca("LT1 LT2 LT1")).toEqual(["LT1", "LT2"]);
  });

  it("uma busca comum continua sendo um termo só", () => {
    expect(termosDaBusca("Shopee")).toEqual(["Shopee"]);
  });

  /**
   * Cada termo vira seis comparações na consulta. Uma colagem acidental de mil linhas seriam seis mil
   * por viagem — o teto protege o quadro de uma pessoa que colou a planilha errada.
   */
  it("corta em 200 termos", () => {
    const muitos = Array.from({ length: 250 }, (_, i) => `LT${i}`).join("\n");
    expect(termosDaBusca(muitos)).toHaveLength(200);
  });

  it("texto vazio ou só espaços não vira termo nenhum", () => {
    expect(termosDaBusca("   \n\t  ")).toEqual([]);
  });
});
