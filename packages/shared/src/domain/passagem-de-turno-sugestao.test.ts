import { describe, expect, it } from "vitest";
import { SECOES_DO_SETOR, SETORES } from "./passagem-de-turno";
import {
  aplicarSugestao,
  perfilDoTipoDeVeiculo,
  rotaEscrita,
  secaoTemLH,
} from "./passagem-de-turno-sugestao";

/**
 * A REGRA QUE DECIDE SE A SUGESTÃO É SEGURA (2026-08-27).
 *
 * Preencher sozinho é conveniência; sobrescrever é perda de dado. E a perda aconteceria no pior
 * instante possível — quando a pessoa sai do campo —, apagando em silêncio justamente o que ela
 * sabia e o sistema não: a origem que o motorista relatou, o destino que mudou por telefone e ainda
 * não voltou ao portal.
 */
describe("a sugestão nunca sobrescreve o que alguém escreveu", () => {
  it("preenche o campo vazio", () => {
    const r = aplicarSugestao(
      "PROGRAMACAO",
      "rotas_sem_atribuicao",
      { lh: "LT0Q8P02EMVZ2" },
      { origem: "DUQUE", destino: "CONTAGEM" },
    );
    expect(r.dados.origem).toBe("DUQUE");
    expect(r.preenchidos.sort()).toEqual(["destino", "origem"]);
  });

  it("NÃO toca no campo já preenchido", () => {
    const r = aplicarSugestao(
      "PROGRAMACAO",
      "rotas_sem_atribuicao",
      { lh: "LT0Q8P02EMVZ2", origem: "DUQUE DE CAXIAS (relatado)" },
      { origem: "DUQUE", destino: "CONTAGEM" },
    );
    expect(r.dados.origem).toBe("DUQUE DE CAXIAS (relatado)");
    expect(r.preenchidos).toEqual(["destino"]);
  });

  /**
   * Espaço em branco é campo vazio, não conteúdo. Quem apagou o texto e deixou o cursor lá
   * esperaria que a sugestão entrasse — e um `" "` invisível travaria o preenchimento para sempre,
   * sem explicação nenhuma na tela.
   */
  it("trata só-espaços como vazio", () => {
    const r = aplicarSugestao(
      "PROGRAMACAO",
      "rotas_sem_atribuicao",
      { origem: "   " },
      { origem: "DUQUE" },
    );
    expect(r.dados.origem).toBe("DUQUE");
  });

  it("não devolve o objeto original — a tela compara referência para saber se mudou", () => {
    const dados = { lh: "X" };
    const r = aplicarSugestao("PROGRAMACAO", "rotas_sem_atribuicao", dados, { origem: "DUQUE" });
    expect(r.dados).not.toBe(dados);
    expect(dados.lh).toBe("X");
  });
});

/**
 * A seção só aceita o que ela declara — senão o `jsonb` guardaria campo que a tela não desenha, e a
 * conferência da rota recusaria a gravação inteira com "campo desconhecido". O item ficaria
 * impossível de salvar, e a causa (uma sugestão generosa demais) não apareceria em lugar nenhum.
 */
describe("a sugestão respeita os campos da seção", () => {
  it("descarta o que a seção não tem", () => {
    // `rotas_sem_atribuicao` não tem MOTORISTA nem PLACA.
    const r = aplicarSugestao(
      "PROGRAMACAO",
      "rotas_sem_atribuicao",
      {},
      { origem: "DUQUE", motorista: "FULANO", placa: "ABC1D23" },
    );
    expect(r.dados).toEqual({ origem: "DUQUE" });
    expect(r.preenchidos).toEqual(["origem"]);
  });

  it("aceita MOTORISTA onde a seção tem o campo", () => {
    const r = aplicarSugestao("PROGRAMACAO", "ponto_de_atencao", {}, { motorista: "FULANO" });
    expect(r.dados.motorista).toBe("FULANO");
  });

  /** `fonte` descreve a sugestão, não é conteúdo — e nenhuma seção a declara. */
  it("nunca grava `fonte` como campo", () => {
    const r = aplicarSugestao("PROGRAMACAO", "ponto_de_atencao", {}, { fonte: "viagem" });
    expect(r.dados).toEqual({});
    expect(r.preenchidos).toEqual([]);
  });

  it("seção inexistente não grava nada", () => {
    const r = aplicarSugestao("MONITORING", "pronta_resposta", {}, { origem: "X" });
    expect(r.preenchidos).toEqual([]);
  });

  /**
   * TODO campo que a sugestão sabe produzir precisa existir em ALGUMA seção — senão é código que
   * nunca preenche nada, e ninguém descobre porque a falta é silenciosa.
   */
  it("todo campo sugerível é declarado por pelo menos uma seção", () => {
    const declarados = new Set(
      SETORES.flatMap((s) => SECOES_DO_SETOR[s].flatMap((sec) => sec.campos.map((c) => c.chave))),
    );
    for (const chave of [
      "origem",
      "destino",
      "eta_origem",
      "motorista",
      "placa",
      "rota",
      "data_criacao",
      "telefone",
      "perfil",
    ]) {
      expect(declarados.has(chave), chave).toBe(true);
    }
  });
});

