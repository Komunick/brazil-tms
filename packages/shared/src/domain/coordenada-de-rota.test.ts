import { describe, expect, it } from "vitest";
import {
  chaveDaCidadeDelas,
  chavesToleradas,
  distanciaKm,
  pontasDoKML,
} from "./coordenada-de-rota";
import { chaveDaEstacao } from "./pre-sm-cadastro";

/**
 * A COORDENADA TIRADA DO KML DAS ROTAS (2026-08-26, a pedido).
 *
 * O valor destes testes está quase todo num caso: **a ordem das coordenadas**.
 *
 * O padrão KML é `lon,lat`. A gerenciadora manda `lat,lon,alt` — contra o padrão. Trocar os dois
 * põe o Brasil na Somália, e o resultado é um mapa com caminhões na África sem erro nenhum aparecer.
 * É o tipo de defeito que tipo não pega (dois `number` são dois `number`).
 *
 * Eu li errado na primeira vez e ACERTEI POR ACASO, conferindo os números contra a cidade a olho.
 * Quem denunciou foi a faixa do Brasil, ao recusar a leitura invertida na primeira simulação real.
 */
describe("pontasDoKML", () => {
  /** Medido em 26/08 na rota real Simões Filho → São Luís, encurtado ao essencial. */
  const kml = (coords: string) =>
    `<?xml version="1.0"?><kml><Document><Placemark><LineString><coordinates>${coords}</coordinates></LineString></Placemark></Document></kml>`;

  /**
   * O QUE A GERENCIADORA MANDA DE VERDADE: `lat,lon,alt`.
   *
   * Contra o padrão do formato, que é `lon,lat`. Estes são os pontos reais da rota Simões Filho →
   * São Luís, copiados da resposta de 26/08 — repare no terceiro campo, a altitude.
   */
  it("lê a ordem da gerenciadora, que é latitude primeiro", () => {
    const p = pontasDoKML(kml("-12.81504,-38.39845,0 -10.2,-40.1,0 -2.62759,-44.25751,0"));
    // Simões Filho fica na Bahia: latitude -12,8, longitude -38,4.
    expect(p.origem).toEqual({ lat: -12.81504, lon: -38.39845 });
    expect(p.destino).toEqual({ lat: -2.62759, lon: -44.25751 });
  });

  /**
   * E TAMBÉM A ORDEM DO PADRÃO, se um dia eles corrigirem.
   *
   * Fixar a ordem deles quebraria em silêncio no dia da correção, e o sintoma seria caminhões na
   * África. Como as faixas de latitude e longitude do Brasil não se sobrepõem, no máximo uma das
   * duas leituras é válida — não há adivinhação.
   */
  it("lê também a ordem do padrão, sem confundir as duas", () => {
    const p = pontasDoKML(kml("-38.39845,-12.81504,0"));
    expect(p.origem).toEqual({ lat: -12.81504, lon: -38.39845 });
  });

  it("recusa o ponto que não cabe no Brasil em nenhuma das ordens", () => {
    // Paris: 48,85 / 2,35. Nenhuma leitura o põe no Brasil.
    expect(pontasDoKML(kml("48.8566,2.3522,0")).origem).toBeNull();
  });

  it("recusa zero-zero, que é um ponto no Atlântico", () => {
    expect(pontasDoKML(kml("0,0")).origem).toBeNull();
  });

  it("devolve nulo sem KML, em vez de explodir", () => {
    expect(pontasDoKML(null)).toEqual({ origem: null, destino: null });
    expect(pontasDoKML("<kml></kml>")).toEqual({ origem: null, destino: null });
  });

  it("junta os blocos quando a rota vem partida em vários", () => {
    const varios = `<kml><coordinates>-38.4,-12.8 -39,-11</coordinates><coordinates>-44.2,-2.6</coordinates></kml>`;
    const p = pontasDoKML(varios);
    expect(p.origem?.lon).toBe(-38.4);
    expect(p.destino?.lon).toBe(-44.2);
  });
});

/**
 * A CIDADE DA ROTA PRECISA CASAR COM A DA ESTAÇÃO, e os dois lados vêm de fontes diferentes.
 *
 * Estação: `SOC_BA_Simões Filho`, do portal do cliente.
 * Rota:    `SIMOES FILHO/BA/BRASIL`, da gerenciadora.
 *
 * Se as duas não produzirem a MESMA chave, a varredura não acha rota nenhuma e o job grava zero —
 * sem erro, sem pista. É o modo de falhar mais caro que existe.
 */
