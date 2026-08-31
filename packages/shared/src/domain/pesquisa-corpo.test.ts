import { describe, expect, it } from "vitest";
import {
  COD_FILIAL,
  corpoDaPesquisa,
  motivosDeNaoPesquisar,
  SITUACOES_DA_PESQUISA,
  corpoDoResultado,
  pesquisaAcabou,
  type DadosParaPesquisa,
} from "./pesquisa-corpo";

/**
 * A METADE QUE CUSTA (fatia 028, etapa 6).
 *
 * O `setMotorista` é de graça; esta chamada a gerenciadora cobra, por solicitação, e não há
 * homologação — a primeira execução já é uma cobrança real. Por isso a decisão de gastar mora numa
 * função pura, exercitável sem gastar nada, e não no meio de um job.
 */

const PRONTO: DadosParaPesquisa = {
  campos: {},
  cpf: "07600530570",
  enviadoAGerenciadora: true,
  jaPedida: false,
  cpfDivergente: false,
  vinculo: "F",
};

const OPCOES = { expressa: false, pesquisaPlus: false, biometrica: false };

describe("o que impede pedir a pesquisa", () => {
  it("cadastro pronto não tem motivo nenhum", () => {
    expect(motivosDeNaoPesquisar(PRONTO)).toEqual([]);
  });

  /**
   * Pesquisar quem não foi cadastrado é gastar por nada: a gerenciadora não tem a quem associar o
   * resultado. E é o primeiro da lista porque não se resolve nesta tela.
   */
  it("bloqueia quem ainda não foi enviado à gerenciadora", () => {
    const m = motivosDeNaoPesquisar({ ...PRONTO, enviadoAGerenciadora: false });
    expect(m).toEqual(["nao_enviado"]);
  });

  it("bloqueia a segunda vez — o segundo clique custaria uma segunda pesquisa", () => {
    expect(motivosDeNaoPesquisar({ ...PRONTO, jaPedida: true })).toEqual(["ja_pedida"]);
  });

  /**
   * O caso REAL do primeiro cadastro: a CNH trazia CPF 007.588.154-33 e o motorista digitou
   * 076.005.305-70 — os dois válidos. Pesquisar assim gastaria para receber o resultado de outra
   * pessoa, que é pior do que não pesquisar.
   */
  it("bloqueia CPF divergente — pesquisar o errado gasta para saber de outro", () => {
    expect(motivosDeNaoPesquisar({ ...PRONTO, cpfDivergente: true })).toEqual(["cpf_divergente"]);
  });

  it("CPF mal formado conta como ausente", () => {
    expect(motivosDeNaoPesquisar({ ...PRONTO, cpf: "11111111111" })).toEqual(["sem_cpf"]);
  });

  /**
   * O vínculo é obrigatório no método e o formulário NÃO o pergunta — o motorista não sabe se é
   * frota, agregado ou terceiro. Ausência é motivo, nunca um chute para "T".
   */
  it("bloqueia sem vínculo, em vez de chutar", () => {
    expect(motivosDeNaoPesquisar({ ...PRONTO, vinculo: null })).toEqual(["sem_vinculo"]);
  });

  it("devolve TODOS os motivos, nunca só o primeiro", () => {
    const m = motivosDeNaoPesquisar({
      ...PRONTO,
      enviadoAGerenciadora: false,
      vinculo: null,
      cpf: "",
    });
    expect(m).toContain("nao_enviado");
    expect(m).toContain("sem_cpf");
    expect(m).toContain("sem_vinculo");
    expect(m).toHaveLength(3);
  });

  it("o que não se resolve nesta tela vem ANTES do que se resolve nela", () => {
    const m = motivosDeNaoPesquisar({ ...PRONTO, enviadoAGerenciadora: false, vinculo: null });
    // Enviar é outra ação; escolher o vínculo é um clique aqui mesmo.
    expect(m.indexOf("nao_enviado")).toBeLessThan(m.indexOf("sem_vinculo"));
  });
});

