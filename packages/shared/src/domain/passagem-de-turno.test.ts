import { describe, expect, it } from "vitest";
import {
  SECOES_DO_SETOR,
  SETORES,
  TURNOS,
  contadoresDo,
  podeEditarOSetor,
  problemasDoItem,
  setorValido,
  turnoValido,
  turnoDe,
} from "./passagem-de-turno";

/**
 * O TURNO DE UM INSTANTE — o cálculo que erra em silêncio (2026-08-26).
 *
 * Duas coisas conspiram aqui: o T2 atravessa a meia-noite, e o servidor pensa em UTC. Qualquer uma
 * das duas sozinha é fácil; juntas produzem um defeito que só aparece de madrugada, na produção, e
 * que ninguém liga ao código — o operador do noturno escreve num bloco e de manhã ele não está lá.
 *
 * São Paulo está em UTC-3 o ano todo desde 2019 (não há mais horário de verão), então os instantes
 * abaixo são diretos: 22h UTC = 19h em São Paulo.
 */
describe("a que bloco (data, turno) um instante pertence", () => {
  it("meio-dia é o diurno do próprio dia", () => {
    // 15:00 UTC = 12:00 em São Paulo
    expect(turnoDe(new Date("2026-08-26T15:00:00Z"))).toEqual({ data: "2026-08-26", turno: "T1" });
  });

  it("às 7h em ponto o diurno começa", () => {
    expect(turnoDe(new Date("2026-08-26T10:00:00Z"))).toEqual({ data: "2026-08-26", turno: "T1" });
  });

  it("às 6h59 ainda é o noturno de ONTEM", () => {
    // 09:59 UTC = 06:59 em São Paulo — um minuto antes da virada.
    expect(turnoDe(new Date("2026-08-26T09:59:00Z"))).toEqual({ data: "2026-08-25", turno: "T2" });
  });

  it("às 19h em ponto o noturno começa, no mesmo dia", () => {
    // 22:00 UTC = 19:00 em São Paulo
    expect(turnoDe(new Date("2026-08-26T22:00:00Z"))).toEqual({ data: "2026-08-26", turno: "T2" });
  });

  it("às 18h59 ainda é o diurno", () => {
    expect(turnoDe(new Date("2026-08-26T21:59:00Z"))).toEqual({ data: "2026-08-26", turno: "T1" });
  });

  /**
   * ESTE É O TESTE QUE IMPORTA.
   *
   * 02h da manhã de quinta, em São Paulo, é 05h UTC de quinta. Um cálculo em UTC diria
   * "quinta, T2" — e o operador de plantão, que entrou às 19h de QUARTA, escreveria num bloco
   * novo, deixando metade do seu próprio turno no bloco anterior.
   *
   * A resposta certa é quarta: a data do T2 é a do dia em que ele COMEÇOU, como na planilha, onde
   * a aba de quarta carrega o noturno inteiro.
   */
  it("a madrugada pertence ao noturno que começou no dia anterior", () => {
    expect(turnoDe(new Date("2026-08-27T05:00:00Z"))).toEqual({ data: "2026-08-26", turno: "T2" });
  });

  /**
   * A virada do MÊS pela madrugada — onde a aritmética de string quebraria.
   *
   * 02h de 1º de setembro em São Paulo é 05h UTC de 1º de setembro. Recuar um dia tem de dar
   * 31 de AGOSTO, não "2026-09-00".
   */
  it("recua o mês corretamente na madrugada do dia 1º", () => {
    expect(turnoDe(new Date("2026-09-01T05:00:00Z"))).toEqual({ data: "2026-08-31", turno: "T2" });
  });

  /** E a virada do ANO, pelo mesmo motivo. */
  it("recua o ano corretamente na madrugada de 1º de janeiro", () => {
    expect(turnoDe(new Date("2027-01-01T05:00:00Z"))).toEqual({ data: "2026-12-31", turno: "T2" });
  });

  /**
   * A DATA TAMBÉM PODE ADIANTAR, e é o engano espelhado do anterior.
   *
   * 22h de 31 de agosto em São Paulo é 01h UTC de 1º de SETEMBRO. Quem tomar a data do UTC grava o
   * noturno de 31/08 dentro de 01/09 — o mesmo defeito, virado do avesso.
   */
  it("às 22h do último dia do mês continua no bloco daquele dia", () => {
    expect(turnoDe(new Date("2026-09-01T01:00:00Z"))).toEqual({ data: "2026-08-31", turno: "T2" });
  });
});

