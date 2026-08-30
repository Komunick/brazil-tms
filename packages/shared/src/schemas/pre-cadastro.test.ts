import { describe, expect, it } from "vitest";
import { preCadastroSchema } from "./pre-cadastro";

/**
 * O ENVIO MÍNIMO que o formulário faz — os campos que ele sempre manda.
 *
 * Os de endereço ficam de fora de propósito: o servidor os aceita como opcionais para não quebrar
 * quem estiver com a página antiga aberta, e é justamente essa opcionalidade que os testes abaixo
 * exercitam.
 */
const BASE = {
  nome: "Motorista de Teste",
  cpf: "390.533.447-05",
  celular: "(71) 99206-7086",
  cep: "41770-395",
  possuiMopp: "nao",
  possuiToxicologico: "nao",
  ciencia: "true",
} as const;

describe("campo opcional vazio conta como AUSÊNCIA", () => {
  /**
   * O defeito que este teste tranca, encontrado em produção em 30/08.
   *
   * Um `<input>` vazio vira `""` no `FormData`, nunca `undefined`. O `.optional()` do Zod só pula
   * `undefined` — a string vazia CAÍA na regra de duas letras da UF, falhava, e derrubava o envio
   * inteiro com `sem_ciencia_de_erro`, que não explica nada a ninguém.
   *
   * E o formulário manda vazio com facilidade: quando o CEP não resolve, os campos ficam em branco.
   * O CEP do primeiro cadastro real recebido — `40390-294` — o ViaCEP não conhece. Ou seja, bastava
   * alguém de um CEP desconhecido para perder o cadastro.
   */
  it("UF vazia não recusa o envio", () => {
    const r = preCadastroSchema.safeParse({ ...BASE, uf: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.uf).toBeUndefined();
  });

  it("endereço todo vazio não recusa o envio", () => {
    const r = preCadastroSchema.safeParse({
      ...BASE,
      logradouro: "",
      complemento: "",
      bairro: "",
      cidade: "",
      uf: "",
      numero: "",
    });
    expect(r.success).toBe(true);
  });

  it("mas UF ERRADA continua sendo recusada — vazio é ausência, lixo é lixo", () => {
    // A distinção é o ponto: "não informou" passa, "informou errado" não.
    expect(preCadastroSchema.safeParse({ ...BASE, uf: "BAH" }).success).toBe(false);
    expect(preCadastroSchema.safeParse({ ...BASE, uf: "1" }).success).toBe(false);
  });

  it("UF informada continua normalizada para maiúscula", () => {
    const r = preCadastroSchema.safeParse({ ...BASE, uf: "ba" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.uf).toBe("BA");
  });
});
