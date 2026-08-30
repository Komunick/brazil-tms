import { describe, expect, it } from "vitest";
import {
  COD_PROFISSAO_MOTORISTA,
  corpoDoMotorista,
  motivosDeNaoCadastrar,
  type DadosParaSetMotorista,
} from "./motorista-corpo";
import type { CamposDoPreCadastro } from "./cnh-lida";

/** Um cadastro completo — o estado em que o envio é permitido. */
const campo = (v: string): { valor: string; origem: "cnh" } => ({ valor: v, origem: "cnh" });

const COMPLETO: CamposDoPreCadastro = {
  cpf: campo("39053344705"),
  nome: campo("JOAQUIM BARRETO DE SOUZA"),
  sexo: campo("M"),
  dataNascimento: campo("1985-03-14"),
  nomeMae: campo("TEREZINHA BARRETO DE SOUZA"),
  rg: campo("2098431"),
  orgaoEmissorRg: campo("SSP"),
  ufEmissorRg: campo("BA"),
  numeroRegistro: campo("04256813970"),
  numeroFormulario: campo("BA118392044"),
  numeroSeguranca: campo("00417739265"),
  renach: campo("BA954120388"),
  categoria: campo("AE"),
  validade: campo("2029-07-22"),
  primeiraHabilitacao: campo("2006-11-09"),
  logradouro: campo("Rua Edístio Pondé"),
  numero: campo("120"),
  complemento: campo("Apto 302"),
  bairro: campo("Stiep"),
  cep: campo("41770395"),
  celular: campo("71992067086"),
  possuiMopp: campo("nao"),
};

const PRONTO: DadosParaSetMotorista = {
  campos: COMPLETO,
  codIbgeNatal: 2910800,
  codIbgeResidencia: 2927408,
  cpfDivergente: false,
};

describe("o que impede o envio", () => {
  it("cadastro completo não tem motivo nenhum", () => {
    expect(motivosDeNaoCadastrar(PRONTO)).toEqual([]);
  });

  /**
   * A lição do `pre-sm-corpo.ts` da 027: a pessoa está na fila para RESOLVER. Descobrir que falta o
   * RG, resolver, e só então descobrir que também falta o Renach são duas idas em vez de uma.
   */
  it("devolve TODOS os motivos, nunca só o primeiro", () => {
    const m = motivosDeNaoCadastrar({
      ...PRONTO,
      campos: { ...COMPLETO, rg: { valor: null, origem: null }, renach: { valor: null, origem: null } },
    });
    expect(m).toContain("sem_rg");
    expect(m).toContain("sem_renach");
    expect(m).toHaveLength(2);
  });

  it("o que precisa de decisão humana vem ANTES do que se resolve digitando", () => {
    const m = motivosDeNaoCadastrar({
      ...PRONTO,
      cpfDivergente: true,
      campos: { ...COMPLETO, rg: { valor: null, origem: null } },
    });
    // `cpf_divergente` exige alguém decidir; `sem_rg` se resolve olhando a foto ao lado.
    expect(m.indexOf("cpf_divergente")).toBeLessThan(m.indexOf("sem_rg"));
  });

  /**
   * O caso real: o primeiro cadastro que o formulário recebeu trazia a CNH de outra pessoa.
   * Enviado, gastaria uma solicitação de pesquisa — a metade cobrada — para voltar reprovado.
   */
  it("CPF divergente BLOQUEIA, mesmo com tudo o mais completo", () => {
    expect(motivosDeNaoCadastrar({ ...PRONTO, cpfDivergente: true })).toEqual(["cpf_divergente"]);
  });

  it("IBGE que não casou é motivo — natal e residência separados", () => {
    expect(motivosDeNaoCadastrar({ ...PRONTO, codIbgeNatal: null })).toEqual(["sem_ibge_natal"]);
    expect(motivosDeNaoCadastrar({ ...PRONTO, codIbgeResidencia: null })).toEqual([
      "sem_ibge_residencia",
    ]);
  });

  it("CPF mal formado conta como ausente, não passa por cima", () => {
    expect(
      motivosDeNaoCadastrar({ ...PRONTO, campos: { ...COMPLETO, cpf: campo("11111111111") } }),
    ).toEqual(["sem_cpf"]);
  });
});

describe("o corpo montado", () => {
  const corpo = corpoDoMotorista(PRONTO);

  it("as datas viram brasileiras — o TMS guarda ISO, a gerenciadora recebe DD/MM/AAAA", () => {
    expect(corpo.DataNascimento).toBe("14/03/1985");
    expect(corpo.DataVencCNH).toBe("22/07/2029");
    expect(corpo.DtPrimEmissCNH).toBe("09/11/2006");
  });

  it("a profissão é 30, fixo e medido — nunca adivinhado", () => {
    expect(corpo.CodProfissao).toBe(30);
    expect(COD_PROFISSAO_MOTORISTA).toBe(30);
  });

  it("MOPP vira uma letra, não o 'sim'/'nao' do formulário", () => {
    expect(corpo.PossuiMOPP).toBe("N");
    expect(corpo.DtVencMOPP).toBe("");
  });

  it("quem TEM MOPP manda a validade junto", () => {
    const c = corpoDoMotorista({
      ...PRONTO,
      campos: { ...COMPLETO, possuiMopp: campo("sim"), validadeMopp: campo("2027-05-10") },
    });
    expect(c.PossuiMOPP).toBe("S");
    expect(c.DtVencMOPP).toBe("10/05/2027");
  });

  it("quem NÃO tem MOPP não manda validade, mesmo que ela exista nos campos", () => {
    // Data sem o curso correspondente é dado que ninguém pediu, e que a auditoria trataria como fato.
    const c = corpoDoMotorista({
      ...PRONTO,
      campos: { ...COMPLETO, possuiMopp: campo("nao"), validadeMopp: campo("2027-05-10") },
    });
    expect(c.DtVencMOPP).toBe("");
  });

  it("CPF e celular vão só com dígitos", () => {
    const c = corpoDoMotorista({
      ...PRONTO,
      campos: { ...COMPLETO, cpf: campo("390.533.447-05"), celular: campo("(71) 99206-7086") },
    });
    expect(c.CPF).toBe("39053344705");
    expect(c.Celular).toBe("71992067086");
  });

  it("os dois códigos IBGE são DIFERENTES e não se confundem", () => {
    // Natal e residência são campos distintos no manual, e trocá-los passaria despercebido.
    expect(corpo.CodIBGECidadeNatal).toBe(2910800);
    expect(corpo.CodIBGECidade).toBe(2927408);
  });

  it("campo opcional ausente vira string VAZIA, nunca nulo", () => {
    // DataSnap trata ausência e nulo de formas diferentes; vazio é o que o manual mostra.
    const c = corpoDoMotorista({
      ...PRONTO,
      campos: { ...COMPLETO, complemento: { valor: null, origem: null } },
    });
    expect(c.Complemento).toBe("");
  });

  it("o endereço vai por extenso, não só o CEP", () => {
    expect(corpo.Endereco).toBe("Rua Edístio Pondé");
    expect(corpo.Numero).toBe("120");
    expect(corpo.Bairro).toBe("Stiep");
    expect(corpo.CEP).toBe("41770395");
  });
});
