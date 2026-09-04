import { describe, expect, it } from "vitest";
import {
  cabeNaAba,
  DIAS_ATE_SAIR_DA_ABA,
  estaLivre,
  situacaoDaViagem,
  viagemContaParaAAba,
  type SituacaoDoMotorista,
} from "./disponibilidade";

/**
 * A REGRA DA ABA DE MOTORISTAS DISPONÍVEIS (fatia 031, 03/09).
 *
 * Este arquivo existe por causa de UMA coisa que nenhum outro teste alcança: **a virada do dia em
 * São Paulo**. Provar isso contra o banco exigiria subir Postgres com dados dos dois lados da
 * meia-noite, em duas datas; aqui custa três linhas e falha na hora em que alguém trocar o fuso.
 */

/** 03/09/2026, 12h em São Paulo (15h UTC) — meio do dia, longe de qualquer borda. */
const AGORA = new Date("2026-09-03T15:00:00Z");

const cabe = (situacao: SituacaoDoMotorista, conclusaoIso: string, agora: Date = AGORA): boolean =>
  cabeNaAba({ situacao, conclusao: new Date(conclusaoIso), agora });

describe("situacaoDaViagem", () => {
  it("concluída é FINALIZADO — a palavra que a operação usa para 'está livre'", () => {
    expect(situacaoDaViagem("completed")).toBe("finalizado");
  });

  /**
   * CANCELADA NUNCA É FINALIZADO (I4).
   *
   * Ela nem chega aqui — é filtrada antes, por `viagemContaParaAAba`. Mas se chegasse, cair em
   * `finalizado` seria a tela afirmando que uma carga chegou quando ela foi cancelada, e é o tipo de
   * afirmação que só é descoberta quando alguém cobra o frete.
   */
  it("cancelada nunca é finalizado", () => {
    expect(situacaoDaViagem("cancelled")).not.toBe("finalizado");
  });

  it("todo o resto é 'a caminho'", () => {
    for (const s of [
      "received",
      "assigned",
      "confirmed",
      "at_origin",
      "loading",
      "loaded",
      "in_transit",
      "at_destination",
      "unloading",
      "unloaded",
    ]) {
      expect(situacaoDaViagem(s), `${s} deveria contar como a caminho`).toBe("a_caminho");
    }
  });

  it("status desconhecido conta como a caminho, e não como livre", () => {
    // Errar para o lado de "ocupado" é o lado seguro: chamar de livre quem está rodando faz alguém
    // prometer uma carga que não tem quem leve.
    expect(situacaoDaViagem("status_que_ainda_nao_existe")).toBe("a_caminho");
  });
});

describe("estaLivre", () => {
  it("só quem terminou está livre", () => {
    expect(estaLivre("finalizado")).toBe(true);
    expect(estaLivre("a_caminho")).toBe(false);
  });
});

/**
 * CANCELADA NÃO ENTRA NA ABA — decisão do usuário em 03/09 ("canceladas pode ignorar").
 *
 * Ela também deixa o motorista livre, e a primeira versão a tratava como um terceiro rótulo. Isso
 * fazia duas coisas erradas ao mesmo tempo: atropelava a viagem em andamento (dois motoristas
 * `in_transit` viravam "livres") e escondia a viagem que aconteceu de verdade — **nove** motoristas
 * passaram a aparecer corretamente como FINALIZADO depois que ela saiu.
 */
describe("viagemContaParaAAba", () => {
  it("cancelada não conta", () => {
    expect(viagemContaParaAAba("cancelled")).toBe(false);
  });

  it("todo o resto conta", () => {
    for (const s of ["completed", "in_transit", "assigned", "at_origin", "received"]) {
      expect(viagemContaParaAAba(s), `${s} deveria contar`).toBe(true);
    }
  });
});

describe("cabeNaAba — quem AINDA RODA entra pela janela", () => {
  it("chega hoje: entra", () => {
    expect(cabe("a_caminho", "2026-09-03T23:00:00Z")).toBe(true); // 20h em São Paulo
  });

  it("chega amanhã: entra", () => {
    expect(cabe("a_caminho", "2026-09-04T15:00:00Z")).toBe(true);
  });

  it("chega depois de amanhã: NÃO entra", () => {
    expect(cabe("a_caminho", "2026-09-05T15:00:00Z")).toBe(false);
  });

  /**
   * É ASSIM QUE O "SAI QUANDO ENTRA EM VIAGEM" ACONTECE — sozinho.
   *
   * Não existe gesto de remover. A viagem nova passa a ser a última do motorista, chega depois de
   * amanhã, e cai fora por esta condição. Um segundo caminho de remoção discordaria deste no dia em
   * que a viagem nova fosse cancelada.
   */
  it("chegou ontem e ainda está rodando: NÃO entra pela janela", () => {
    expect(cabe("a_caminho", "2026-09-02T15:00:00Z")).toBe(false);
  });
});

