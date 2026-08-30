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

/**
 * "TENHO" + UMA DATA QUE JÁ PASSOU (30/08, achado no primeiro cadastro real).
 *
 * O Alexandre mandou `possuiMopp: sim` com `validadeMopp: 1990-01-01`. Nos DOIS envios. E o TMS
 * aceitou calado as duas vezes — a validação só exigia que a data existisse.
 *
 * A data não vem do formulário: os dois campos são `<input type="date">` crus, sem `value`, `min`
 * nem `max` (conferido na página em produção). É o seletor nativo do celular abrindo num ano baixo.
 * Por isso a regra mora no ESQUEMA: o formulário pode ganhar um `min` amanhã, e uma requisição
 * feita fora dele chegaria igual.
 */
describe("validade que já passou", () => {
  const ontem = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  };
  const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const amanha = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  };

  it("recusa o MOPP vencido — o caso de 1990 que passou batido", () => {
    const r = preCadastroSchema.safeParse({
      ...BASE,
      possuiMopp: "sim",
      validadeMopp: "1990-01-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const erro = r.error.issues.find((i) => i.path[0] === "validadeMopp");
      expect(erro?.message).toContain("já passou");
    }
  });

  it("recusa também o de ontem — não é só data absurda", () => {
    const r = preCadastroSchema.safeParse({
      ...BASE,
      possuiMopp: "sim",
      validadeMopp: ontem(),
    });
    expect(r.success).toBe(false);
  });

  /**
   * VENCER HOJE AINDA VALE. Recusar por isso mandaria embora quem está em dia por questão de horas
   * — e no dia do evento seria uma pessoa parada no estande sem entender o motivo.
   */
  it("aceita o que vence HOJE", () => {
    const r = preCadastroSchema.safeParse({
      ...BASE,
      possuiMopp: "sim",
      validadeMopp: hoje(),
    });
    expect(r.success).toBe(true);
  });

  it("aceita o que vence amanhã", () => {
    expect(
      preCadastroSchema.safeParse({ ...BASE, possuiMopp: "sim", validadeMopp: amanha() }).success,
    ).toBe(true);
  });

  it("vale igual para o toxicológico", () => {
    const r = preCadastroSchema.safeParse({
      ...BASE,
      possuiToxicologico: "sim",
      validadeToxicologico: "1990-01-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "validadeToxicologico")).toBe(true);
    }
  });

  /**
   * Quem NÃO tem não é incomodado com data nenhuma — nem para reclamar de vencida. A validade sem o
   * documento correspondente já é descartada pela regra de cima.
   */
  it("quem não tem MOPP passa mesmo com data velha pendurada", () => {
    const r = preCadastroSchema.safeParse({
      ...BASE,
      possuiMopp: "nao",
      validadeMopp: "1990-01-01",
    });
    expect(r.success).toBe(true);
  });

  /**
   * UMA MENSAGEM SÓ por campo vazio. Sem esta guarda, quem deixa a data em branco levaria duas
   * reclamações sobre o mesmo campo — "informe" e "já passou" —, o que no celular é uma tela de
   * erros contraditórios.
   */
  it("campo vazio reclama que FALTA, não que venceu", () => {
    const r = preCadastroSchema.safeParse({ ...BASE, possuiMopp: "sim" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const doCampo = r.error.issues.filter((i) => i.path[0] === "validadeMopp");
      expect(doCampo).toHaveLength(1);
      expect(doCampo[0]?.message).toContain("Informe");
    }
  });
});

/**
 * A UF AUSENTE (30/08) — achado escrevendo os testes acima, não em produção.
 *
 * O `.optional()` estava dentro do pipe, depois do transform, então o `z.string()` de fora seguia
 * obrigatório: `uf: ""` passava e `uf` ausente devolvia "Required", derrubando o envio inteiro.
 *
 * Nunca doeu porque o `FormData` manda todo campo do formulário, mesmo vazio — e é justamente por
 * isso que importa: uma requisição montada FORA do site não manda o que não tem. É a armadilha 2
 * desta fatia levada a sério.
 */
describe("a UF é opcional de verdade", () => {
  it("aceita o corpo SEM a chave `uf`", () => {
    expect(preCadastroSchema.safeParse({ ...BASE }).success).toBe(true);
  });

  it("aceita `uf` vazia, como o formulário manda quando o CEP não resolve", () => {
    expect(preCadastroSchema.safeParse({ ...BASE, uf: "" }).success).toBe(true);
  });

  it("continua recusando UF malformada — opcional não é 'aceita qualquer coisa'", () => {
    expect(preCadastroSchema.safeParse({ ...BASE, uf: "BAHIA" }).success).toBe(false);
  });

  it("normaliza para maiúscula", () => {
    const r = preCadastroSchema.safeParse({ ...BASE, uf: " ba " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.uf).toBe("BA");
  });
});
