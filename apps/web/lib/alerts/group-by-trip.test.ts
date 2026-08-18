import { describe, expect, it } from "vitest";
import { groupAlertsByTrip, paginate, type AlertLike } from "./group-by-trip";

/**
 * O caso real que motivou isto: uma viagem que não saiu dispara três alertas — não foi atribuída,
 * não chegou na origem, não chegou no destino. Contados como três, 123 viagens viravam 307
 * pendências na tela.
 */
const alerta = (over: Partial<AlertLike> & { id: string; tripId: string }): AlertLike => ({
  externalTripId: `LH-${over.tripId}`,
  customerName: "Shopee",
  createdAt: "2026-08-16T12:00:00.000Z",
  state: "active",
  ...over,
});

describe("groupAlertsByTrip", () => {
  it("junta os três alertas da mesma viagem numa linha só", () => {
    const groups = groupAlertsByTrip([
      alerta({ id: "a1", tripId: "t1" }),
      alerta({ id: "a2", tripId: "t1" }),
      alerta({ id: "a3", tripId: "t1" }),
      alerta({ id: "b1", tripId: "t2" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.items.length)).toEqual([3, 1]);
    expect(groups[0]!.tripId).toBe("t1");
  });

  it("firstAt é o alerta MAIS ANTIGO da viagem, não o primeiro da lista", () => {
    const groups = groupAlertsByTrip([
      alerta({ id: "a1", tripId: "t1", createdAt: "2026-08-16T18:00:00.000Z" }),
      alerta({ id: "a2", tripId: "t1", createdAt: "2026-08-16T09:00:00.000Z" }),
    ]);
    expect(groups[0]!.firstAt).toBe("2026-08-16T09:00:00.000Z");
  });

  it("separa ativos de reconhecidos dentro da viagem", () => {
    const groups = groupAlertsByTrip([
      alerta({ id: "a1", tripId: "t1" }),
      alerta({ id: "a2", tripId: "t1", state: "acknowledged" }),
    ]);
    expect({
      ativos: groups[0]!.activeItems.map((a) => a.id),
      reconhecidos: groups[0]!.acknowledgedItems.map((a) => a.id),
    }).toEqual({ ativos: ["a1"], reconhecidos: ["a2"] });
  });

  it("viagem inteiramente reconhecida desce; a que ainda tem algo aberto fica em cima", () => {
    const groups = groupAlertsByTrip([
      // Esta vem primeiro na resposta, mas já foi tratada por inteiro.
      alerta({ id: "a1", tripId: "tratada", state: "acknowledged" }),
      alerta({ id: "a2", tripId: "tratada", state: "acknowledged" }),
      // Esta tem um motivo ainda aberto, mesmo com outro já silenciado.
      alerta({ id: "b1", tripId: "aberta", state: "acknowledged" }),
      alerta({ id: "b2", tripId: "aberta" }),
    ]);
    expect(groups.map((g) => g.tripId)).toEqual(["aberta", "tratada"]);
  });

  it("uma linha sem identificação é preenchida por qualquer alerta irmão que a tenha", () => {
    const groups = groupAlertsByTrip([
      alerta({ id: "a1", tripId: "t1", externalTripId: null, customerName: null }),
      alerta({ id: "a2", tripId: "t1", externalTripId: "LH-999", customerName: "Shopee" }),
    ]);
    expect({ lh: groups[0]!.externalTripId, cliente: groups[0]!.customerName }).toEqual({
      lh: "LH-999",
      cliente: "Shopee",
    });
  });

  it("lista vazia devolve lista vazia", () => {
    expect(groupAlertsByTrip([])).toEqual([]);
  });
});

describe("paginate", () => {
  const itens = Array.from({ length: 20 }, (_, i) => i);

  it("corta a fatia certa e conta as páginas", () => {
    const r = paginate(itens, 2, 8);
    expect({ primeiro: r.visiveis[0], tamanho: r.visiveis.length, total: r.totalPaginas }).toEqual({
      primeiro: 8,
      tamanho: 8,
      total: 3,
    });
  });

  it("prende a página quando a lista encolhe embaixo do pé de quem lê", () => {
    // Os avisos se resolvem sozinhos e o quadro repolla a cada 30s: quem estava na página 5 acorda
    // num mundo de 1. Uma fatia fora do fim devolveria vazio — na tela, indistinguível de "não há
    // avisos".
    const r = paginate([1, 2, 3], 5, 8);
    expect({ pagina: r.paginaAtual, visiveis: r.visiveis }).toEqual({ pagina: 1, visiveis: [1, 2, 3] });
  });

  it("lista vazia continua sendo uma página, não zero", () => {
    const r = paginate([], 1, 8);
    expect({ total: r.totalPaginas, pagina: r.paginaAtual, visiveis: r.visiveis }).toEqual({
      total: 1,
      pagina: 1,
      visiveis: [],
    });
  });

  it("a última página leva o resto, mesmo incompleta", () => {
    const r = paginate(itens, 3, 8);
    expect(r.visiveis).toEqual([16, 17, 18, 19]);
  });
});