describe("o corpo do pedido", () => {
  it("é pessoa, com o CPF só em dígitos", () => {
    const c = corpoDaPesquisa({ ...PRONTO, cpf: "076.005.305-70" }, OPCOES);
    expect(c.TipoIdentificacao).toBe("P");
    expect(c.Identificacao).toBe("07600530570");
  });

  it("a filial é a medida em produção, não um palpite", () => {
    expect(corpoDaPesquisa(PRONTO, OPCOES).CodFilial).toBe(9332);
    expect(COD_FILIAL).toBe(9332);
  });

  it("leva o vínculo escolhido", () => {
    expect(corpoDaPesquisa({ ...PRONTO, vinculo: "A" }, OPCOES).Vinculo).toBe("A");
    expect(corpoDaPesquisa({ ...PRONTO, vinculo: "T" }, OPCOES).Vinculo).toBe("T");
  });

  /**
   * AS TRÊS OPÇÕES QUE ENCARECEM: nenhuma tem padrão no código. Este teste existe para travar isso
   * — se alguém puser um `?? true` em qualquer uma delas, é dinheiro gasto por decisão do código.
   */
  it("as três opções pagas saem N quando ninguém marcou", () => {
    const c = corpoDaPesquisa(PRONTO, OPCOES);
    expect(c.Expressa).toBe("N");
    expect(c.PesquisaPlus).toBe("N");
    expect(c.PesquisaBiometrica).toBe("N");
  });

  it("e saem S exatamente quando alguém marcou", () => {
    const c = corpoDaPesquisa(PRONTO, { expressa: true, pesquisaPlus: false, biometrica: true });
    expect(c.Expressa).toBe("S");
    expect(c.PesquisaPlus).toBe("N");
    expect(c.PesquisaBiometrica).toBe("S");
  });
});

describe("as situações que a gerenciadora devolve", () => {
  it("traduz as do manual", () => {
    expect(SITUACOES_DA_PESQUISA.AD).toBe("Adequado ao risco");
    expect(SITUACOES_DA_PESQUISA.EP).toBe("Em pesquisa");
    expect(SITUACOES_DA_PESQUISA.NA).toBe("Inconclusivo");
  });

  /**
   * Código desconhecido NÃO tem tradução, de propósito: quem chama mostra o código cru. É assim que
   * se descobre um código novo a partir do dado real, em vez de tarde demais.
   */
  it("não inventa tradução para código que o manual não lista", () => {
    expect(SITUACOES_DA_PESQUISA.ZZ).toBeUndefined();
  });
});

/**
 * QUANDO PARAR DE PERGUNTAR (31/08, etapa 7).
 *
 * O job agendado busca o resultado de graça a cada meia hora. Sem esta lista ele perguntaria para
 * sempre sobre cadastros já resolvidos.
 */
describe("as situações finais", () => {
  it("os três desfechos param a busca", () => {
    for (const s of ["AD", "NA", "EX"]) expect(pesquisaAcabou(s)).toBe(true);
  });

  it("o que ainda anda continua sendo perguntado", () => {
    for (const s of ["EP", "AP", "AC", "SP", "B"]) expect(pesquisaAcabou(s)).toBe(false);
  });

  /**
   * Código DESCONHECIDO continua sendo perguntado, e é deliberado: se a gerenciadora inventar um
   * status novo, o pior que acontece é uma pergunta a mais — nunca uma pesquisa dada como resolvida
   * sem estar, que seria alguém esperando por um desfecho que nunca chega.
   */
  it("situação desconhecida NÃO conta como desfecho", () => {
    expect(pesquisaAcabou("ZZ")).toBe(false);
    expect(pesquisaAcabou(null)).toBe(false);
    expect(pesquisaAcabou(undefined)).toBe(false);
  });
});

describe("o corpo da consulta de resultado", () => {
  it("pergunta por CPF e vínculo, não pelo código devolvido", () => {
    const c = corpoDoResultado("076.005.305-70", "A");
    expect(c).toEqual({
      CodFilial: 9332,
      TipoIdentificacao: "P",
      Identificacao: "07600530570",
      Vinculo: "A",
    });
  });
});
