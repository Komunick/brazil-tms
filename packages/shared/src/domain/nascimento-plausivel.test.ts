import { describe, expect, it } from "vitest";
import { nascimentoPlausivel } from "./motorista-corpo";

/**
 * A DATA DE NASCIMENTO QUE A GERENCIADORA ACEITOU (2026-09-02).
 *
 * O primeiro `setMotorista` real da empresa foi enviado com `"DataNascimento": "2035-04-25"` — uma
 * pessoa nascida no futuro. **Ela aceitou**, com `CodErro 0`: a validação desse campo não existe do
 * lado de lá. O motorista ficou lá dentro com a data errada, e desfazer no cadastro DELES custa.
 *
 * Não é erro de leitura exótico: 1985 vira 2035 com um dígito trocado, e quem confere na tela lê
 * "25/04" e passa o olho pelo ano.
 *
 * ── A REGRA É FROUXA DE PROPÓSITO ─────────────────────────────────────────────────────────────
 *
 * Ela não tenta adivinhar a data certa. Ela recusa o IMPOSSÍVEL: futuro, e idade fora do intervalo
 * em que um motorista cabe. Apertar mais transformaria o guarda numa fonte de bloqueio para gente
 * de verdade — e um guarda que atrapalha é desligado.
 */
const HOJE = new Date("2026-09-02T12:00:00Z");

describe("nascimentoPlausivel", () => {
  it("recusa o caso real que a gerenciadora aceitou", () => {
    expect(nascimentoPlausivel("2035-04-25", HOJE)).toBe(false);
  });

  it("aceita uma data de motorista comum", () => {
    expect(nascimentoPlausivel("1985-04-25", HOJE)).toBe(true);
  });

  it("entende as duas formas que a leitura da CNH e o formulário produzem", () => {
    expect(nascimentoPlausivel("25/04/1985", HOJE)).toBe(true);
    expect(nascimentoPlausivel("25/04/2035", HOJE)).toBe(false);
  });

  describe("as bordas do intervalo", () => {
    it("recusa quem seria novo demais para dirigir caminhão", () => {
      expect(nascimentoPlausivel("2020-01-01", HOJE)).toBe(false);
    });

    it("recusa idade que nenhum motorista na ativa teria", () => {
      expect(nascimentoPlausivel("1900-01-01", HOJE)).toBe(false);
    });

    it("aceita os extremos plausíveis", () => {
      expect(nascimentoPlausivel("2008-01-01", HOJE)).toBe(true); // 18 anos
      expect(nascimentoPlausivel("1945-01-01", HOJE)).toBe(true); // 81 anos
    });
  });

  /**
   * TEXTO QUE NÃO É DATA NÃO BLOQUEIA AQUI, e a razão é evitar dois guardas para a mesma ausência.
   *
   * Campo vazio ou ilegível já é `sem_nascimento`. Se este também bloqueasse, a tela mostraria dois
   * motivos para um problema só — e os dois se contradiriam no primeiro ajuste de qualquer um deles.
   */
  it("não opina sobre o que não é data — disso cuida `sem_nascimento`", () => {
    expect(nascimentoPlausivel("", HOJE)).toBe(true);
    expect(nascimentoPlausivel("ilegível", HOJE)).toBe(true);
  });
});
