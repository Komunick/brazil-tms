import { describe, expect, it } from "vitest";
import { fleetFeedBodySchema, fleetPositionSchema } from "./fleet-position";

/**
 * O contrato do que o rastreador entrega.
 *
 * O que estes casos protegem é a diferença entre "não veio" e "veio vazio". O eTorre manda campo
 * ausente, string vazia e `"-"` para dizer a mesma coisa, e cada um deles chegando como valor de
 * verdade produziria uma tela cheia de traços onde deveria haver silêncio.
 */
describe("fleetPositionSchema", () => {
  it("aceita o registro mínimo: só a placa", () => {
    // A placa é a única coisa sem a qual a linha não existe — é a chave. Um caminhão sem posição, sem
    // viagem e sem motorista continua sendo um caminhão que o rastreador vê.
    const r = fleetPositionSchema.parse({ plate: "OWR4I30" });
    expect(r.plate).toBe("OWR4I30");
  });

  it("aceita nulo e ausente nos campos opcionais, que é como o rastreador fala", () => {
    const r = fleetPositionSchema.parse({
      plate: "POA6I63",
      trailerPlate: null,
      etaAt: null,
      progressPercent: null,
    });
    expect(r.trailerPlate).toBeNull();
    expect(r.etaAt).toBeNull();
  });

  it("guarda os instantes como TEXTO, sem interpretar", () => {
    /**
     * `"2026-08-19 21:10:12"` não é ISO e não tem fuso. Converter aqui — no navegador de uma VM —
     * amarraria o dado ao relógio dela. A conversão para UTC mora no servidor; este contrato só
     * transporta.
     */
    const r = fleetPositionSchema.parse({ plate: "ABC1D23", positionAt: "2026-08-19 21:10:12" });
    expect(r.positionAt).toBe("2026-08-19 21:10:12");
  });

  it("os minutos parados podem vir número ou texto", () => {
    // Medido: o eTorre manda `"0"` como string. Exigir número recusaria o lote inteiro por causa do
    // caminhão que está andando.
    expect(
      fleetPositionSchema.parse({ plate: "AAA1A11", stoppedMinutes: "0" }).stoppedMinutes,
    ).toBe("0");
    expect(fleetPositionSchema.parse({ plate: "AAA1A11", stoppedMinutes: 42 }).stoppedMinutes).toBe(
      42,
    );
  });

  it("aceita o texto de movimento por extenso", () => {
    // `MOVIMENTANDO` tem 12 caracteres e o limite era 8, herdado do farol abreviado que veio antes.
    // O lote inteiro foi recusado pelo campo mais bobo do contrato — daí este caso existir.
    const r = fleetPositionSchema.parse({ plate: "AAA1A11", stoppedFlag: "MOVIMENTANDO" });
    expect(r.stoppedFlag).toBe("MOVIMENTANDO");
  });

  it("recusa placa vazia", () => {
    expect(() => fleetPositionSchema.parse({ plate: "  " })).toThrow();
  });

  it("recusa coordenada impossível", () => {
    // Latitude 500 não é um caminhão em lugar nenhum: é campo trocado do outro lado, e é melhor a
    // entrega falhar barulhenta do que o mapa desenhar um caminhão no vácuo.
    expect(() => fleetPositionSchema.parse({ plate: "AAA1A11", latitude: 500 })).toThrow();
  });
});

describe("fleetFeedBodySchema", () => {
  it("o lote é a frota inteira, não um veículo por chamada", () => {
    const corpo = fleetFeedBodySchema.parse({
      token: "x".repeat(48),
      positions: [{ plate: "AAA1A11" }, { plate: "BBB2B22" }],
    });
    expect(corpo.positions).toHaveLength(2);
  });

  it("recusa lote vazio", () => {
    // Zero posições não é "a frota parou": é o robô tendo lido uma tela que não era a certa. Aceitar
    // apagaria o último retrato bom e trocaria por nada.
    expect(() => fleetFeedBodySchema.parse({ positions: [] })).toThrow();
  });
});

describe("o -1 do rastreador", () => {
  it("passa pelo contrato em vez de derrubar o lote", () => {
    /**
     * Onze dos 84 veículos do primeiro lote real vieram com `progressPercent: -1`, todos sem viagem.
     * Com piso em zero, o retrato inteiro era recusado por causa de caminhão parado — que é o estado
     * mais comum da frota de madrugada.
     */
    const r = fleetPositionSchema.parse({ plate: "AAA1A11", progressPercent: -1, kmTravelled: -1 });
    expect(r.progressPercent).toBe(-1);
  });

  it("continua recusando o que é absurdo de verdade", () => {
    // -1 é sentinela conhecida; -50% não é nada que o rastreador diga, e passar batido esconderia
    // um campo trocado do outro lado.
    expect(() => fleetPositionSchema.parse({ plate: "AAA1A11", progressPercent: -50 })).toThrow();
  });
});
