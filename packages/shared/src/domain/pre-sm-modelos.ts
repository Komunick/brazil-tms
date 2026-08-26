/**
 * DE QUAL ROTA NOSSA PARA QUAL MODELO DELES (2026-08-25, fatia 026).
 *
 * A gerenciadora Logae tem 89 modelos de Pré-SM cadastrados, e eles são as nossas rotas —
 * `JABOATÃO X RECIFE OLINDA`, `PALMAS X GOIANIA (AEROPORTO)`, `LOUVEIRA X CAMPINAS`. Criar a
 * pré-solicitação é escolher o modelo certo e preencher o que varia.
 *
 * ── AS QUATRO TOLERÂNCIAS, E POR QUE CADA UMA EXISTE ──────────────────────────────────────────
 *
 * Nenhuma é hipótese. Todas saíram de erro real medido em 25/08, ao cruzar as 138 rotas que
 * rodamos com os 89 modelos:
 *
 *   ACENTO           `JABOATÃO` × `JABOATAO`
 *   PARÊNTESES       `GOIANIA_02 (AEROPORTO)` × `GOIANIA (AEROPORTO)`
 *   SIGLA + NÚMERO   `ARACAJU02` × `ARACAJU 02` — o portal cola, o modelo separa
 *   ZERO À ESQUERDA  `ARACAJU 02` × `ARACAJU 2`
 *
 * A última custou caro: sem ela, **4 rotas e 233 viagens/mês** caíam como "sem modelo". E a
 * primeira contagem que eu fiz deu 26 de 138 rotas casadas porque eu cortava o nome da estação no
 * primeiro termo depois da UF — `RECIFE OLINDA` virava `RECIFE` e não achava o modelo que existia.
 * Com as quatro, dá 81 de 138: **84% das viagens**.
 *
 * ── ESTE ARQUIVO PROPÕE; ELE NÃO DECIDE ───────────────────────────────────────────────────────
 *
 * O que sai daqui vira linha em `pre_sm_route_models` com `confirmado_em` NULO, e só passa a valer
 * depois que uma pessoa confirma. Um casamento errado viraria escolta contratada para a rota
 * errada — e este normalizador já errou de verdade, duas vezes, no dia em que foi escrito.
 */

/**
 * O nome de uma estação, reduzido ao que é comparável.
 *
 * A ordem das operações importa: separar sigla de número ANTES de tirar o que não é alfanumérico,
 * senão `ARACAJU02` já teria virado um token só; e tirar o zero à esquerda DEPOIS de separar,
 * senão não há número isolado para limpar.
 */
