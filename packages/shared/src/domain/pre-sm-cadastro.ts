import { normalizarEstacao, ufECidadeDaEstacao } from "./pre-sm-modelos";

/**
 * O CASAMENTO COM O CADASTRO DA GERENCIADORA (2026-08-25, fatia 027).
 *
 * Duas pontes, e a segunda depende da primeira:
 *
 *   estação nossa      →  cidade dela (código IBGE)
 *   par de cidades     →  rota dela (`CodRota`)
 *
 * ── O CASAMENTO É POR CIDADE, NÃO POR ESTAÇÃO ────────────────────────────────────────────────
 *
 * As descrições das rotas dela são por cidade:
 *
 *   `SHPX LOGISTICA LTDA. - SIMOES FILHO/BA/BRASIL ATE SHPX LOGISTICA LTDA. - ARACAJU/SE/BRASIL`
 *
 * **Uma** das 518 usa o nosso padrão de estação. A primeira versão desta fatia supunha o contrário
 * — que daria para casar por nome de estação, como a 026 fazia com modelos. Medido: casaria **1
 * rota de 134**.
 *
 * ── E ESTE ARQUIVO PROPÕE; ELE NÃO DECIDE ─────────────────────────────────────────────────────
 *
 * O que sai daqui vira linha com `confirmado_em` NULO. Só passa a valer depois que uma pessoa
 * confirma — porque o casamento por nome, quando erra, **erra apontando para OUTRA cidade**, não em
 * branco. Uma Pré-SM com a cidade errada é escolta contratada para um trajeto que o caminhão não vai
 * fazer.
 */

export interface CidadeDelas {
  codIbge: number;
  cidade: string;
  uf: string;
}

export interface RotaDelas {
  codigo: number;
  descricao: string;
  codIbgeOrigem: number;
  codIbgeDestino: number;
}

export interface CidadeProposta {
  estacaoNorm: string;
  uf: string;
  cidadeNome: string;
  codIbge: number;
  descricao: string;
}

export interface RotaProposta {
  origemNorm: string;
  destinoNorm: string;
  codRota: number;
  descricao: string;
}

/** A chave de comparação de uma cidade: nome sem acento e pontuação, mais a UF. */
const chaveCidade = (nome: string, uf: string) => `${normalizarEstacao(nome)}|${uf.toUpperCase()}`;

/**
 * A cidade de uma estação, no cadastro dela — ou `null` quando não há.
 *
 * ── A TOLERÂNCIA DO SUFIXO: DESCARTA DO FIM, UM TERMO POR VEZ ────────────────────────────────
 *
 * As estações carregam bairro, distrito ou número no fim do nome, e a cidade é o que sobra:
 *
 *     RECIFE MURIBECA          →  RECIFE
 *     SAO LUIS 1               →  SAO LUIS
 *     BELO HORIZONTE 2         →  BELO HORIZONTE
 *     UMUARAMA PQ INDUST II    →  UMUARAMA
 *
 * **Cair para o primeiro termo seria errado**, e foi a primeira versão desta função: quebraria toda
 * cidade de nome composto — `SAO LUIS 1` viraria `SAO`, `BELO HORIZONTE 2` viraria `BELO`. Medido:
 * custava 4 rotas e ~150 viagens.
 *
 * Descartar do fim tenta `SAO LUIS 1`, depois `SAO LUIS`, e para no acerto.
 *
 * ── E A ORDEM É A REGRA INTEIRA ───────────────────────────────────────────────────────────────
 *
 * O nome mais longo é tentado **primeiro**. `SIMOES FILHO` existe como cidade; encurtar antes de
 * tentar o nome inteiro a transformaria em `SIMOES`, que é outro lugar.
 */
export function acharCidade(
  nomeEstacao: string | null | undefined,
  cidadesDelas: readonly CidadeDelas[],
): CidadeProposta | null {
  const { uf, cidade } = ufECidadeDaEstacao(nomeEstacao);
  if (!uf || !cidade) return null;

  const porChave = new Map<string, CidadeDelas>();
  for (const c of cidadesDelas) porChave.set(chaveCidade(c.cidade, c.uf), c);

  // Do nome inteiro para o mais curto, parando no primeiro acerto.
  const termos = cidade.split(" ").filter(Boolean);
  let achada: CidadeDelas | undefined;
  for (let n = termos.length; n >= 1 && !achada; n--) {
    achada = porChave.get(chaveCidade(termos.slice(0, n).join(" "), uf));
  }
  if (!achada) return null;

  return {
    estacaoNorm: [uf, cidade].join(" "),
    uf,
    cidadeNome: cidade,
    codIbge: achada.codIbge,
    descricao: `${achada.cidade} / ${achada.uf}`,
  };
}

/** A chave que identifica uma estação nas duas pontas — a mesma que a busca usa. */
export function chaveDaEstacao(nomeEstacao: string | null | undefined): string {
  const { uf, cidade } = ufECidadeDaEstacao(nomeEstacao);
  return uf && cidade ? [uf, cidade].join(" ") : "";
}

/**
 * Propõe uma cidade para cada estação nossa, sem confirmar nenhuma.
 *
 * Devolve só o que casou. O que não casou é a lista de estações que precisam de cadastro ou de
 * atenção humana — e é informação útil por si só.
 */
export function proporCidades(
  estacoes: readonly string[],
  cidadesDelas: readonly CidadeDelas[],
): CidadeProposta[] {
  const vistas = new Set<string>();
  const saida: CidadeProposta[] = [];
  for (const e of estacoes) {
    const p = acharCidade(e, cidadesDelas);
    if (!p || vistas.has(p.estacaoNorm)) continue;
    vistas.add(p.estacaoNorm);
    saida.push(p);
  }
  return saida;
}

/**
 * Propõe uma rota para cada par origem–destino nosso, sem confirmar nenhuma.
 *
 * O casamento é pelo par de códigos IBGE — ver o comentário do topo. Uma rota nossa só entra se as
 * DUAS cidades tiverem sido resolvidas: sem uma delas não há par, e chutar seria pior do que deixar
 * de fora.
 *
 * Medido em 25/08: das 134 rotas nossas, 96 resolvem as duas cidades e **53 têm rota cadastrada** —
 * 52% das viagens. As outras 81 são trabalho de cadastro **na gerenciadora**.
 */
export function proporRotas(
  rotasNossas: readonly { origem: string; destino: string }[],
  ibgePorEstacao: ReadonlyMap<string, number>,
  rotasDelas: readonly RotaDelas[],
): RotaProposta[] {
  const porPar = new Map<string, RotaDelas>();
  for (const r of rotasDelas) porPar.set(`${r.codIbgeOrigem}>${r.codIbgeDestino}`, r);

  const vistas = new Set<string>();
  const saida: RotaProposta[] = [];

  for (const n of rotasNossas) {
    const origemNorm = chaveDaEstacao(n.origem);
    const destinoNorm = chaveDaEstacao(n.destino);
    const par = `${origemNorm}>${destinoNorm}`;
    if (!origemNorm || !destinoNorm || vistas.has(par)) continue;

    const io = ibgePorEstacao.get(origemNorm);
    const id = ibgePorEstacao.get(destinoNorm);
    if (io == null || id == null) continue;

    const dela = porPar.get(`${io}>${id}`);
    if (!dela) continue;

    vistas.add(par);
    saida.push({ origemNorm, destinoNorm, codRota: dela.codigo, descricao: dela.descricao });
  }
  return saida;
}
