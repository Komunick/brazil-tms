import { describe, expect, it } from "vitest";
import { montarLinhaDoTempo } from "./timeline";

/**
 * A LINHA DO TEMPO EMBARALHADA (2026-08-21, relatado pelo usuário).
 *
 * Os casos abaixo saem de uma viagem real de produção, com os horários que ela tinha. Os três
 * problemas apareceram juntos: cada marco duplicado com a mudança de status que ele provocou, o
 * empate entre os dois resolvido pelo banco (trocando de lugar entre atualizações), e as etapas sem
 * hora real caindo pelo relógio de gravação.
 */
const evento = (over: Partial<Record<string, unknown>>) =>
  ({
    id: String(Math.random()),
    eventType: "status_change",
    statusBefore: null,
    statusAfter: null,
    eventTimestamp: null,
    source: "import",
    actorUserId: null,
    locationId: null,
    notes: null,
    exceptionId: null,
    createdAt: "2026-08-20T10:06:05.000Z",
    ...over,
  }) as never;

describe("montarLinhaDoTempo", () => {
  /**
   * O par que dobrava a lista: `unloaded` e `status_change → unloaded`, mesmo instante. Eles não se
   * repetem, se completam — o marco tem o nome, a mudança tem a transição.
   */
  it("junta o marco e a mudança de status do mesmo instante numa linha só", () => {
    const linhas = montarLinhaDoTempo([
      evento({
        eventType: "unloaded",
        statusAfter: "unloaded",
        eventTimestamp: "2026-08-20T10:01:46.000Z",
      }),
      evento({
        eventType: "status_change",
        statusBefore: "unloading",
        statusAfter: "unloaded",
        eventTimestamp: "2026-08-20T10:01:46.000Z",
      }),
    ]);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.eventType).toBe("unloaded");
    expect(linhas[0]!.statusBefore).toBe("unloading");
    expect(linhas[0]!.statusAfter).toBe("unloaded");
  });

  /**
   * O portal carimba carregamento e partida no MESMO segundo quando o caminhão sai logo depois de
   * carregar. São dois fatos diferentes e precisam continuar sendo duas linhas — juntar por instante
   * apagaria um deles.
   */
  it("NÃO junta fatos diferentes que caíram no mesmo instante", () => {
    const mesmoInstante = "2026-08-20T06:39:00.000Z";
    const linhas = montarLinhaDoTempo([
      evento({ eventType: "loaded", statusAfter: "loaded", eventTimestamp: mesmoInstante }),
      evento({ eventType: "departed", statusAfter: "in_transit", eventTimestamp: mesmoInstante }),
    ]);
    expect(linhas).toHaveLength(2);
    // E a mais avançada do ciclo de vida vem primeiro, porque a lista é do recente para o antigo.
    expect(linhas[0]!.statusAfter).toBe("in_transit");
    expect(linhas[1]!.statusAfter).toBe("loaded");
  });

  /**
   * O desempate não pode vir do banco. Com a mesma entrada em ordem invertida, a saída tem de ser a
   * mesma — senão blocos inteiros trocam de lugar entre uma atualização e outra da tela.
   */
  it("a ordem não depende de como os eventos chegaram", () => {
    const t = "2026-08-20T06:39:00.000Z";
    const a = evento({ eventType: "loaded", statusAfter: "loaded", eventTimestamp: t });
    const b = evento({ eventType: "departed", statusAfter: "in_transit", eventTimestamp: t });
    const ida = montarLinhaDoTempo([a, b]).map((l) => l.statusAfter);
    const volta = montarLinhaDoTempo([b, a]).map((l) => l.statusAfter);
    expect(ida).toEqual(volta);
  });

  it("ordena do mais recente para o mais antigo", () => {
    const linhas = montarLinhaDoTempo([
      evento({
        eventType: "origin_arrived",
        statusAfter: "at_origin",
        eventTimestamp: "2026-08-20T03:43:37.000Z",
      }),
      evento({
        eventType: "departed",
        statusAfter: "in_transit",
        eventTimestamp: "2026-08-20T06:39:04.000Z",
      }),
    ]);
    expect(linhas.map((l) => l.statusAfter)).toEqual(["in_transit", "at_origin"]);
  });

  /**
   * `confirmed` não vem do portal e não tem hora real. Ela cai pela hora de gravação, e isso FICA
   * assim: é a única hora que existe para ela, e posicioná-la pelo ciclo de vida seria afirmar um
   * horário que ninguém registrou.
   */
  it("etapa sem hora real usa a hora de gravação, e continua na lista", () => {
    const linhas = montarLinhaDoTempo([
      evento({
        eventType: "status_change",
        statusBefore: "assigned",
        statusAfter: "confirmed",
        eventTimestamp: null,
        createdAt: "2026-08-20T03:48:17.000Z",
      }),
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.instante).toBe("2026-08-20T03:48:17.000Z");
    expect(linhas[0]!.eventTimestamp).toBeNull();
  });

  it("preserva a nota, venha ela do marco ou da mudança", () => {
    const t = "2026-08-20T10:01:46.000Z";
    const linhas = montarLinhaDoTempo([
      evento({ eventType: "unloaded", statusAfter: "unloaded", eventTimestamp: t }),
      evento({ statusAfter: "unloaded", eventTimestamp: t, notes: "conferido pelo portal" }),
    ]);
    expect(linhas[0]!.notes).toBe("conferido pelo portal");
  });
});