export function normalizarEstacao(nome: string | null | undefined): string {
  return String(nome ?? "")
    // O portal às vezes prefixa o nome com um código separado por barra vertical.
    .split("|")
    .pop()!
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    // Parênteses e o que há dentro: `GOIANIA_02 (AEROPORTO)` e `GOIANIA (AEROPORTO)` são a mesma
    // estação escrita por dois sistemas diferentes.
    .replace(/\([^)]*\)/g, " ")
    .replace(/([A-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Z])/g, "$1 $2")
    .replace(/[^A-Z0-9]+/g, " ")
    // Zero à esquerda: `02` e `2` são o mesmo número de estação. Sem isto, 4 rotas e 233
    // viagens/mês caem como "sem modelo".
    .replace(/\b0+(\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O nome da estação do TMS costuma vir como `PREFIXO_UF_Cidade[_sufixo]`.
 *
 * O prefixo (`SOC`, `LM HUB`, `XPT`, `FM HUB`) e a UF são nossos, e o modelo da gerenciadora não os
 * usa. O que ela escreve é o que vem DEPOIS da UF — e o nome inteiro, não só o primeiro termo:
 * `LM HUB_PE_RECIFE_OLINDA` é `RECIFE OLINDA`, não `RECIFE`. Foi exatamente aí que eu errei a
 * primeira contagem.
 */
export function tokensDaEstacao(nome: string | null | undefined): Set<string> {
  const { cidade } = ufECidadeDaEstacao(nome);
  return new Set(
    cidade
      .split(" ")
      // `FILHO` sai: `SIMOES FILHO` no nosso cadastro é `SIMOES` no modelo dela, e o sobrenome da
      // cidade não distingue nada — não há outra Simões na malha.
      .filter((t) => t && t !== "FILHO"),
  );
}

/**
 * A UF E A CIDADE, tiradas do NOME da estação (2026-08-25, fatia 027).
 *
 * O `setPreSM` pede o código IBGE das cidades de coleta e entrega, e o nosso cadastro quase não tem
 * cidade preenchida — medido: das 228 estações, **8 têm `city`** e 71 têm `state`. Mas o nome
 * carrega os dois, sempre no mesmo formato `PREFIXO_UF_CIDADE`:
 *
 *   SOC_MG_BETIM                     →  { uf: "MG", cidade: "BETIM" }
 *   LM HUB_TO_PALMAS                 →  { uf: "TO", cidade: "PALMAS" }
 *   SOC_PE_JABOATÃO DOS GUARARAPES   →  { uf: "PE", cidade: "JABOATAO DOS GUARARAPES" }
 *   FM HUB_PR_UMUARAMA_PQ_INDUST_II  →  { uf: "PR", cidade: "UMUARAMA PQ INDUST II" }
 *
 * ── É A MESMA SEPARAÇÃO DO `tokensDaEstacao`, E ISSO É O PONTO ────────────────────────────────
 *
 * Aquela função acha o índice da UF e **descarta** tudo até ela; esta **devolve** o que aquela joga
 * fora. Por isso `tokensDaEstacao` foi reescrita para chamar esta, em vez de repetir a lógica.
 *
 * Dois separadores independentes divergiriam com o tempo, e a divergência seria **silenciosa**: a
 * estação simplesmente não casaria, sem erro em lugar nenhum. É o mesmo defeito que a 026 quase teve
 * entre a carga e a busca.
 *
 * Sem UF no nome, `uf` vem vazia e a cidade é o nome inteiro normalizado — quem chama trata isso
 * como "não sei", que é diferente de um palpite.
 */
export function ufECidadeDaEstacao(nome: string | null | undefined): {
  uf: string;
  cidade: string;
} {
  const partes = String(nome ?? "").split("_");
  const iUf = partes.findIndex((p) => /^[A-Z]{2}$/.test(p.trim()));
  return {
    uf: iUf >= 0 ? partes[iUf]!.trim().toUpperCase() : "",
    cidade: normalizarEstacao((iUf >= 0 ? partes.slice(iUf + 1) : partes).join(" ")),
  };
}

export interface ModeloDaGerenciadora {
  codigo: number;
  /** Como ela escreve: `"JABOATÃO X RECIFE OLINDA"`. */
  descricao: string;
}

export interface CorrespondenciaProposta {
  origemNorm: string;
  destinoNorm: string;
  codModelo: number;
  descricao: string;
}

/**
 * Casa uma rota nossa com um modelo dela — ou `null` quando nenhum serve.
 *
 * O critério é CONTENÇÃO de tokens, nos dois sentidos: `GOIANIA` casa com `GOIANIA 02 AEROPORTO`
 * (o modelo é mais curto) e `RECIFE OLINDA` casa com `RECIFE OLINDA`. Exigir igualdade exata
 * perderia o primeiro caso; comparar por um token só casaria `RECIFE OLINDA` com qualquer Recife.
 */
export function casarModelo(
  origem: string | null | undefined,
  destino: string | null | undefined,
  modelos: readonly ModeloDaGerenciadora[],
): ModeloDaGerenciadora | null {
  const O = tokensDaEstacao(origem);
  const D = tokensDaEstacao(destino);
  if (O.size === 0 || D.size === 0) return null;

  for (const m of modelos) {
    const partes = m.descricao.split(/\s+X\s+/i);
    if (partes.length < 2) continue;
    const a = new Set(normalizarEstacao(partes[0]).split(" ").filter(Boolean));
    const b = new Set(
      normalizarEstacao(partes[partes.length - 1]).split(" ").filter(Boolean),
    );
    if (contido(a, O) && contido(b, D)) return m;
  }
  return null;
}

/** Um lado está contido no outro — em qualquer direção. */
function contido(x: Set<string>, y: Set<string>): boolean {
  const dentro = (p: Set<string>, q: Set<string>) => [...p].every((t) => q.has(t));
  return dentro(x, y) || dentro(y, x);
}

/**
 * Propõe as correspondências para uma lista de rotas nossas.
 *
 * Devolve só o que casou. O que não casou é o que a viagem vai encontrar como "sem modelo"
 * (FR-012), e é a lista de trabalho de cadastro na gerenciadora.
 */
export function proporCorrespondencias(
  rotas: readonly { origem: string; destino: string }[],
  modelos: readonly ModeloDaGerenciadora[],
): CorrespondenciaProposta[] {
  const vistas = new Set<string>();
  const saida: CorrespondenciaProposta[] = [];

  for (const r of rotas) {
    const origemNorm = [...tokensDaEstacao(r.origem)].join(" ");
    const destinoNorm = [...tokensDaEstacao(r.destino)].join(" ");
    const chave = `${origemNorm}>${destinoNorm}`;
    if (!origemNorm || !destinoNorm || vistas.has(chave)) continue;
    vistas.add(chave);

    const m = casarModelo(r.origem, r.destino, modelos);
    if (m) saida.push({ origemNorm, destinoNorm, codModelo: m.codigo, descricao: m.descricao });
  }
  return saida;
}