/**
 * ── O TESTE QUE ESTE ARQUIVO EXISTE PARA TER ──────────────────────────────────────────────────
 *
 * Uma conclusão às 23h30 de hoje **em São Paulo** é 02h30 de amanhã **em UTC**. Contar o dia em UTC
 * faria a lista trocar de conteúdo às 21h, no meio do turno da noite — e passaria despercebido em
 * qualquer teste escrito com horário comercial.
 *
 * Os dois casos abaixo estão em lados opostos da meia-noite de São Paulo e no MESMO dia UTC (e
 * vice-versa). Se alguém trocar `America/Sao_Paulo` por UTC, um dos dois cai.
 */
describe("cabeNaAba — a virada do dia, dos DOIS lados da meia-noite", () => {
  it("23h30 de hoje em São Paulo é HOJE, mesmo sendo amanhã em UTC", () => {
    // 2026-09-04T02:30:00Z === 03/09 23h30 em São Paulo.
    expect(cabe("a_caminho", "2026-09-04T02:30:00Z")).toBe(true);
  });

  it("00h30 de amanhã em São Paulo é AMANHÃ, e não depois de amanhã", () => {
    // 2026-09-04T03:30:00Z === 04/09 00h30 em São Paulo.
    expect(cabe("a_caminho", "2026-09-04T03:30:00Z")).toBe(true);
  });

  it("23h30 de AMANHÃ em São Paulo ainda entra — é 05/09 em UTC, e isso não importa", () => {
    // 2026-09-05T02:30:00Z === 04/09 23h30 em São Paulo. Em UTC seria "depois de amanhã".
    expect(cabe("a_caminho", "2026-09-05T02:30:00Z")).toBe(true);
  });

  it("00h30 de DEPOIS DE AMANHÃ em São Paulo não entra — é 05/09 em UTC, e isso não importa", () => {
    // 2026-09-05T03:30:00Z === 05/09 00h30 em São Paulo.
    expect(cabe("a_caminho", "2026-09-05T03:30:00Z")).toBe(false);
  });

  it("olhando de MADRUGADA a conta é a mesma", () => {
    // 03/09 01h em São Paulo. Uma viagem que chega às 23h do mesmo dia continua sendo "hoje".
    const madrugada = new Date("2026-09-03T04:00:00Z");
    expect(cabe("a_caminho", "2026-09-04T02:00:00Z", madrugada)).toBe(true);
  });
});

describe("cabeNaAba — quem JÁ TERMINOU fica até o corte", () => {
  /**
   * A EXCEÇÃO DECLARADA. As duas regras do pedido se contradiziam ao pé da letra, e a contradição
   * valia 20 motoristas: livres, chegados ontem. A decisão foi que a janela decide quem ENTRA e só
   * viagem nova faz SAIR. Este teste é o que impede alguém de "consertar" isso achando que é bug.
   */
  it("terminou ONTEM e não pegou nada: CONTINUA na aba", () => {
    expect(cabe("finalizado", "2026-09-02T15:00:00Z")).toBe(true);
  });

  it("o sétimo dia ainda aparece", () => {
    const seteDiasAtras = new Date(AGORA.getTime() - 7 * 24 * 60 * 60 * 1000 + 60_000);
    expect(cabe("finalizado", seteDiasAtras.toISOString())).toBe(true);
  });

  it("o oitavo dia não aparece mais", () => {
    const oitoDiasAtras = new Date(AGORA.getTime() - 8 * 24 * 60 * 60 * 1000);
    expect(cabe("finalizado", oitoDiasAtras.toISOString())).toBe(false);
  });

  it("terminou hoje: aparece", () => {
    expect(cabe("finalizado", "2026-09-03T06:00:00Z")).toBe(true);
  });

  /**
   * Sem o corte, 117 motoristas parados há mais de 7 dias e 72 há mais de 30 entrariam na lista, e
   * ela deixaria de responder "quem está livre agora" para responder "quem existe".
   */
  it("parado há 30 dias não aparece", () => {
    const trintaDias = new Date(AGORA.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(cabe("finalizado", trintaDias.toISOString())).toBe(false);
  });

  it("o corte é o valor exportado, e não um número solto no código", () => {
    expect(DIAS_ATE_SAIR_DA_ABA).toBe(7);
  });
});
