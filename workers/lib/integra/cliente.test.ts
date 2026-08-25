import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A GUARDA DO FR-004: a Pré-SM NÃO é efetivada automaticamente.
 *
 * ── POR QUE UM TESTE QUE LÊ O ARQUIVO ─────────────────────────────────────────────────────────
 *
 * FR-004 é um requisito NEGATIVO — "o sistema não deve fazer X" —, e requisito negativo sem guarda
 * é só intenção. Daqui a três meses ninguém lembra por que a efetivação ficou de fora, alguém
 * acrescenta `setEfetivaPreSM` "para completar a integração", e nada quebra.
 *
 * O que sustenta a regra é isto falhar.
 *
 * ── E POR QUE NÃO É PARANOIA ──────────────────────────────────────────────────────────────────
 *
 * Efetivar converte a pré-solicitação em monitoramento de verdade: a escolta começa a contar, e a
 * operação perde a chance de conferir antes. A decisão de manter isso humano foi explícita
 * (spec, Out of Scope) e não é óbvia olhando só o código — o método existe na API, ao lado dos que
 * usamos, e parece a continuação natural.
 */
describe("o cliente NÃO efetiva Pré-SM (FR-004)", () => {
  const fonte = readFileSync(new URL("./cliente.ts", import.meta.url), "utf8");

  it("não expõe setEfetivaPreSM", () => {
    // Se este teste falhar, leia o "Out of Scope" da spec 026 antes de apagá-lo.
    expect(fonte).not.toMatch(/setEfetivaPreSM/);
  });

  it("os três métodos que ele PODE chamar continuam lá", () => {
    for (const m of ["setPreSMdeModelo", "getStatusPreSM", "setCancelaPreSM"]) {
      expect(fonte).toContain(m);
    }
  });
});

describe("o formato da chamada", () => {
  const fonte = readFileSync(new URL("./cliente.ts", import.meta.url), "utf8");

  /**
   * O nome do método vai NA URL, entre aspas. Medido, não lido: sem as aspas a API devolve 404.
   * Um refactor que "limpe" o `encodeURIComponent` quebraria toda a integração de uma vez.
   */
  it("põe o nome do método entre aspas na URL", () => {
    expect(fonte).toMatch(/encodeURIComponent\(`"\$\{metodo\}"`\)/);
  });

  /**
   * O erro NÃO vem no HTTP: toda resposta é 200, e quem decide é o `CodErro`. Confiar no
   * `resposta.ok` faria toda recusa da gerenciadora passar por sucesso.
   */
  it("decide pelo CodErro, não pelo status HTTP", () => {
    expect(fonte).toMatch(/codErro !== 0/);
  });

  /** Rede de terceiro pode pendurar; sem teto, um job fica preso segurando a fila. */
  it("tem tempo limite", () => {
    expect(fonte).toMatch(/AbortSignal\.timeout/);
  });
});
