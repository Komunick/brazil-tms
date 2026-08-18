import { describe, expect, it } from "vitest";
import { TRIP_STATUSES } from "./trip-status";
import { displayStatusOf } from "./trip-display-status";

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
    // deixou de ser proposta. Só `received` se desdobra; todo o resto passa idêntico.
    const outros = TRIP_STATUSES.filter((s) => s !== "received");
    for (const status of outros) {
      expect(displayStatusOf(status, "Pending")).toBe(status);
      expect(displayStatusOf(status, "Accepted")).toBe(status);
      expect(displayStatusOf(status, null)).toBe(status);
    }
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
