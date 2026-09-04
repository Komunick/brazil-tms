/**
 * O DOBRAMENTO DE NOME — comparar pessoa com pessoa entre dois sistemas.
 *
 * Dois sistemas, duas pessoas digitando o mesmo motorista, e o acento nunca sobrevive aos dois: o
 * portal diz "JOSE EDSON DA SILVA", a frota diz "JOSÉ EDSON DA SILVA", e o vínculo os tratava como
 * pessoas diferentes. Medido na base: 3 dos 15 "motoristas sem cadastro" estavam cadastrados o tempo
 * todo — e a operação ia atrás de recadastrar gente que já existia.
 *
 * Isto NÃO afrouxa o casamento: continua exigindo o nome inteiro, igual palavra por palavra. Só para
 * de tratar Ô e O como letras diferentes, do mesmo jeito que a placa já ignora o hífen.
 *
 * ── POR QUE MUDOU DE LUGAR (2026-09-04) ───────────────────────────────────────────────────────
 *
 * Nasceu em `packages/db`, ao lado do casamento que o usava. Quando a CONFIRMAÇÃO da atribuição
 * passou a comparar motorista — e ela é função pura, em `packages/shared` — havia duas saídas:
 * escrever um segundo dobramento lá, ou mover este. Dois dobramentos divergiriam no primeiro acento
 * que alguém acrescentasse a um deles, e o sintoma seria o pior tipo: o mesmo nome casando num
 * caminho e não casando no outro.
 */
const ACENTOS = "ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ";
const SEM_ACENTO = "AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN";

/** As duas tabelas, para o lado do Postgres montar o MESMO dobramento dentro da consulta. */
export const ACENTOS_PARA_DOBRAR = { de: ACENTOS, para: SEM_ACENTO } as const;

export function foldName(value: string): string {
  const semAcento = [...value]
    .map((c) => {
      const i = ACENTOS.indexOf(c);
      return i === -1 ? c : SEM_ACENTO[i]!;
    })
    .join("");
  return semAcento.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Este nome é o mesmo que algum destes?
 *
 * Devolve o que casou, ou `null`. Devolver o nome em vez de um booleano é o que permite a mensagem
 * dizer QUEM apareceu — num caminho onde a resposta "não bateu" precisa ser explicável.
 */
export function nomeEntre(nome: string | null | undefined, candidatos: string[]): string | null {
  const alvo = foldName(nome ?? "");
  if (alvo === "") return null;
  return candidatos.find((c) => foldName(c) === alvo) ?? null;
}
