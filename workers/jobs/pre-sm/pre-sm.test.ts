import { describe, expect, it } from "vitest";
import { chaveDaRota, decidir, type Contexto } from "./criar";

/** Uma viagem completa, com os valores reais medidos em 25/08. */
const DADOS = {
  codFilial: 9332,
  codPerfilSeguranca: 20785,
  codRota: 3487228,
  codIbgeOrigem: 2930709,
  codIbgeDestino: 1721000,
  cpfMotorista: "01932653546",
  vinculoMotorista: "agregado" as const,
  placas: [{ placa: "ATG9I07", vinculo: "agregado" as const }],
  chegadaNaColeta: "2026-08-26T12:00:00Z",
  saidaDaColeta: "2026-08-26T14:00:00Z",
  chegadaNaEntrega: "2026-08-27T04:00:00Z",
  saidaDaEntrega: "2026-08-27T06:00:00Z",
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
    // O corpo do `setPreSM` é aninhado: `{ PreSM: { Rota: { CodRota } } }`. Conferir aqui é o que
    // prova que o modo desligado grava o que TERIA sido mandado, e não uma casca vazia.
    const corpo = d.tipo === "desligado" ? (d.corpo as { PreSM: { Rota: { CodRota: number } } }) : null;
    expect(corpo?.PreSM.Rota.CodRota).toBe(3487228);
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
    const d = decidir({ ...DADOS, codRota: null }, { ...LIGADO, ativo: false });
    expect(d.tipo).toBe("nao_criar");
    expect(d.tipo === "nao_criar" && d.motivos).toContain("sem_rota");
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
  it("é UF mais cidade, igual ao casamento da carga", () => {
    const k = chaveDaRota("SOC_PE_JABOATÃO DOS GUARARAPES", "LM HUB_PE_RECIFE_OLINDA");
    expect(k.origemNorm).toBe("PE JABOATAO DOS GUARARAPES");
    expect(k.destinoNorm).toBe("PE RECIFE OLINDA");
  });
});
