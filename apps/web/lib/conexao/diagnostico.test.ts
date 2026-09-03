import { describe, expect, it } from "vitest";
import {
  LIMIAR_LENTO_MS,
  classificarConexao,
  precisaAvisar,
  type SinaisDaSonda,
} from "./diagnostico";

/**
 * O que estes casos protegem é UMA frase: a que a tela mostra para a operação. Errar a classificação
 * não deixa a tela feia — manda a pessoa consertar a coisa errada. Dizer "sua internet caiu" quando
 * o servidor é que está fora faz alguém reiniciar o roteador enquanto ninguém avisa o time.
 */
const sinais = (p: Partial<SinaisDaSonda> = {}): SinaisDaSonda => ({
  temLink: true,
  tmsRespondeu: null,
  tmsMs: null,
  internetRespondeu: null,
  ...p,
});

describe("classificarConexao", () => {
  it("TMS respondendo rápido é 'ok' — e 'ok' não mostra nada", () => {
    const estado = classificarConexao(sinais({ tmsRespondeu: true, tmsMs: 120 }));
    expect(estado).toBe("ok");
    expect(precisaAvisar(estado)).toBe(false);
  });

  it("TMS no ar porém lento é 'lenta', NÃO queda", () => {
    // A diferença importa: em queda a operação para; em lentidão ela continua, sabendo o porquê.
    expect(classificarConexao(sinais({ tmsRespondeu: true, tmsMs: LIMIAR_LENTO_MS + 1 }))).toBe(
      "lenta",
    );
  });

  it("exatamente no limiar ainda é 'ok' — a régua não pega o próprio número", () => {
    expect(classificarConexao(sinais({ tmsRespondeu: true, tmsMs: LIMIAR_LENTO_MS }))).toBe("ok");
  });

  it("TMS fora e internet boa acusa O SERVIDOR", () => {
    const estado = classificarConexao(sinais({ tmsRespondeu: false, internetRespondeu: true }));
    expect(estado).toBe("servidor_fora");
    expect(precisaAvisar(estado)).toBe(true);
  });

  it("TMS fora e terceiro fora acusa A REDE LOCAL", () => {
    expect(classificarConexao(sinais({ tmsRespondeu: false, internetRespondeu: false }))).toBe(
      "sem_internet",
    );
  });

  it("sem link é rede local, sem precisar de sonda nenhuma", () => {
    // `navigator.onLine === false` já é prova suficiente, e nenhuma sonda responderia mesmo.
    expect(classificarConexao(sinais({ temLink: false }))).toBe("sem_internet");
    expect(classificarConexao(sinais({ temLink: false, tmsRespondeu: false }))).toBe(
      "sem_internet",
    );
  });

  it("TMS fora e terceiro NÃO medido fica 'indefinido' — não chuta culpado", () => {
    // O caso que este arquivo existe para trancar. Sem o terceiro não há como saber de quem é a
    // falha, e inventar uma resposta é pior que admitir que ainda não se sabe.
    const estado = classificarConexao(sinais({ tmsRespondeu: false, internetRespondeu: null }));
    expect(estado).toBe("indefinido");
    expect(precisaAvisar(estado)).toBe(false);
  });

  it("nada medido ainda também é 'indefinido'", () => {
    expect(classificarConexao(sinais())).toBe("indefinido");
  });

  it("o TMS respondendo encerra a conta — o terceiro nem pesa", () => {
    // Se o TMS respondeu, saber da internet não muda nada: ele está no ar. Testado nos dois lados
    // para que ninguém acrescente depois uma condição que faça o terceiro derrubar um TMS vivo.
    expect(
      classificarConexao(sinais({ tmsRespondeu: true, tmsMs: 90, internetRespondeu: false })),
    ).toBe("ok");
    expect(
      classificarConexao(sinais({ tmsRespondeu: true, tmsMs: 90, internetRespondeu: true })),
    ).toBe("ok");
  });
});
