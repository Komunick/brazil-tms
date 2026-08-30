import { normalizarEstacao } from "./pre-sm-modelos";

/**
 * A CIDADE VIRA CÓDIGO IBGE — para os dois campos que o `setMotorista` exige (fatia 028, etapa 5).
 *
 * São DOIS códigos e eles vêm de lugares diferentes: `CodIBGECidadeNatal` sai da cidade lida na CNH
 * ("FEIRA DE SANTANA, BA"), e `CodIBGECidade` sai da cidade que o CEP resolveu ("Salvador" + "BA").
 * Sem os dois, nenhum cadastro pode ser enviado.
 *
 * ── POR QUE ISTO NÃO É `acharCidade` ──────────────────────────────────────────────────────────
 *
 * O `acharCidade` da 027 resolve o problema VIZINHO e mais difícil: extrair a cidade de um NOME DE
 * ESTAÇÃO (`SoC_BA_Simoes Filho`), onde a UF vem embutida no prefixo e o nome carrega bairro,
 * distrito ou número no fim.
 *
 * Aqui a cidade já vem separada e a UF já vem à parte. Reusar `acharCidade` exigiria fabricar um
 * nome de estação falso para ele desmontar — e o dia em que o formato de estação mudasse quebraria
 * o cadastro de motorista sem nenhuma relação aparente.
 *
 * O que É reusado, e isso importa, é o NORMALIZADOR: `normalizarEstacao` tira acento, caixa e
 * pontuação. Escrever um segundo normalizador é a armadilha que o projeto já documenta — dois
 * divergem em silêncio, e a cidade deixa de casar sem erro nenhum.
 *
 * ── E POR QUE NÃO HÁ TOLERÂNCIA DE SUFIXO ─────────────────────────────────────────────────────
 *
 * `acharCidade` vai descartando termos do fim ("RECIFE MURIBECA" → "RECIFE") porque nome de estação
 * carrega bairro. Uma cidade impressa na CNH ou devolvida pelo ViaCEP **não carrega**: ela já é o
 * município. Aplicar a mesma tolerância aqui faria "SÃO PAULO" casar a partir de qualquer coisa que
 * comece com "SÃO" — e um cadastro no município errado é pior do que um cadastro que não sai.
 */

export interface CidadeDoCatalogo {
  codIbge: number;
  cidade: string;
  uf: string;
}

/** A chave de comparação: nome normalizado mais a UF. Mesma forma que a 027 usa. */
const chave = (cidade: string, uf: string): string =>
  `${normalizarEstacao(cidade)}|${uf.trim().toUpperCase()}`;

/**
 * O índice do catálogo, montado UMA vez por lote.
 *
 * São 5.571 municípios (medido em 25/08). Montar o mapa a cada resolução transformaria um envio em
 * lote numa varredura quadrática — e o job de envio automático vai processar a fila inteira.
 */
export function indexarCidades(catalogo: readonly CidadeDoCatalogo[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const c of catalogo) mapa.set(chave(c.cidade, c.uf), c.codIbge);
  return mapa;
}

/**
 * O código IBGE de uma cidade — ou `null` quando ela não existe no catálogo DELES.
 *
 * `null` e não exceção: cidade que não casa é um motivo de não enviar, mostrado na fila junto dos
 * outros, e não uma falha do job. Ver `motivosDeNaoCadastrar`.
 *
 * Sem UF não há resposta possível: há município homônimo em estados diferentes, e escolher o
 * primeiro seria cadastrar a pessoa na cidade errada — exatamente o tipo de valor plausível e
 * errado que ninguém confere.
 */
export function ibgeDaCidade(
  cidade: string | null | undefined,
  uf: string | null | undefined,
  indice: Map<string, number>,
): number | null {
  const nome = String(cidade ?? "").trim();
  const sigla = String(uf ?? "").trim();
  if (!nome || sigla.length !== 2) return null;
  return indice.get(chave(nome, sigla)) ?? null;
}
