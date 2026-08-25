import { describe, expect, it } from "vitest";
import { chaveDaRota, decidir, type Contexto } from "./criar";

const DADOS = {
  codModelo: 23343,
  cpfMotorista: "01932653546",
  vinculoMotorista: "agregado" as const,
  placas: [{ placa: "ATG9I07", vinculo: "agregado" as const }],
  chegadaNaColeta: "2026-08-26T12:00:00Z",
  saidaDaColeta: "2026-08-26T14:00:00Z",
};

const LIGADO: Contexto = { ativo: true, tetoDiario: 5, criadasHoje: 0, temCredencial: true };

describe("decidir", () => {
  it("com tudo e ligado, cria", () => {
    expect(decidir(DADOS, LIGADO).tipo).toBe("criar");
  });

  /**
   * O QUE FAZ O MODO DESLIGADO SERVIR PARA ALGUMA COISA.
   *
   * Desligado, o corpo é montado do mesmo jeito e devolvido — é ele que vai para
   * `trip_pre_sm.payload_enviado`, e é assim que dá para conferir a feature inteira, por dias, sem
   * criar nada no sistema da gerenciadora (que cobra por solicitação).
   */
  it("desligado, monta o corpo e não cria", () => {
    const d = decidir(DADOS, { ...LIGADO, ativo: false });
    expect(d.tipo).toBe("desligado");
    expect(d.tipo === "desligado" && d.corpo.CodModelo).toBe(23343);
  });

  it("sem credencial é o mesmo que desligado — não é falha", () => {
    expect(decidir(DADOS, { ...LIGADO, temCredencial: false }).tipo).toBe("desligado");
  });

  /**
   * O teto começa em ZERO. Com ele, mesmo ligada a feature não cria nada até alguém subir o número —
   * o que torna a primeira criação um ato deliberado, e não um efeito de um deploy.
   */
  it("teto em zero não cria, mesmo ligado", () => {
    expect(decidir(DADOS, { ...LIGADO, tetoDiario: 0 }).tipo).toBe("teto_atingido");
  });

  it("teto atingido no meio do dia para de criar", () => {
    expect(decidir(DADOS, { ...LIGADO, tetoDiario: 3, criadasHoje: 3 }).tipo).toBe("teto_atingido");
  });

  /**
   * "Falta dado" vence "está desligado", e a ordem importa: é o que faz o modo desligado REVELAR
   * quais viagens ficariam de fora, em vez de esconder isso atrás do interruptor.
   */
  it("falta de dado é dita mesmo com a feature desligada", () => {
    const d = decidir({ ...DADOS, codModelo: null }, { ...LIGADO, ativo: false });
    expect(d.tipo).toBe("nao_criar");
    expect(d.tipo === "nao_criar" && d.motivo).toBe("sem_modelo");
  });

  it("desligado e teto são desfechos DIFERENTES — dizem coisas distintas a quem lê", () => {
    expect(decidir(DADOS, { ...LIGADO, ativo: false, tetoDiario: 0 }).tipo).toBe("desligado");
  });
});

describe("chaveDaRota", () => {
  /**
   * Precisa bater com a normalização da carga. Se divergirem, a carga grava com uma chave e a busca
   * procura por outra — nenhuma rota casa, e nenhum erro aparece.
   */
  it("normaliza igual ao casamento", () => {
    const k = chaveDaRota("SOC_PE_JABOATÃO DOS GUARARAPES", "LM HUB_PE_RECIFE_OLINDA");
    expect(k.origemNorm).toContain("JABOATAO");
    expect(k.destinoNorm.split(" ").sort()).toEqual(["OLINDA", "RECIFE"]);
  });
});
