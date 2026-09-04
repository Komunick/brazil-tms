import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A FAIXA DE ATUALIZAÇÃO NÃO PODE VIRAR CORTINA (03/09).
 *
 * ── POR QUE ISTO PRECISA DE UM GUARDA ─────────────────────────────────────────────────────────
 *
 * O pedido foi explícito: faixa no topo, que **não bloqueia**. E a tentação de "melhorar" um aviso
 * é sempre a mesma — deixá-lo mais visível: posição fixa, sobreposição, um modal.
 *
 * Este projeto já pagou por isso uma vez. O cartão de oferta de spot pintava a tela inteira por trás
 * (`boxShadow: 0 0 0 9999px`), e a reclamação foi imediata: atrapalhava quem estava atribuindo. A
 * fatia 030 nasceu, entre outras coisas, para tirar aquela cortina.
 *
 * Um aviso de manutenção que cobre a tela seria a mesma cortina de volta — só que dez minutos por
 * dia, todo dia. E, ao contrário do spot, ele apareceria mesmo nos dias em que nada acontece.
 */
const fonte = readFileSync(
  join(__dirname, "..", "..", "components", "shell", "aviso-de-atualizacao.tsx"),
  "utf8",
)
  /*
    COMENTÁRIO SAI ANTES DA ASSERÇÃO.

    O cabeçalho do componente fala de cortina e de sobreposição justamente para dizer que ele não
    faz isso. Sem remover o comentário, a asserção casaria com a explicação e o "conserto" seria
    apagar o porquê — erro que este repositório já cometeu duas vezes.
  */
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

describe("a faixa de atualização", () => {
  it("não se posiciona sobre a tela", () => {
    for (const proibido of ["fixed", "absolute", "sticky", "z-50", "inset-0"]) {
      expect(
        fonte,
        `a faixa passou a usar \`${proibido}\` — ela sai do fluxo e vira cortina`,
      ).not.toContain(proibido);
    }
  });

  it("não pinta cortina por trás nem escurece o fundo", () => {
    expect(fonte, "voltou a cortina do cartão de spot").not.toContain("boxShadow");
    expect(fonte).not.toContain("backdrop");
  });

  it("não é um diálogo", () => {
    // Modal trava a tela inteira, que é o oposto do pedido.
    expect(fonte).not.toMatch(/\bDialog\b/);
    expect(fonte).not.toContain('role="dialog"');
  });

  /**
   * A REGRA DA JANELA VEM DE `packages/shared`, e não é recalculada aqui.
   *
   * Uma segunda conta de horário nesta tela divergiria da testada no primeiro ajuste — e o fuso é
   * exatamente o tipo de coisa que diverge em silêncio.
   */
  it("usa a regra compartilhada, sem refazer a conta de horário", () => {
    expect(fonte).toContain("avisoDaAtualizacao");
    expect(fonte, "apareceu uma segunda conta de horário na tela").not.toMatch(/getHours\(\)/);
  });

  /**
   * SEM BOTÃO DE FECHAR: dispensar por reflexo às 12:01 e esquecer às 12:09 é o modo de falha do
   * aviso, e o botão é o que o torna possível.
   */
  it("não tem como ser dispensada", () => {
    expect(fonte).not.toMatch(/dispensar|fechar|dismiss/i);
  });
});
