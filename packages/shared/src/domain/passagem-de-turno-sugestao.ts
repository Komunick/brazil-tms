import { SECOES_DO_SETOR, type Setor } from "./passagem-de-turno";

/**
 * O QUE O TMS PREENCHE SOZINHO NUM ITEM DA PASSAGEM DE TURNO (2026-08-27, a pedido).
 *
 * Digitou a LH, o resto aparece: origem, destino, ETA da coleta, motorista, placa, rota. É a
 * diferença entre a planilha e o sistema — na planilha alguém copia seis campos do portal, um por
 * um, com o telefone no ombro; aqui a LH basta.
 *
 * ── A REGRA QUE MANTÉM ISTO CONFIÁVEL: SÓ PREENCHE O QUE ESTÁ VAZIO ───────────────────────────
 *
 * Uma sugestão NUNCA sobrescreve o que uma pessoa escreveu. Parece detalhe e é o contrário: o campo
 * digitado é o que alguém decidiu, muitas vezes de propósito diferente do cadastro — a origem que o
 * motorista relatou, o destino que mudou por telefone e ainda não voltou ao portal.
 *
 * Sobrescrever apagaria justamente a informação que o turno tinha e o sistema não tem. E apagaria
 * em silêncio, no momento em que a pessoa sai do campo — o pior instante possível para perder algo.
 *
 * ── E SÓ OS CAMPOS QUE A SEÇÃO DECLARA ────────────────────────────────────────────────────────
 *
 * As 20 seções têm colunas diferentes. Uma sugestão traz tudo que soube achar, mas o item só aceita
 * o que sua seção tem — senão o `jsonb` guardaria campo que a tela não desenha e a conferência da
 * rota recusaria a gravação com "campo desconhecido".
 */

/** O que a busca por LH (ou por motorista) conseguiu descobrir. Tudo opcional: falta é normal. */
export interface Sugestao {
  origem?: string;
  destino?: string;
  eta_origem?: string;
  motorista?: string;
  placa?: string;
  rota?: string;
  data_criacao?: string;
  telefone?: string;
  perfil?: string;
  /** De onde veio — a tela diz isso, para a pessoa saber o que está aceitando. */
  fonte?: "viagem" | "spot" | "motorista";
}

/**
 * Mescla a sugestão no que já está preenchido.
 *
 * Devolve um objeto NOVO e a lista do que foi realmente preenchido — a tela usa essa lista para
 * dizer o que aconteceu. Um preenchimento invisível é indistinguível de um campo que a pessoa
 * esqueceu de conferir.
 */
export function aplicarSugestao(
  setor: Setor,
  secaoChave: string,
  dados: Record<string, string>,
  sugestao: Sugestao,
): { dados: Record<string, string>; preenchidos: string[] } {
  const secao = SECOES_DO_SETOR[setor]?.find((s) => s.chave === secaoChave);
  if (!secao) return { dados, preenchidos: [] };

  const aceitos = new Set(secao.campos.map((c) => c.chave));
  const saida = { ...dados };
  const preenchidos: string[] = [];

  for (const [chave, valor] of Object.entries(sugestao)) {
    // `fonte` descreve a sugestão, não é conteúdo do item.
    if (chave === "fonte") continue;
    if (!aceitos.has(chave)) continue;
    if (typeof valor !== "string" || valor.trim() === "") continue;
    // A regra inteira está nesta linha: vazio recebe, preenchido fica como está.
    if ((saida[chave] ?? "").trim() !== "") continue;

    saida[chave] = valor;
    preenchidos.push(chave);
  }

  return { dados: saida, preenchidos };
}

/**
 * A seção tem campo de LH? É o que decide se a tela liga a busca ao sair daquele campo.
 *
 * Catorze das vinte têm. As seis que não têm giram em torno do MOTORISTA (no show, disponível,
 * bloqueio, bonificação) ou da ROTA (acompanhamento): nenhuma delas parte de uma viagem, e por isso
 * não há o que buscar. O teste fixa essa lista — ver `docs/PROPOSTA-PASSAGEM-DE-TURNO.md`.
 */
export function secaoTemLH(setor: Setor, secaoChave: string): boolean {
  return Boolean(
    SECOES_DO_SETOR[setor]
      ?.find((s) => s.chave === secaoChave)
      ?.campos.some((c) => c.chave === "lh"),
  );
}

/**
 * O PERFIL a partir do tipo de veículo do cadastro.
 *
 * A planilha só conhece dois: `CARRETA` e `TRUCK`. O cadastro conhece onze. A tradução é por
 * ARTICULAÇÃO, que é o que a operação quer dizer com esses dois nomes — se puxa carreta é CARRETA,
 * se o corpo é sobre o próprio chassi é TRUCK.
 *
 * `cavalo` é CARRETA de propósito: sozinho ele não carrega nada, e quem escreve "cavalo" na
 * programação está falando de um conjunto.
 *
 * Um tipo que não estiver aqui devolve `null` e o campo fica VAZIO — em vez de chutar. Vazio faz
 * alguém preencher; um chute errado ninguém confere.
 */
const PERFIL_POR_TIPO: Record<string, "CARRETA" | "TRUCK"> = {
  carreta: "CARRETA",
  carreta_ls: "CARRETA",
  bitrem: "CARRETA",
  rodotrem: "CARRETA",
  cavalo: "CARRETA",
  truck: "TRUCK",
  bitruck: "TRUCK",
  toco: "TRUCK",
  vuc: "TRUCK",
  van: "TRUCK",
  tres_quartos: "TRUCK",
};

export function perfilDoTipoDeVeiculo(tipo: string | null | undefined): "CARRETA" | "TRUCK" | null {
  if (!tipo) return null;
  return PERFIL_POR_TIPO[tipo] ?? null;
}

/** `SIMÕES FILHO` + `JABOATÃO` → `SIMÕES FILHO X JABOATÃO`, como a planilha escreve. */
export function rotaEscrita(origem?: string | null, destino?: string | null): string | undefined {
  const o = (origem ?? "").trim();
  const d = (destino ?? "").trim();
  return o && d ? `${o} X ${d}` : undefined;
}
