import { describe, expect, it } from "vitest";
import { TRIP_STATUSES } from "./trip-status";
import {
  boardFilterForDisplayStatus,
  boardQueryForDisplayStatus,
  displayStatusOf,
  TRIP_DISPLAY_ORDER,
} from "./trip-display-status";

/**
 * O desdobramento de "Recebida" nas duas filas que a operação enxerga.
 *
 * A mesma regra existe DUAS VEZES no sistema: aqui, e em SQL (`displayStatusSql`), porque contar
 * agrupado no banco é a única forma de não trazer a tabela inteira para a memória. Estes casos são o
 * contrato entre as duas — se alguém mexer em uma e esquecer da outra, o cartão do painel e a lista
 * do quadro passam a mostrar números diferentes para a mesma pergunta, e nenhum dos dois parece
 * errado sozinho.
 */
describe("displayStatusOf", () => {
  it("separa as duas filas pelo eixo da ACEITAÇÃO, não pelo status da viagem", () => {
    /**
     * O pedido original dizia "aceitação Accepted E status de viagem Assigned". Os exemplos dados
     * junto provaram outra coisa: `LT0Q8J02DVJ91` — o exemplo de "P/Atribuir" — está em `Assigning`.
     * Pelo par descrito ela não entraria: a regra pegaria 8 viagens em vez das 326 que a operação
     * enxerga como fila de despacho.
     */
    expect({
      pendente: displayStatusOf("received", "Pending", "Assigning"),
      aceita: displayStatusOf("received", "Accepted", "Assigning"),
    }).toEqual({ pendente: "in_analysis", aceita: "to_assign" });
  });

  it("sem resposta do cliente, assume P/Atribuir — é o que se sustenta sem ele", () => {
    /**
     * "Em análise" é uma afirmação sobre o CLIENTE (ele ainda não decidiu), e essa não dá para fazer
     * sem ele ter falado. "P/Atribuir" é uma afirmação sobre NÓS: não há ninguém escalado aqui. Só a
     * segunda se sustenta sem informação do portal — viagem digitada à mão, ou vinda de antes de o
     * TMS ler esse eixo.
     */
    expect({
      nulo: displayStatusOf("received", null),
      indefinido: displayStatusOf("received", undefined),
      vazio: displayStatusOf("received", ""),
      desconhecido: displayStatusOf("received", "Accepted(Pending Award)"),
    }).toEqual({
      nulo: "to_assign",
      indefinido: "to_assign",
      vazio: "to_assign",
      desconhecido: "to_assign",
    });
  });

  it("NENHUM outro status é tocado, com ou sem aceitação na viagem", () => {
    // A aceitação continua gravada numa viagem que já saiu — e não pode virar rótulo depois que ela
    // deixou de ser proposta. Só `received` se desdobra; todo o resto passa idêntico. A exceção é
    // `at_origin`, que tem o caso dedicado abaixo.
    const outros = TRIP_STATUSES.filter((s) => s !== "received" && s !== "at_origin");
    for (const status of outros) {
      expect(displayStatusOf(status, "Pending")).toBe(status);
      expect(displayStatusOf(status, "Accepted")).toBe(status);
      expect(displayStatusOf(status, null)).toBe(status);
    }
  });
});