describe("chaveDaCidadeDelas", () => {
  it("produz a mesma chave que a estação, que é o ponto inteiro", () => {
    expect(chaveDaCidadeDelas("SIMOES FILHO/BA/BRASIL")).toBe(
      chaveDaEstacao("SOC_BA_Simões Filho"),
    );
    expect(chaveDaCidadeDelas("SAO LUIS/MA/MA")).toBe(chaveDaEstacao("LM Hub_MA_São Luís"));
  });

  it("ignora o terceiro campo, que às vezes é país e às vezes repete a UF", () => {
    expect(chaveDaCidadeDelas("GOIANIA/GO/BRASIL")).toBe(chaveDaCidadeDelas("GOIANIA/GO/GO"));
  });

  it("devolve vazio no que não é cidade/UF, em vez de casar por engano", () => {
    expect(chaveDaCidadeDelas("SHPX LOGISTICA LTDA.")).toBe("");
    expect(chaveDaCidadeDelas(null)).toBe("");
    expect(chaveDaCidadeDelas("SO A CIDADE")).toBe("");
  });
});

describe("distanciaKm", () => {
  const simoesFilho = { lat: -12.815, lon: -38.398 };
  const saoLuis = { lat: -2.628, lon: -44.258 };

  it("acerta a ordem de grandeza numa distância conhecida", () => {
    // A rota rodoviária é de 1.553 km (a própria gerenciadora informa). Em linha reta dá bem menos —
    // e é essa a diferença que a tela precisa dizer.
    const km = distanciaKm(simoesFilho, saoLuis);
    expect(km).toBeGreaterThan(1200);
    expect(km).toBeLessThan(1350);
  });

  it("é zero para o mesmo ponto, e simétrica", () => {
    expect(distanciaKm(simoesFilho, simoesFilho)).toBe(0);
    expect(distanciaKm(simoesFilho, saoLuis)).toBeCloseTo(distanciaKm(saoLuis, simoesFilho), 6);
  });

  /**
   * O caso que a feature de fato usa: ORDENAR caminhões perto da coleta.
   *
   * E é aqui que se vê por que precisão de cidade basta — deslocar a origem em oito quilômetros não
   * troca a ordem de veículos que estão a 25, 39 e 122.
   */
  it("a ordem sobrevive a um erro de 8 km na origem", () => {
    const frota = [
      { nome: "perto", p: { lat: -12.9, lon: -38.35 } },
      { nome: "medio", p: { lat: -13.1, lon: -38.2 } },
      { nome: "longe", p: { lat: -13.8, lon: -37.6 } },
    ];
    const ordem = (o: { lat: number; lon: number }) =>
      [...frota].sort((a, b) => distanciaKm(o, a.p) - distanciaKm(o, b.p)).map((f) => f.nome);

    const exata = ordem(simoesFilho);
    // ~8 km ao norte: 0,072° de latitude.
    const deslocada = ordem({ lat: simoesFilho.lat + 0.072, lon: simoesFilho.lon });
    expect(deslocada).toEqual(exata);
    expect(exata).toEqual(["perto", "medio", "longe"]);
  });
});

/**
 * A TOLERÂNCIA DE SUFIXO — o defeito que só apareceu simulando o job (2026-08-26).
 *
 * `SOC_GO_GOIANIA_02 (AEROPORTO)` normaliza para `GO GOIANIA 2`, e a gerenciadora chama a cidade de
 * `GOIANIA/GO`. Com a chave exata, a estação de MAIOR VOLUME de Goiás não casava com rota nenhuma —
 * e o job gravaria zero para ela, sem erro e sem pista.
 *
 * Descoberto rodando a lógica contra a API antes de ligar o job. Nenhum teste teria pego: eu não
 * sabia que o caso existia.
 */
describe("chavesToleradas", () => {
  it("afrouxa o sufixo de pátio, que é o caso que quebrou", () => {
    expect(chavesToleradas("GO GOIANIA 2")).toEqual(["GO GOIANIA 2", "GO GOIANIA"]);
  });

  /**
   * DO MAIS LONGO PARA O MAIS CURTO, e a ordem é o ponto.
   *
   * Cair direto no primeiro termo quebraria nomes compostos: `SAO LUIS 01` viraria `SAO`, que casa
   * com São Paulo, São Bernardo e mais uma dúzia. Descer um por vez preserva `SAO LUIS` antes.
   */
  it("preserva o nome composto antes de chegar ao primeiro termo", () => {
    expect(chavesToleradas("MA SAO LUIS 1")).toEqual(["MA SAO LUIS 1", "MA SAO LUIS", "MA SAO"]);
  });

  it("o nome de uma palavra só devolve ele mesmo", () => {
    expect(chavesToleradas("MG BETIM")).toEqual(["MG BETIM"]);
  });

  it("vazio não vira lista com string vazia dentro", () => {
    expect(chavesToleradas("")).toEqual([]);
  });
});
