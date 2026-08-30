import { describe, expect, it } from "vitest";
import { ibgeDaCidade, indexarCidades, type CidadeDoCatalogo } from "./cidade-ibge";

/** Um recorte do catálogo real da gerenciadora — 5.571 municípios com CodIBGE. */
const CATALOGO: CidadeDoCatalogo[] = [
  { codIbge: 2927408, cidade: "Salvador", uf: "BA" },
  { codIbge: 2910800, cidade: "Feira de Santana", uf: "BA" },
  { codIbge: 2913606, cidade: "Ilhéus", uf: "BA" },
  { codIbge: 3550308, cidade: "São Paulo", uf: "SP" },
  { codIbge: 3106200, cidade: "Belo Horizonte", uf: "MG" },
  // Homônimos em estados diferentes: é por isso que a UF não é opcional.
  { codIbge: 3303500, cidade: "Nova Iguaçu", uf: "RJ" },
  { codIbge: 4113700, cidade: "Londrina", uf: "PR" },
  { codIbge: 2607901, cidade: "Recife", uf: "PE" },
];

const indice = indexarCidades(CATALOGO);

describe("a cidade vira código IBGE", () => {
  it("casa o nome exato", () => {
    expect(ibgeDaCidade("Salvador", "BA", indice)).toBe(2927408);
  });

  /**
   * A CNH imprime em maiúscula e sem acento; o ViaCEP devolve com acento e caixa mista. As duas
   * grafias precisam chegar ao mesmo município, e é para isso que o normalizador é REUSADO da 027 —
   * um segundo normalizador divergiria em silêncio e a cidade deixaria de casar sem erro nenhum.
   */
  it("acento e caixa não importam — a CNH e o ViaCEP escrevem diferente", () => {
    expect(ibgeDaCidade("ILHEUS", "BA", indice)).toBe(2913606);
    expect(ibgeDaCidade("Ilhéus", "ba", indice)).toBe(2913606);
    expect(ibgeDaCidade("FEIRA DE SANTANA", "BA", indice)).toBe(2910800);
    expect(ibgeDaCidade("SAO PAULO", "SP", indice)).toBe(3550308);
    expect(ibgeDaCidade("Nova Iguacu", "RJ", indice)).toBe(3303500);
  });

  it("espaço sobrando não atrapalha", () => {
    expect(ibgeDaCidade("  Salvador  ", " BA ", indice)).toBe(2927408);
  });

  it("cidade fora do catálogo devolve null, e não um palpite", () => {
    // `null` é motivo de não enviar, mostrado na fila — não uma falha do job.
    expect(ibgeDaCidade("Cidade Que Não Existe", "BA", indice)).toBeNull();
  });

  /**
   * A regra que separa isto do `acharCidade` da 027: lá o nome de estação carrega bairro e a
   * tolerância descarta termos do fim. Aqui não — cidade impressa na CNH JÁ é o município, e
   * tolerar sufixo faria qualquer coisa começada em "SÃO" virar São Paulo.
   */
  it("NÃO tolera sufixo — cadastro no município errado é pior que cadastro que não sai", () => {
    expect(ibgeDaCidade("São Paulo Zona Sul", "SP", indice)).toBeNull();
    expect(ibgeDaCidade("Recife Muribeca", "PE", indice)).toBeNull();
  });

  it("sem UF não há resposta — há município homônimo em estados diferentes", () => {
    expect(ibgeDaCidade("Salvador", "", indice)).toBeNull();
    expect(ibgeDaCidade("Salvador", null, indice)).toBeNull();
    expect(ibgeDaCidade("Salvador", "BAH", indice)).toBeNull();
  });

  it("a UF errada não casa, mesmo com o nome certo", () => {
    expect(ibgeDaCidade("Salvador", "SP", indice)).toBeNull();
  });

  it("cidade vazia devolve null sem estourar", () => {
    expect(ibgeDaCidade("", "BA", indice)).toBeNull();
    expect(ibgeDaCidade(null, "BA", indice)).toBeNull();
    expect(ibgeDaCidade(undefined, undefined, indice)).toBeNull();
  });

  it("o índice é montado uma vez e serve o lote inteiro", () => {
    // 5.571 municípios: montar o mapa por resolução tornaria um envio em lote quadrático.
    expect(indice.size).toBe(CATALOGO.length);
  });
});
