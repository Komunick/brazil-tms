import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O RECADO PISCA PELO QUE CHEGOU, NÃO PELO QUE EXISTE (2026-09-04, a pedido).
 *
 * ── POR QUE ISTO PRECISA DE UM GUARDA ─────────────────────────────────────────────────────────
 *
 * O pedido foi "que chame atenção quando alguém comenta". A leitura fácil — e errada — é ligar o
 * piscar a `quantos > 0`: uma linha, funciona na hora, e passa em qualquer conferência rápida.
 *
 * Numa manhã comum, dezenas de linhas têm recado. O quadro inteiro passaria a piscar o dia todo, e o
 * que pisca sempre some da vista exatamente como o que não pisca nunca — voltando ao problema que a
 * operação relatou, agora com movimento.
 *
 * A memória da contagem (`vistos`) é o que separa "chegou agora" de "existe". Ela é fácil de tirar
 * achando que é complicação, e este teste é o que avisa.
 */
const fonte = readFileSync(
  join(__dirname, "..", "..", "components", "trips", "comentarios-da-linha.tsx"),
  "utf8",
)
  /*
    COMENTÁRIO SAI ANTES DA ASSERÇÃO.

    O cabeçalho do componente explica a regra usando as mesmas palavras que as asserções procuram —
    sem removê-lo, o teste passaria pela explicação e não pelo código. Erro que este repositório já
    cometeu duas vezes.
  */
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

describe("o marcador de recado", () => {
  it("guarda quantos já tinha visto, e acende quando o número CRESCE", () => {
    expect(fonte, "a memória da contagem sumiu — o marcador voltou a piscar por existir").toContain(
      "vistos",
    );
    expect(fonte).toMatch(/quantos\s*>\s*vistos\.current/);
  });

  /**
   * A PRIMEIRA LEITURA NUNCA ACENDE. `vistos` nasce com o que a linha já trazia — se nascesse em
   * zero, abrir a tela de manhã acenderia tudo que tem recado desde ontem.
   */
  it("nasce com a contagem que a linha já trazia, e não em zero", () => {
    expect(fonte, "a memória passou a nascer vazia — tudo acende ao abrir a tela").toContain(
      "useRef(quantos)",
    );
  });

  /** Quem abriu, leu. Manter aceso depois ensinaria a ignorar o sinal. */
  it("apaga ao abrir a conversa", () => {
    expect(fonte).toMatch(/if\s*\(aberto\)\s*setChegou\(false\)/);
  });

  /**
   * O FUNDO PRÓPRIO é o que faz o marcador SOBREPOR a cor da linha em vez de se diluir nela — era
   * essa a reclamação. Herdar a cor do texto é como ele era, e é o estado ao qual não pode voltar.
   */
  it("tem fundo próprio quando há recado, em vez de herdar a cor da linha", () => {
    expect(fonte, "o marcador voltou a herdar a cor da linha e some no fundo dela").toContain(
      "bg-foreground",
    );
  });

  it("usa a animação declarada no globals, e não uma inventada na marra", () => {
    expect(fonte).toContain("animate-recado-chamando");
  });
});

/**
 * A ANIMAÇÃO RESPEITA QUEM PEDE MENOS MOVIMENTO — e continua avisando.
 *
 * `prefers-reduced-motion` não é "não me avise": é "não me faça mover". Desligar o aviso junto com o
 * movimento seria trocar um problema de acessibilidade por outro, e é o que a folha de estilo evita
 * deixando o anel aceso e parado.
 */
describe("a folha de estilo do recado", () => {
  const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");

  it("declara a animação", () => {
    expect(css).toContain("@keyframes recado-chamando");
  });

  it("com prefers-reduced-motion o movimento para, mas o sinal FICA aceso", () => {
    const bloco = css.slice(css.lastIndexOf("prefers-reduced-motion: reduce"));
    expect(bloco).toContain("animate-recado-chamando");
    expect(bloco, "o aviso sumiu junto com o movimento").toContain("box-shadow");
  });
});