describe("quais seções têm gatilho de LH", () => {
  /**
   * Vinte seções, catorze com LH.
   *
   * O número já foi 16 num comentário meu, por contagem errada na primeira leitura da planilha — e
   * viajou para quatro arquivos antes de alguém tropeçar nele. Aqui ele é DERIVADO do catálogo e
   * conferido, que é o único lugar onde um número medido não envelhece sozinho.
   */
  it("são catorze de vinte", () => {
    const comLH = SETORES.flatMap((s) =>
      SECOES_DO_SETOR[s].filter((sec) => secaoTemLH(s, sec.chave)),
    );
    const total = SETORES.flatMap((s) => SECOES_DO_SETOR[s]);
    expect(total).toHaveLength(20);
    expect(comLH).toHaveLength(14);
  });

  /**
   * As seis sem LH giram em torno do MOTORISTA (no show, disponível, bloqueio, bonificação) ou da
   * ROTA (acompanhamento) — nenhuma delas parte de uma viagem, e é por isso que não têm gatilho.
   *
   * Se alguma ganhar campo de LH um dia, o número acima muda e este teste manda conferir — que é o
   * comportamento certo, porque a seção passaria a poder preencher sozinha.
   */
  it("as seis sem LH giram em torno do motorista ou da rota", () => {
    const semLH = SETORES.flatMap((s) =>
      SECOES_DO_SETOR[s]
        .filter((sec) => !secaoTemLH(s, sec.chave))
        .map((sec) => `${s}/${sec.chave}`),
    );
    expect(semLH.sort()).toEqual([
      "MONITORING/bloqueio_de_motorista",
      "MONITORING/bonificacao",
      "MONITORING/rotas_em_acompanhamento",
      "PROGRAMACAO/bloqueio_de_motorista",
      "PROGRAMACAO/motorista_disponivel",
      "PROGRAMACAO/no_show",
    ]);
  });
});

/**
 * A planilha só conhece CARRETA e TRUCK; o cadastro conhece onze tipos. A tradução é por
 * ARTICULAÇÃO — e o que NÃO traduz fica vazio, em vez de virar chute.
 */
describe("o perfil a partir do tipo de veículo", () => {
  it("o que puxa carreta é CARRETA, inclusive o cavalo sozinho", () => {
    for (const t of ["carreta", "carreta_ls", "bitrem", "rodotrem", "cavalo"]) {
      expect(perfilDoTipoDeVeiculo(t), t).toBe("CARRETA");
    }
  });

  it("o que carrega no próprio chassi é TRUCK", () => {
    for (const t of ["truck", "bitruck", "toco", "vuc", "van", "tres_quartos"]) {
      expect(perfilDoTipoDeVeiculo(t), t).toBe("TRUCK");
    }
  });

  /** Vazio faz alguém preencher; chute errado ninguém confere. */
  it("tipo desconhecido, nulo ou vazio devolve null", () => {
    expect(perfilDoTipoDeVeiculo("jamanta")).toBeNull();
    expect(perfilDoTipoDeVeiculo(null)).toBeNull();
    expect(perfilDoTipoDeVeiculo("")).toBeNull();
  });
});

describe("a rota escrita como a planilha escreve", () => {
  it("junta as duas pontas com X", () => {
    expect(rotaEscrita("SIMÕES FILHO", "JABOATÃO")).toBe("SIMÕES FILHO X JABOATÃO");
  });

  /** Uma ponta só produziria "SIMÕES FILHO X " — texto quebrado que alguém teria de limpar. */
  it("com uma ponta faltando não inventa metade de rota", () => {
    expect(rotaEscrita("SIMÕES FILHO", null)).toBeUndefined();
    expect(rotaEscrita(null, "JABOATÃO")).toBeUndefined();
    expect(rotaEscrita("  ", "JABOATÃO")).toBeUndefined();
  });
});
