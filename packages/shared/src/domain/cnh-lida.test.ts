import { describe, expect, it } from "vitest";
import {
  CAMPOS_DA_CNH,
  camposDaLeitura,
  camposDeclarados,
  conferirCpfDoDocumento,
  cnhLidaSchema,
  dataBrParaIso,
  fundirCampos,
  quantosLidos,
  type CamposDoPreCadastro,
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

describe("o CPF do documento contra o que a pessoa digitou", () => {
  /**
   * O caso real que fez isto existir: o primeiro cadastro recebido veio com um nome e CPF, e a
   * foto era a CNH de outra pessoa. Só apareceu porque alguém abriu o arquivo e olhou.
   */
  it("CPF diferente é DIVERGÊNCIA, e diz qual está no documento", () => {
    const r = conferirCpfDoDocumento("07600530570", { cpf: "007.588.154-33" });
    expect(r).toEqual({ estado: "diverge", cpfNoDocumento: "00758815433" });
  });

  it("mesmo CPF confere, com ou sem pontuação dos dois lados", () => {
    expect(conferirCpfDoDocumento("39053344705", { cpf: "390.533.447-05" }).estado).toBe("confere");
    expect(conferirCpfDoDocumento("390.533.447-05", { cpf: "39053344705" }).estado).toBe("confere");
  });

  it("CPF não lido NÃO é divergência — ausência não acusa", () => {
    // Acusar por ausência seria o mesmo palpite que o resto deste arquivo existe para impedir.
    expect(conferirCpfDoDocumento("39053344705", {}).estado).toBe("nao_lido");
    expect(conferirCpfDoDocumento("39053344705", { cpf: null }).estado).toBe("nao_lido");
    expect(conferirCpfDoDocumento("39053344705", { cpf: "390.533" }).estado).toBe("nao_lido");
  });
});

/**
 * O QUE O MOTORISTA DECLAROU (30/08) — o conserto do primeiro cadastro real.
 *
 * Medido em produção naquele dia: 16 valores no envio, `campos` com UMA chave, e essa era o estado
 * da leitura. A conferência abria vazia com o endereço da pessoa ali do lado.
 */
describe("os campos declarados pelo motorista", () => {
  const DO_FORMULARIO = {
    nome: "Alexandre Morais Barros",
    cpf: "07600530570",
    celular: "71992067086",
    cep: "41770395",
    logradouro: "Rua Edístio Pondé",
    numero: "120",
    complemento: "Apto 302",
    bairro: "Stiep",
    cidade: "Salvador",
    uf: "BA",
    possuiMopp: "nao",
    // Os quatro que o formulário manda e o cadastro NÃO usa:
    ciencia: "sim",
    donoDosDocumentos: "sim",
    possuiToxicologico: "nao",
    validadeToxicologico: "",
  };

  it("traz os doze campos que o cadastro usa", () => {
    const c = camposDeclarados(DO_FORMULARIO);
    expect(Object.keys(c).sort()).toEqual([
      "bairro",
      "celular",
      "cep",
      "cidade",
      "complemento",
      "cpf",
      "logradouro",
      "nome",
      "numero",
      "possuiMopp",
      "uf",
    ]);
    expect(c.logradouro).toEqual({ valor: "Rua Edístio Pondé", origem: "declarado" });
  });

  /**
   * `declarado`, nunca `digitado`: o segundo quer dizer alguém do escritório preenchendo com o
   * documento à vista — o ato que ainda NÃO aconteceu. Marcar assim faria a conferência tratar uma
   * afirmação sem prova como fato já verificado, que é o oposto do que a tela existe para fazer.
   */
  it("a origem é `declarado`, e isso é o que separa afirmar de conferir", () => {
    const c = camposDeclarados(DO_FORMULARIO);
    for (const campo of Object.values(c)) expect(campo.origem).toBe("declarado");
  });

  /**
   * O endereço nasce do ViaCEP e `cep` é uma origem que existe — mas o formulário deixa EDITAR o que
   * o CEP trouxe e não diz o que foi mexido. Marcar tudo como `cep` afirmaria uma verificação que
   * não houve.
   */
  it("o endereço NÃO vira origem `cep` — o formulário deixa editar e não diz o quê", () => {
    const c = camposDeclarados(DO_FORMULARIO);
    expect(c.cep?.origem).toBe("declarado");
    expect(c.bairro?.origem).toBe("declarado");
  });

  it("deixa de fora o que o setMotorista não usa — inclusive o toxicológico", () => {
    // O toxicológico não existe em lugar nenhum da API da gerenciadora (manual em PDF, conferido).
    // Trazê-lo o faria parecer um campo que alguém corrige e envia.
    const c = camposDeclarados(DO_FORMULARIO);
    for (const fora of ["ciencia", "donoDosDocumentos", "possuiToxicologico", "validadeToxicologico"]) {
      expect(c[fora], fora).toBeUndefined();
    }
  });

  it("valor vazio não vira campo — vazio é ausência, não uma declaração", () => {
    const c = camposDeclarados({ nome: "Fulano", complemento: "", numero: "   " });
    expect(c.nome).toBeDefined();
    expect(c.complemento).toBeUndefined();
    expect(c.numero).toBeUndefined();
  });

  it("ignora o que não é texto sem estourar", () => {
    const c = camposDeclarados({ nome: 42, cpf: null, celular: { a: 1 }, bairro: "Stiep" });
    expect(Object.keys(c)).toEqual(["bairro"]);
  });

  /**
   * O CASO QUE MAIS IMPORTA: um reenvio não pode apagar a correção de quem já conferiu.
   *
   * A mesma `fundirCampos` do job da CNH, com a mesma regra — o existente vence. Sem isso, um
   * motorista que mandasse de novo desfaria o trabalho do escritório em silêncio.
   */
  it("o já conferido vence o reenvio", () => {
    const jaConferido: CamposDoPreCadastro = {
      logradouro: { valor: "Rua Edistio Ponde, 120", origem: "digitado" },
      rg: { valor: "2098431", origem: "cnh" },
    };
    const fundido = fundirCampos(jaConferido, camposDeclarados(DO_FORMULARIO));
    expect(fundido.logradouro).toEqual({ valor: "Rua Edistio Ponde, 120", origem: "digitado" });
    // E o que ele mandou de novo e ninguém tinha tocado entra normalmente.
    expect(fundido.bairro).toEqual({ valor: "Stiep", origem: "declarado" });
    // O que veio da CNH continua lá — o reenvio não apaga a leitura.
    expect(fundido.rg).toEqual({ valor: "2098431", origem: "cnh" });
  });
});

/**
 * LEITURA VELHA CEDE À NOVA; O QUE UMA PESSOA DISSE, NÃO (30/08).
 *
 * O caso que fez isto existir: o prompt da CNH foi corrigido, a releitura passou a acertar 18 de 18,
 * e SEIS campos errados continuaram no lugar — porque "o que já se sabe sempre vence" incluía o
 * resultado da leitura anterior. A releitura não conseguia consertar nada, que é o oposto do motivo
 * de ela existir.
 */
describe("a releitura corrige a leitura anterior", () => {
  it("substitui um valor cuja origem é `cnh` — o defeito de 30/08", () => {
    const antes: CamposDoPreCadastro = { categoria: { valor: "D", origem: "cnh" } };
    const nova: CamposDoPreCadastro = { categoria: { valor: "AE", origem: "cnh" } };
    expect(fundirCampos(antes, nova).categoria).toEqual({ valor: "AE", origem: "cnh" });
  });

  /**
   * A proteção original, intacta: um reenvio do motorista não pode apagar o que o escritório já
   * corrigiu olhando o documento. É o caso em que a máquina NÃO tem a palavra final.
   */
  it("NÃO substitui o que uma pessoa digitou", () => {
    const antes: CamposDoPreCadastro = { categoria: { valor: "AE", origem: "digitado" } };
    const nova: CamposDoPreCadastro = { categoria: { valor: "D", origem: "cnh" } };
    expect(fundirCampos(antes, nova).categoria).toEqual({ valor: "AE", origem: "digitado" });
  });

  it("NÃO substitui o que o motorista declarou no formulário", () => {
    const antes: CamposDoPreCadastro = { cpf: { valor: "07600530570", origem: "declarado" } };
    const nova: CamposDoPreCadastro = { cpf: { valor: "00758815433", origem: "cnh" } };
    // O caso REAL: a CNH traz um CPF diferente do digitado. O digitado manda — ele é a chave pela
    // qual o pré-cadastro foi criado —, e a divergência é acusada em separado, não sobrescrita.
    expect(fundirCampos(antes, nova).cpf).toEqual({ valor: "07600530570", origem: "declarado" });
  });

  /**
   * `null` da leitura sobre um valor existente continua sendo RUÍDO, não informação — inclusive
   * quando o existente também veio de uma leitura. Uma foto pior não pode apagar o que a anterior
   * conseguiu ler.
   */
  it("uma leitura que NÃO leu não apaga a que leu", () => {
    const antes: CamposDoPreCadastro = { renach: { valor: "BA711866475", origem: "cnh" } };
    const nova: CamposDoPreCadastro = { renach: { valor: null, origem: null } };
    expect(fundirCampos(antes, nova).renach).toEqual({ valor: "BA711866475", origem: "cnh" });
  });

  it("o campo tentado e não lido cede quando a nova finalmente lê", () => {
    const antes: CamposDoPreCadastro = { numeroSeguranca: { valor: null, origem: null } };
    const nova: CamposDoPreCadastro = { numeroSeguranca: { valor: "91262888055", origem: "cnh" } };
    expect(fundirCampos(antes, nova).numeroSeguranca).toEqual({
      valor: "91262888055",
      origem: "cnh",
    });
  });

  it("campo que só o existente tem continua lá", () => {
    const antes: CamposDoPreCadastro = { celular: { valor: "71999720309", origem: "declarado" } };
    expect(fundirCampos(antes, {}).celular).toEqual({ valor: "71999720309", origem: "declarado" });
  });
});
