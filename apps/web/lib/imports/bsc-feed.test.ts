import { describe, expect, it } from "vitest";
import { ingestBscSnapshot, parseBscNumber } from "./bsc-feed";

/**
 * A leitura do BSC é RASPADA DE TELA, e é aí que mora todo o risco: um JSON de API vem tipado, um
 * texto de tela vem como a Shopee escolheu formatar naquele dia. Estes casos são os que separam um
 * número de um mal-entendido.
 */
describe("parseBscNumber", () => {
  it("lê o formato brasileiro que o relatório usa", () => {
    expect({
      percentual: parseBscNumber("46,03%"),
      semPercento: parseBscNumber("72,8"),
      milhar: parseBscNumber("1.877,50"),
      inteiro: parseBscNumber("100"),
      comEspaco: parseBscNumber(" 99,75 % "),
    }).toEqual({
      percentual: 46.03,
      semPercento: 72.8,
      milhar: 1877.5,
      inteiro: 100,
      comEspaco: 99.75,
    });
  });

  it("indicador EM BRANCO vira ausência, nunca zero", () => {
    /**
     * O BSC mostra "-" no indicador que ainda não tem medição no período. Ler isso como 0 seria dizer
     * que o desempenho foi péssimo, quando o que houve foi que não houve medição — e o zero puxaria
     * qualquer média que alguém fizesse depois.
     */
    expect({
      traco: parseBscNumber("-"),
      travessao: parseBscNumber("—"),
      vazio: parseBscNumber(""),
      espacos: parseBscNumber("   "),
      nulo: parseBscNumber(null),
      lixo: parseBscNumber("abc"),
    }).toEqual({
      traco: null,
      travessao: null,
      vazio: null,
      espacos: null,
      nulo: null,
      lixo: null,
    });
  });

  it("aceita número já numérico e recusa o que não é finito", () => {
    expect({
      numero: parseBscNumber(46.03),
      infinito: parseBscNumber(Number.POSITIVE_INFINITY),
      nan: parseBscNumber(Number.NaN),
    }).toEqual({ numero: 46.03, infinito: null, nan: null });
  });

  it("o ponto é separador de MILHAR, não decimal — trocar isso multiplica por mil", () => {
    // "1.877" em pt-BR é mil oitocentos e setenta e sete. Lido como inglês viraria 1,877 — e um
    // indicador de 1,877% pareceria catástrofe onde não há nenhuma.
    expect(parseBscNumber("1.877")).toBe(1877);
    expect(parseBscNumber("1.234.567")).toBe(1234567);
  });

  it("recusa o mesmo relatório renderizado em INGLÊS em vez de multiplicar por cem", () => {
    /**
     * O relatório abriu em inglês na mesma conta e no mesmo navegador (medido em 2026-08-17): lá ele
     * escreve "100.00%" e "9.50%", onde o ponto é DECIMAL. Pela regra brasileira — milhar tem três
     * casas — isso viraria 10000 e 950. O primeiro estouraria a escala e derrubaria a página inteira,
     * mas o segundo passaria: 950% de um indicador cujo piso é 97 pareceria desempenho excepcional.
     * Como o texto sozinho não diz em que idioma foi escrito, ausência é a única resposta honesta.
     */
    expect({
      cem: parseBscNumber("100.00%"),
      baixo: parseBscNumber("9.50%"),
      zero: parseBscNumber("0.00%"),
    }).toEqual({ cem: null, baixo: null, zero: null });
  });
});

describe("ingestBscSnapshot", () => {
  const base = {
    period: "day" as const,
    periodLabel: "17 de ago. de 2026 - 17 de ago. de 2026",
    score: "62,75",
    zone: "Zona de Atenção",
    indicators: { SPOT: "46,03%" },
  };

  it("recusa carimbo no futuro — é fuso errado, e vence as leituras certas no painel", async () => {
    /**
     * Um robô rodando em UTC somou -03:00 a uma hora que já era UTC e gravou três snapshots
     * adiantados em três horas. O painel escolhe, por período, o maior `captured_at` — então aquelas
     * três leituras meio carregadas ganhariam de toda leitura correta pelas três horas seguintes,
     * sem parecer defeito nenhum: pareceriam o dado mais fresco que existe.
     */
    await expect(
      ingestBscSnapshot({ ...base, capturedAt: new Date(Date.now() + 3 * 3600_000).toISOString() }),
    ).rejects.toMatchObject({ code: "BSC_CAPTURED_AT_IN_FUTURE" });
  });

  it("deixa passar o relógio destoando alguns minutos", async () => {
    // A folga existe para máquina com relógio um pouco adiantado, não para erro de fuso: cinco
    // minutos passam, três horas não. Aqui só se afirma que a TRAVA não disparou — a gravação em si
    // depende do banco e é exercício de teste de integração, não deste arquivo.
    const perto = ingestBscSnapshot({
      ...base,
      capturedAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    }).catch((e: { code?: string }) => e);
    await expect(perto).resolves.not.toMatchObject({ code: "BSC_CAPTURED_AT_IN_FUTURE" });
  });
});
