import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * O QUE A CARGA DE POSIÇÕES PRECISA DESCARTAR (2026-08-26, a pedido).
 *
 * O valor deste teste está quase todo num caso: **latitude e longitude ZERO**.
 *
 * Zero-zero não é "sem posição" — é um ponto REAL, no Atlântico ao largo da África. Dois dos 91
 * registros medidos em produção vieram assim, junto com data ausente. Sem o descarte, dois
 * caminhões apareceriam boiando no meio do oceano, e um mapa com um caminhão no mar perde a
 * confiança de quem olha para sempre.
 *
 * É o tipo de defeito que nenhum tipo pega — `0` é um `number` perfeitamente válido — e que só se
 * vê olhando a tela.
 */

const posicoes = vi.hoisted(() => vi.fn());
const gravar = vi.hoisted(() => vi.fn(async (l: unknown[]) => l.length));
const cred = vi.hoisted(() => vi.fn());

vi.mock("../../lib/integra/cliente", () => ({
  getPosicoes: posicoes,
  credenciaisDaIntegra: cred,
}));
vi.mock("@brazil-tms/db", () => ({ gravarPosicoesDaGerenciadora: gravar }));

const { runCarregarPosicoes } = await import("./index");

describe("a carga de posições da gerenciadora", () => {
  beforeEach(() => {
    cred.mockReturnValue({ Ambiente: "Producao", Login: "x", Senha: "y", TipoRetorno: "JSON" });
    gravar.mockClear();
    posicoes.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  /**
   * SEM CREDENCIAL É ESTADO LEGÍTIMO, e não falha.
   *
   * É o padrão em toda máquina onde a integração não foi ligada — inclusive produção hoje. O job
   * precisa sair em silêncio, sem tentar a rede e sem escrever nada.
   */
  it("não faz nada, e não falha, sem credencial", async () => {
    cred.mockReturnValue(null);
    const r = await runCarregarPosicoes();
    expect(r).toEqual({ ligado: false, recebidas: 0, gravadas: 0, descartadas: 0 });
    expect(posicoes).not.toHaveBeenCalled();
    expect(gravar).not.toHaveBeenCalled();
  });

  it("descarta a coordenada ZERO — ela é um ponto no meio do Atlântico", async () => {
    posicoes.mockResolvedValue([
      { Placa: "ABC1D23", Latitude: -23.5, Longitude: -46.6, Cidade: "SAO PAULO", UF: "SP" },
      { Placa: "XYZ9W88", Latitude: 0, Longitude: 0 },
    ]);
    const r = await runCarregarPosicoes();

    expect(r.recebidas).toBe(2);
    expect(r.descartadas).toBe(1);

    const gravadas = gravar.mock.calls[0]![0] as { placa: string; latitude: number | null }[];
    // A LINHA CONTINUA sendo gravada, sem coordenada: a gerenciadora conhece esse caminhão, e
    // "conheço e não sei onde está" é informação. Quem desenha o mapa é que filtra.
    expect(gravadas).toHaveLength(2);
    expect(gravadas.find((g) => g.placa === "XYZ9W88")?.latitude).toBeNull();
    expect(gravadas.find((g) => g.placa === "ABC1D23")?.latitude).toBe(-23.5);
  });

  it("descarta coordenada fora do planeta", async () => {
    posicoes.mockResolvedValue([{ Placa: "AAA1A11", Latitude: 999, Longitude: -46.6 }]);
    await runCarregarPosicoes();
    const g = (gravar.mock.calls[0]![0] as { latitude: number | null }[])[0]!;
    expect(g.latitude).toBeNull();
  });

  /**
   * O CAMPO `Motorista` TRAZ CPF, apesar do nome.
   *
   * Conferido nos 91 registros de produção: `08004345441`, `30951722816`. Guardar só os dígitos é o
   * que permite casar com o nosso cadastro, onde parte das linhas tem pontuação.
   */
  it("guarda o CPF do motorista só com dígitos", async () => {
    posicoes.mockResolvedValue([
      { Placa: "BBB2B22", Latitude: -20, Longitude: -44, Motorista: "080.043.454-41" },
    ]);
    await runCarregarPosicoes();
    const g = (gravar.mock.calls[0]![0] as { cpfMotorista: string | null }[])[0]!;
    expect(g.cpfMotorista).toBe("08004345441");
  });

  it("normaliza a placa, porque a gerenciadora manda com e sem hífen", async () => {
    posicoes.mockResolvedValue([
      { Placa: "hij-0086", Latitude: -22.4, Longitude: -45.96 },
      { Placa: "GVQ7F40", Latitude: -20.1, Longitude: -44.9 },
    ]);
    await runCarregarPosicoes();
    const g = gravar.mock.calls[0]![0] as { placa: string }[];
    expect(g.map((x) => x.placa)).toEqual(["HIJ0086", "GVQ7F40"]);
  });

  /**
   * DATA AUSENTE OU IMPOSSÍVEL VIRA NULO — nunca "agora".
   *
   * Se a ausência virasse a hora da carga, uma posição de março pareceria de segundos atrás, e o
   * painel diria "está em Guarulhos" sobre um caminhão que não reporta há cinco meses.
   */
  it("não inventa data quando ela não vem", async () => {
    posicoes.mockResolvedValue([
      { Placa: "CCC3C33", Latitude: -20, Longitude: -44 },
      { Placa: "DDD4D44", Latitude: -20, Longitude: -44, DataHoraPos: "nada disso" },
      { Placa: "EEE5E55", Latitude: -20, Longitude: -44, DataHoraPos: "2026-08-26T13:23:18.000-03:00" },
    ]);
    await runCarregarPosicoes();
    const g = gravar.mock.calls[0]![0] as { placa: string; posicaoEm: Date | null }[];
    expect(g.find((x) => x.placa === "CCC3C33")?.posicaoEm).toBeNull();
    expect(g.find((x) => x.placa === "DDD4D44")?.posicaoEm).toBeNull();
    expect(g.find((x) => x.placa === "EEE5E55")?.posicaoEm).toBeInstanceOf(Date);
  });

  it("pula o registro sem placa em vez de gravar linha anônima", async () => {
    posicoes.mockResolvedValue([
      { Placa: "", Latitude: -20, Longitude: -44 },
      { Placa: "FFF6F66", Latitude: -20, Longitude: -44 },
    ]);
    const r = await runCarregarPosicoes();
    const g = gravar.mock.calls[0]![0] as { placa: string }[];
    expect(g).toHaveLength(1);
    expect(g[0]!.placa).toBe("FFF6F66");
    expect(r.descartadas).toBe(1);
  });
});