describe("o catálogo dos setores", () => {
  it("todo setor tem pelo menos uma seção e um resumo em cada turno", () => {
    for (const setor of SETORES) {
      expect(SECOES_DO_SETOR[setor].length).toBeGreaterThan(0);
      for (const turno of TURNOS) {
        expect(contadoresDo(setor, turno).length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Chave repetida dentro de uma seção seria sobrescrita silenciosa no `jsonb`: dois campos
   * gravando no mesmo lugar, o segundo apagando o primeiro, sem erro nenhum.
   */
  it("as chaves de campo não se repetem dentro de uma seção", () => {
    for (const setor of SETORES) {
      for (const secao of SECOES_DO_SETOR[setor]) {
        const chaves = secao.campos.map((c) => c.chave);
        expect(new Set(chaves).size, `${setor}/${secao.chave}`).toBe(chaves.length);
      }
    }
  });

  /** Duas seções com a mesma chave no mesmo setor misturariam os itens das duas na leitura. */
  it("as chaves de seção não se repetem dentro de um setor", () => {
    for (const setor of SETORES) {
      const chaves = SECOES_DO_SETOR[setor].map((s) => s.chave);
      expect(new Set(chaves).size, setor).toBe(chaves.length);
    }
  });

  it("as chaves de contador não se repetem dentro de um bloco", () => {
    for (const setor of SETORES) {
      for (const turno of TURNOS) {
        const chaves = contadoresDo(setor, turno).map((c) => c.chave);
        expect(new Set(chaves).size, `${setor}/${turno}`).toBe(chaves.length);
      }
    }
  });

  /** Campo de lista sem opções vira caixa de texto na tela, sem que nada acuse. */
  it("todo campo de lista tem opções, e nenhum outro tipo tem", () => {
    for (const setor of SETORES) {
      for (const secao of SECOES_DO_SETOR[setor]) {
        for (const campo of secao.campos) {
          const onde = `${setor}/${secao.chave}/${campo.chave}`;
          if (campo.tipo === "lista") {
            expect(campo.opcoes?.length, onde).toBeGreaterThan(0);
          } else {
            expect(campo.opcoes, onde).toBeUndefined();
          }
        }
      }
    }
  });

  /**
   * O GR é o ÚNICO setor cujo resumo difere entre turnos, e a diferença é pergunta em aberto com o
   * setor (26/08). Se alguém "arrumar" isso achando que é engano, este teste avisa — e a resposta
   * certa é ir perguntar, não editar o teste.
   */
  it("só o GR tem resumo diferente entre os dois turnos", () => {
    for (const setor of SETORES) {
      const t1 = contadoresDo(setor, "T1").map((c) => c.chave + "|" + c.rotulo);
      const t2 = contadoresDo(setor, "T2").map((c) => c.chave + "|" + c.rotulo);
      if (setor === "GR") expect(t1).not.toEqual(t2);
      else expect(t1).toEqual(t2);
    }
  });
});

/**
 * AS DUAS MUDANÇAS DE 27/08, pedidas pelo Monitoring — e elas puxam em direções OPOSTAS.
 *
 * A ocorrência da viagem crítica SOLTOU: o conteúdo real é prosa de noventa caracteres, e as quatro
 * opções da planilha obrigavam a escolher um rótulo aproximado jogando fora o que aconteceu.
 *
 * O status da bonificação TRAVOU, mesmo a planilha não travando: é estado de um processo de duas
 * pontas, e estado em texto livre vira "recebido"/"Recebido"/"RECEBIDO" sem contagem possível.
 *
 * A regra que as duas seguem: relato pede liberdade, estado e motivo pedem lista. Este teste existe
 * para que ninguém "uniformize" as duas depois.
 */
describe("relato é livre, estado é lista", () => {
  const campo = (setor: Parameters<typeof problemasDoItem>[0], secao: string, chave: string) =>
    SECOES_DO_SETOR[setor].find((s) => s.chave === secao)?.campos.find((c) => c.chave === chave);

  it("a ocorrência da viagem crítica do Monitoring aceita qualquer texto", () => {
    expect(campo("MONITORING", "viagens_criticas", "ocorrencia")?.tipo).toBe("texto_longo");
    expect(
      problemasDoItem("MONITORING", "viagens_criticas", {
        lh: "LT0Q8O02ETU61",
        ocorrencia: "Drive rodou boa parte da viagem em velocidade reduzida devido à chuva na BR",
      }),
    ).toEqual([]);
  });

  /** As listas do GR FICAM: lá o campo classifica um motivo, e classificação livre não agrupa. */
  it("as ocorrências do GR continuam travadas na lista", () => {
    expect(campo("GR", "pendencia_de_rastreamento", "ocorrencia")?.tipo).toBe("lista");
    expect(campo("GR", "pronta_resposta", "ocorrencia")?.tipo).toBe("lista");
    const p = problemasDoItem("GR", "pendencia_de_rastreamento", {
      lh: "X",
      ocorrencia: "inventado",
    });
    expect(p.join(" ")).toContain("não está na lista");
  });

  it("a bonificação existe no Monitoring, com status de lista", () => {
    const secao = SECOES_DO_SETOR.MONITORING.find((s) => s.chave === "bonificacao");
    expect(secao?.titulo).toBe("Bonificação rota Simões x Jaboatão");
    expect(campo("MONITORING", "bonificacao", "status")?.opcoes).toEqual([
      "Recebido",
      "Aguardando chave",
    ]);
  });

  it("a bonificação aceita os dois estados e recusa um terceiro", () => {
    for (const status of ["Recebido", "Aguardando chave"]) {
      expect(
        problemasDoItem("MONITORING", "bonificacao", { motorista: "Joao vitor fidelis", status }),
        status,
      ).toEqual([]);
    }
    expect(
      problemasDoItem("MONITORING", "bonificacao", { motorista: "X", status: "recebido" }).join(
        " ",
      ),
    ).toContain("não está na lista");
  });

  /**
   * Ela está nos DOIS turnos, embora a planilha só a tenha no lado do T2 — foi assim que ela
   * escapou da primeira leitura. Uma seção que só o noturno enxerga obrigaria o diurno a pedir
   * registro ao noturno, que é o tipo de dependência que a passagem de turno existe para eliminar.
   */
  it("a bonificação vale para os dois turnos, e não só para o noturno", () => {
    for (const turno of TURNOS) {
      expect(contadoresDo("MONITORING", turno).length, turno).toBeGreaterThan(0);
    }
    expect(SECOES_DO_SETOR.MONITORING.map((s) => s.chave)).toContain("bonificacao");
  });
});

describe("a conferência do conteúdo de um item", () => {
  it("aceita um item bem preenchido", () => {
    expect(
      problemasDoItem("PROGRAMACAO", "rotas_sem_atribuicao", {
        lh: "LT0Q8P02EMVZ2",
        origem: "DUQUE",
        destino: "CONTAGEM",
        ocorrencia: "Sem Atribuição",
      }),
    ).toEqual([]);
  });

  it("recusa valor fora da lista suspensa", () => {
    const p = problemasDoItem("PROGRAMACAO", "rotas_sem_atribuicao", {
      lh: "LT0Q8P02EMVZ2",
      ocorrencia: "Sem atribuicao",
    });
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("não está na lista");
  });

  it("recusa campo que a seção não declara", () => {
    const p = problemasDoItem("PROGRAMACAO", "rotas_sem_atribuicao", {
      lh: "LT0Q8P02EMVZ2",
      placa: "ABC1D23",
    });
    expect(p).toEqual(["Campo desconhecido: placa"]);
  });

  it("recusa item vazio", () => {
    expect(problemasDoItem("GR", "viagens_criticas", { lh: "  " })).toContain("O item está vazio");
  });

  it("recusa seção que não existe naquele setor", () => {
    // `pronta_resposta` existe no GR, não no Monitoring.
    expect(problemasDoItem("MONITORING", "pronta_resposta", { lh: "X" })).toHaveLength(1);
  });

  /** Devolve TODOS os problemas — quem preencheu um cartão longo merece saber tudo de uma vez. */
  it("devolve todos os problemas, não o primeiro", () => {
    const p = problemasDoItem("GR", "pendencia_de_rastreamento", {
      lh: "LT0Q8P02EMVZ2",
      ocorrencia: "Inventada",
      inexistente: "x",
    });
    expect(p.length).toBeGreaterThanOrEqual(2);
  });
});

describe("quem pode editar a faixa de um setor", () => {
  it("a pessoa do setor edita o seu", () => {
    expect(podeEditarOSetor({ ehAdmin: false, setorDoUsuario: "GR", setorAlvo: "GR" })).toBe(true);
  });

  it("a pessoa de um setor NÃO edita o de outro", () => {
    expect(
      podeEditarOSetor({ ehAdmin: false, setorDoUsuario: "GR", setorAlvo: "MONITORING" }),
    ).toBe(false);
  });

  /** O caso da maioria das contas — e o padrão precisa ser o seguro. */
  it("quem não tem setor não edita nada", () => {
    for (const setor of SETORES) {
      expect(
        podeEditarOSetor({ ehAdmin: false, setorDoUsuario: null, setorAlvo: setor }),
        setor,
      ).toBe(false);
    }
  });

  it("admin edita qualquer faixa, inclusive sem ter setor", () => {
    for (const setor of SETORES) {
      expect(
        podeEditarOSetor({ ehAdmin: true, setorDoUsuario: null, setorAlvo: setor }),
        setor,
      ).toBe(true);
    }
  });
});

describe("a conferência de setor e turno vindos de fora", () => {
  it("aceita os valores do catálogo e recusa o resto", () => {
    expect(setorValido("GR")).toBe("GR");
    expect(setorValido("gr")).toBeNull();
    expect(setorValido("RH")).toBeNull();
    expect(setorValido(undefined)).toBeNull();
    expect(turnoValido("T2")).toBe("T2");
    expect(turnoValido("T3")).toBeNull();
  });

  /**
   * `constructor` e `toString` existem em todo objeto de JavaScript. Uma conferência escrita com
   * `valor in MAPA` aceitaria os dois e deixaria um setor inventado entrar até o `CHECK` do banco.
   */
  it("recusa os nomes herdados de Object", () => {
    expect(setorValido("constructor")).toBeNull();
    expect(setorValido("toString")).toBeNull();
  });
});
