/**
 * O BSC PAROU DE CHEGAR? (2026-08-18)
 *
 * O robô do BSC depende de um passo manual que ninguém lembra de fazer: escolher o "Transportador"
 * no filtro do relatório, que não sobrevive a um reinício do Chromium. Sem ele, o Looker mostra
 * "Não há dados", o robô se RECUSA a enviar — corretamente, porque mandar zero seria pior — e o
 * painel simplesmente para de envelhecer.
 *
 * Essa é a pior forma de falhar: o número continua lá, com a cor certa, parecendo atual. Só o
 * carimbo denuncia, e carimbo é a linha que ninguém lê. Este módulo transforma isso em aviso.
 *
 * Não conserta a causa (isso é trabalho no robô) — fecha o buraco de ninguém perceber, que continua
 * valendo mesmo depois de a causa ser consertada: nenhum conserto garante que nunca mais falha.
 */

/**
 * Quantas horas de carimbo velho já são sintoma.
 *
 * O relatório fecha uma vez por dia, de madrugada (o carimbo medido foi 04:12), e o robô relê de
 * hora em hora. Então um dado de 20h atrás é rotina — é só o fim da tarde de um dia normal. Trinta
 * horas já não: significa que a publicação da madrugada não chegou, e sobra um dia inteiro de folga
 * antes de acusar, para o aviso não virar ruído por causa de uma publicação atrasada.
 */
export const BSC_HORAS_ATE_AVISAR = 30;

export interface FrescorBsc {
  horas: number;
  velho: boolean;
}

export function frescorDoBsc(capturedAt: Date | string, agora: Date): FrescorBsc {
  const carimbo = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  const horas = (agora.getTime() - carimbo.getTime()) / 3_600_000;
  // Carimbo no futuro (relógio da VM fora de hora) não é "fresco demais": é sintoma, e já aconteceu
  // neste projeto — o robô somava -03:00 a uma hora que já era UTC e todo dado nascia três horas no
  // futuro. Como `horas` fica negativo, ele nunca cruzaria o limite; o `Math.abs` faz cruzar.
  return { horas, velho: Math.abs(horas) >= BSC_HORAS_ATE_AVISAR };
}

/** "há 31 h" até dois dias; depois disso, em dias — ninguém conta 73 horas de cabeça. */
export function idadeEmTexto(horas: number): string {
  const h = Math.abs(Math.round(horas));
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}