describe("displayStatusOf — chegar e ser escalada são coisas diferentes", () => {
  /**
   * INVERTIDO em 2026-08-31, a pedido. A decisão de 19/08 fundia os dois com o argumento de que "a
   * operação não distingue" — e o uso mostrou o contrário.
   *
   * Medido em produção no dia da reclamação: 8 viagens de verdade em `at_origin` e outras 13
   * exibidas como se estivessem, TODAS com a coleta ainda no futuro. A `LT0Q8V02F7RF1` tinha origem
   * às 20:30 e a tela já dizia que ela estava lá.
   *
   * O rótulo tinha deixado de descrever e passado a AFIRMAR algo falso na maioria dos casos, que é o
   * pior desfecho possível para um rótulo de status.
   */
  it("quem CHEGOU se descreve sozinho — não vira fila", () => {
    expect(displayStatusOf("at_origin", null)).toBe("at_origin");
    expect(displayStatusOf("at_origin", "Accepted", "Departed")).toBe("at_origin");
  });

  it("quem o PORTAL escalou fica na fila, e não afirma que chegou", () => {
    expect(displayStatusOf("received", "Accepted", "Assigned")).toBe("awaiting_arrival");
  });

  it("`at_origin` volta à lista — é o único rótulo que afirma que o caminhão chegou", () => {
    expect(TRIP_DISPLAY_ORDER).toContain("at_origin");
    expect(TRIP_DISPLAY_ORDER).toContain("awaiting_arrival");
  });

  it("o status REAL não é tocado — a fusão é só de exibição", () => {
    /**
     * `at_origin` continua existindo na máquina de estados, na linha do tempo e no botão de marco. É
     * ele que grava a hora de chegada, e é dessa hora que sai o cálculo de pontualidade na coleta —
     * fundir de verdade apagaria a diferença entre planejado e acontecido.
     */
    expect(TRIP_STATUSES).toContain("at_origin");
  });
});

describe("displayStatusOf — a terceira fila", () => {
  it("portal Assigned vence a aceitação: já tem motorista lá, não há o que atribuir", () => {
    /**
     * Toda viagem `Assigned` também está `Accepted`. Se a aceitação fosse testada primeiro, ela
     * cairia em "p/atribuir" e o quadro mandaria a operação escalar um motorista que o cliente já
     * escalou. A ordem dos testes é a do ciclo de vida, e é isso que este caso tranca.
     */
    expect(displayStatusOf("received", "Accepted", "Assigned")).toBe("awaiting_arrival");
  });

  it("as três filas são exaustivas e mutuamente exclusivas", () => {
    // Toda combinação que o portal produz cai em exatamente uma delas — é o que permite a soma das
    // três bater com o total de "Recebida" no quadro.
    const combinacoes: Array<[string | null, string | null]> = [
      ["Pending", "Assigning"],
      ["Accepted", "Assigning"],
      ["Accepted", "Assigned"],
      ["Pending", null],
      [null, "Assigning"],
      [null, null],
    ];
    const filas = new Set(["in_analysis", "to_assign", "awaiting_arrival"]);
    for (const [aceite, statusPortal] of combinacoes) {
      expect(filas.has(displayStatusOf("received", aceite, statusPortal))).toBe(true);
    }
  });
});

/**
 * O recorte que o cartão do painel e a ficha do quadro usam para abrir a lista.
 *
 * Estes casos existem porque a discordância entre o número e a lista NÃO APARECE como defeito: a
 * tela diz "NA ORIGEM 2" e abre "nenhuma viagem encontrada", e quem olha conclui que o filtro é que
 * está estranho. Foi o que aconteceu em 2026-08-19, com as duas viagens do dia em `at_origin`.
 */
describe("boardFilterForDisplayStatus", () => {
  it("não manda status junto com a fila NA ORIGEM — ela abrange dois status reais", () => {
    // `status=received` cruzaria com E e cortaria justamente as viagens em `at_origin`. Quem sabe
    // dos dois status é o `or` de `buildWhere`, e ele só é alcançado pelo parâmetro da fila.
    expect(boardFilterForDisplayStatus("awaiting_arrival")).toEqual({
      status: [],
      queue: "awaiting_arrival",
    });
    expect(boardQueryForDisplayStatus("awaiting_arrival")).toBe("queue=awaiting_arrival");
  });

  it("as outras duas filas continuam presas a `received`", () => {
    // Elas vivem inteiramente dentro de `received`; sem o status, o recorte `scope=all` abriria a
    // fila para viagens já despachadas que o portal ainda descreve como pendentes.
    expect(boardQueryForDisplayStatus("in_analysis")).toBe("status=received&queue=in_analysis");
    expect(boardQueryForDisplayStatus("to_assign")).toBe("status=received&queue=to_assign");
  });

  it("status comum vira o próprio status, sem fila", () => {
    expect(boardFilterForDisplayStatus("in_transit")).toEqual({ status: ["in_transit"] });
    expect(boardQueryForDisplayStatus("in_transit")).toBe("status=in_transit");
  });
});
