import { describe, expect, it } from "vitest";
import {
  CAMPOS_DA_CNH,
  camposDaLeitura,
  cnhLidaSchema,
  dataBrParaIso,
  fundirCampos,
  quantosLidos,
} from "./cnh-lida";

/**
 * A REGRA QUE ESTES TESTES EXISTEM PARA TRAVAR: campo não lido fica vazio e assinalado, nunca
 * inventado. Um valor plausível e errado é pior do que um vazio — ninguém confere o que parece
 * certo, e um RG bem formado no lugar certo atravessa a conferência sem que ninguém olhe duas vezes.
 */

describe("o que a leitura devolve", () => {
  it("campo ausente vira VAZIO e ASSINALADO, e não some", () => {
    const campos = camposDaLeitura({ nome: "MARCOS ANTONIO DA SILVA" });
    // O Renach não veio. Ele PRECISA existir na estrutura: sem isso a tela não distingue
    // "não tentamos ler" de "tentamos e não deu".
    expect(campos.renach).toEqual({ valor: null, origem: null });
    expect(campos.nome).toEqual({ valor: "MARCOS ANTONIO DA SILVA", origem: "cnh" });
    expect(Object.keys(campos)).toHaveLength(CAMPOS_DA_CNH.length);
  });

  it("string vazia e só espaços contam como NÃO LIDO", () => {
    const campos = camposDaLeitura({ nome: "  ", rg: "" });
    expect(campos.nome).toEqual({ valor: null, origem: null });
    expect(campos.rg).toEqual({ valor: null, origem: null });
  });

  it("data brasileira vira ISO", () => {
    expect(camposDaLeitura({ dataNascimento: "10/05/1987" }).dataNascimento).toEqual({
      valor: "1987-05-10",
      origem: "cnh",
    });
  });

  it("data JÁ em ISO passa sem ser mexida", () => {
    expect(camposDaLeitura({ validade: "2029-03-15" }).validade?.valor).toBe("2029-03-15");
  });

  /**
   * Este é o teste mais importante do arquivo. Uma data ilegível gravada como texto atravessaria a
   * conferência (parece uma data) e só quebraria lá na gerenciadora, longe de quem digitou.
   */
  it("data que não dá para ler vira NÃO LIDO, e não texto podre", () => {
    for (const ruim of ["1O/O5/87", "10/05/87", "32/01/2020", "10/13/2020", "ontem"]) {
      expect(camposDaLeitura({ dataNascimento: ruim }).dataNascimento).toEqual({
        valor: null,
        origem: null,
      });
    }
  });

  it("ano de dois dígitos NÃO é completado — adivinhar o século é palpite", () => {
    expect(dataBrParaIso("10/05/87")).toBeNull();
  });

  it("CPF vira dígitos; CPF incompleto vira NÃO LIDO", () => {
    expect(camposDaLeitura({ cpf: "390.533.447-05" }).cpf?.valor).toBe("39053344705");
    expect(camposDaLeitura({ cpf: "390.533.4" }).cpf).toEqual({ valor: null, origem: null });
  });
});

describe("o esquema", () => {
  it("aceita leitura parcial — a ausência é informação, não erro", () => {
    // Uma foto com reflexo num canto não pode invalidar os treze campos que saíram bem.
    expect(cnhLidaSchema.safeParse({ nome: "ANA" }).success).toBe(true);
    expect(cnhLidaSchema.safeParse({}).success).toBe(true);
  });

  it("recusa sexo fora do domínio em vez de aceitar qualquer letra", () => {
    expect(cnhLidaSchema.safeParse({ sexo: "X" }).success).toBe(false);
    expect(cnhLidaSchema.safeParse({ sexo: "F" }).success).toBe(true);
  });
});

describe("a fusão com o que já se sabe", () => {
  it("o que o motorista DIGITOU vence a leitura da foto", () => {
    const existentes = { cpf: { valor: "39053344705", origem: "digitado" as const } };
    const daFoto = camposDaLeitura({ cpf: "111.444.777-35", nome: "ANA" });
    const fundido = fundirCampos(existentes, daFoto);
    // O CPF digitado é o que decidiu se isto é cadastro novo ou atualização. Se a leitura o
    // trocasse, a linha passaria a ter chave diferente daquela pela qual foi criada.
    expect(fundido.cpf).toEqual({ valor: "39053344705", origem: "digitado" });
    expect(fundido.nome?.valor).toBe("ANA");
  });

  it("campo NÃO LIDO não apaga o que já existia", () => {
    const existentes = { nome: { valor: "MARCOS", origem: "digitado" as const } };
    const fundido = fundirCampos(existentes, camposDaLeitura({}));
    expect(fundido.nome).toEqual({ valor: "MARCOS", origem: "digitado" });
  });

  it("campo que só a leitura tentou continua assinalado", () => {
    const fundido = fundirCampos({}, camposDaLeitura({ nome: "ANA" }));
    expect(fundido.renach).toEqual({ valor: null, origem: null });
  });
});

describe("a contagem que a fila mostra", () => {
  it("conta só o que saiu legível", () => {
    expect(quantosLidos(camposDaLeitura({ nome: "ANA", rg: "123", categoria: "AE" }))).toEqual({
      lidos: 3,
      total: CAMPOS_DA_CNH.length,
    });
  });

  it("leitura totalmente falha conta zero, sem estourar", () => {
    expect(quantosLidos(camposDaLeitura({})).lidos).toBe(0);
  });
});
