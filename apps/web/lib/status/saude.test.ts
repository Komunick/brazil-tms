import { describe, expect, it } from "vitest";
import {
  idadeEmTexto,
  REGUA_MINUTOS,
  REGUA_TAREFA_MINUTOS,
  saudeDaFonte,
  saudeDaTarefa,
} from "./saude";

/**
 * Esta régua nasceu de uma falha medida: em 2026-08-18 o robô do portal ficou SEIS HORAS sem
 * entregar nada — token do servidor abaixo do mínimo de 32 caracteres, 401 em todo ciclo — e nada na
 * tela denunciava. Navegador aberto, aba certa, site no ar, painel desenhando números.
 *
 * Os casos abaixo são os limites em que o aviso vira ruído (e a operação aprende a ignorar) ou deixa
 * de aparecer quando devia.
 */
const AGORA = new Date("2026-08-19T03:00:00Z");
const minutosAtras = (m: number): Date => new Date(AGORA.getTime() - m * 60_000);

describe("saudeDaFonte — portal", () => {
  it("o ritmo normal do robô NÃO acusa", () => {
    /**
     * A régua caiu de 60 para 20 minutos em 2026-08-21, e o teste veio junto.
     *
     * O princípio nunca mudou — QUATRO ciclos perdidos — mas os ciclos passaram de 15 para 5 minutos
     * e o 60 ficou para trás: era folga de quatro ciclos, virou folga de doze. Este caso afirmava a
     * folga velha, e mantê-lo obrigaria a régua a mentir para ele.
     */
    expect(saudeDaFonte("portal", minutosAtras(5), AGORA).saude).toBe("ok");
    expect(saudeDaFonte("portal", minutosAtras(15), AGORA).saude).toBe("ok");
    expect(saudeDaFonte("portal", minutosAtras(19), AGORA).saude).toBe("ok");
  });

  it("vinte minutos calado acusa — são quatro ciclos perdidos", () => {
    expect(saudeDaFonte("portal", minutosAtras(REGUA_MINUTOS.portal!), AGORA).saude).toBe(
      "atrasado",
    );
    // O caso real: seis horas.
    expect(saudeDaFonte("portal", minutosAtras(360), AGORA).saude).toBe("atrasado");
  });

  it("nunca alimentado acusa, em vez de passar por 'tudo certo'", () => {
    // Sem este caso a tela ficaria muda justamente na pior situação — a de nunca ter funcionado.
    expect(saudeDaFonte("portal", null, AGORA).saude).toBe("sem_dado");
    expect(saudeDaFonte("portal", undefined, AGORA).saude).toBe("sem_dado");
    expect(saudeDaFonte("portal", "não é data", AGORA).saude).toBe("sem_dado");
  });

  it("carimbo no FUTURO também é sintoma", () => {
    // Já aconteceu neste projeto: o robô somava -03:00 a uma hora que já era UTC e todo carimbo
    // nascia três horas à frente. Sem o valor absoluto, idade negativa nunca cruza o limite.
    expect(saudeDaFonte("portal", minutosAtras(-120), AGORA).saude).toBe("atrasado");
    // Um minuto de diferença de relógio entre a VM e o servidor não pode virar alarme.
    expect(saudeDaFonte("portal", minutosAtras(-1), AGORA).saude).toBe("ok");
  });

  it("aceita o carimbo como texto, que é como ele chega da API", () => {
    expect(saudeDaFonte("portal", "2026-08-18T17:50:47Z", AGORA).saude).toBe("atrasado");
    expect(saudeDaFonte("portal", "2026-08-19T02:50:00Z", AGORA).saude).toBe("ok");
  });
});

describe("saudeDaFonte — as outras duas réguas", () => {
  it("o BSC tolera um dia inteiro, porque o cliente publica uma vez por dia", () => {
    // 20 horas é o fim da tarde de um dia normal. Acusar aí ensinaria a operação a ignorar a tela.
    expect(saudeDaFonte("bsc", minutosAtras(20 * 60), AGORA).saude).toBe("ok");
    expect(saudeDaFonte("bsc", minutosAtras(31 * 60), AGORA).saude).toBe("atrasado");
  });

  it("oferta de spot é evento, não relógio: silêncio longo não é falha", () => {
    // Podem passar dias sem nenhuma oferta nas rotas acompanhadas, e isso não diz nada sobre o robô.
    expect(saudeDaFonte("spot", minutosAtras(5 * 24 * 60), AGORA).saude).toBe("sem_regua");
    // Mas nunca ter recebido nada continua sendo dito — aí a ausência é a informação.
    expect(saudeDaFonte("spot", null, AGORA).saude).toBe("sem_dado");
  });

  it("uma fonte desconhecida não inventa régua", () => {
    expect(saudeDaFonte("fonte-que-nao-existe", minutosAtras(9999), AGORA).saude).toBe("sem_regua");
  });
});

describe("saudeDaTarefa", () => {
  it("uma hora para qualquer tarefa, independente do cron dela", () => {
    // As cadências (5 min, 30 min) são sobrescrevíveis por variável de ambiente no worker, então uma
    // régua por tarefa mentiria no dia em que alguém mudasse o cron. Uma hora cobre as duas.
    expect(saudeDaTarefa(minutosAtras(31), AGORA).saude).toBe("ok");
    expect(saudeDaTarefa(minutosAtras(REGUA_TAREFA_MINUTOS), AGORA).saude).toBe("atrasado");
  });

  it("tarefa que nunca completou acusa", () => {
    expect(saudeDaTarefa(null, AGORA).saude).toBe("sem_dado");
  });
});

describe("idadeEmTexto", () => {
  it("conta em minutos até duas horas, depois em horas, depois em dias", () => {
    expect(idadeEmTexto(75)).toBe("75 min");
    expect(idadeEmTexto(119)).toBe("119 min");
    expect(idadeEmTexto(360)).toBe("6 h");
    // Ninguém lê "4320 min" e entende "três dias".
    expect(idadeEmTexto(4320)).toBe("3 dias");
  });

  it("idade negativa (carimbo no futuro) sai legível", () => {
    expect(idadeEmTexto(-90)).toBe("90 min");
  });

  it("sem carimbo devolve nulo, para a tela usar a outra frase", () => {
    // "há Infinity min" seria pior que não dizer nada.
    expect(idadeEmTexto(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
