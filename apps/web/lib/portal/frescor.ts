/**
 * O PORTAL PAROU DE CHEGAR? (2026-08-19)
 *
 * O robô do portal falha calado, e isso já custou seis horas. No dia da promoção a produção o token
 * do servidor nasceu com 23 caracteres, abaixo do mínimo de 32 que a rota exige, e ela passou a
 * recusar TODA alimentação. Nada disso aparecia: o Chromium seguia aberto, a aba do portal no lugar
 * certo, o site no ar e o painel desenhando números. O único sinal era um 401 no console de um
 * navegador dentro de uma VM, atrás de VNC — o lugar onde ninguém olha.
 *
 * É a mesma classe de falha que o aviso do BSC já cobre (`lib/bsc/frescor.ts`): o dado continua na
 * tela, com a cor certa, parecendo atual. A diferença é que aqui ele é pior, porque o painel do dia
 * é a tela que a operação usa para decidir — uma viagem que o cliente atribuiu há cinco horas
 * simplesmente não existe ali, e ninguém tem como desconfiar.
 *
 * Este módulo não conserta causa nenhuma. Ele fecha o buraco de ninguém perceber, que continua
 * valendo depois de qualquer conserto: nenhum deles garante que não falha de novo.
 */

/**
 * Quantos minutos de silêncio já são sintoma.
 *
 * O robô roda o plano a cada 15 minutos e a execução a cada 5. Uma hora é quatro ciclos perdidos —
 * folga suficiente para uma sessão expirada que se resolve sozinha, para um deploy, para o Chromium
 * engasgar num relatório pesado, sem que o aviso vire ruído.
 *
 * Repare que a régua é MUITO mais curta que a do BSC (30 horas) e isso não é incoerência: o BSC é
 * publicado uma vez por dia, então dado de 20 horas é rotina; o portal fala de quinze em quinze
 * minutos, e uma hora calado só acontece quando algo quebrou.
 */
export const PORTAL_MINUTOS_ATE_AVISAR = 60;

export interface FrescorPortal {
  minutos: number;
  /** Nunca alimentado, ou alimentado há tempo demais. Os dois merecem o mesmo aviso. */
  velho: boolean;
}

export function frescorDoPortal(
  ultimaVista: Date | string | null | undefined,
  agora: Date,
): FrescorPortal {
  // Base vazia, ou robô que nunca falou: não há o que comparar. Silenciar aqui seria repetir o erro
  // que este arquivo existe para corrigir — "sem carimbo" é a versão mais grave de "carimbo velho".
  if (!ultimaVista) return { minutos: Number.POSITIVE_INFINITY, velho: true };
  const carimbo = ultimaVista instanceof Date ? ultimaVista : new Date(ultimaVista);
  if (Number.isNaN(carimbo.getTime())) return { minutos: Number.POSITIVE_INFINITY, velho: true };
  const minutos = (agora.getTime() - carimbo.getTime()) / 60_000;
  // `Math.abs` pelo mesmo motivo do BSC: carimbo no futuro é relógio da VM fora de hora, que já
  // aconteceu neste projeto. Sem ele, um carimbo adiantado nunca cruzaria o limite.
  return { minutos, velho: Math.abs(minutos) >= PORTAL_MINUTOS_ATE_AVISAR };
}

/**
 * "há 75 min" até duas horas, depois em horas, depois em dias.
 *
 * Minutos são a unidade em que o problema nasce, mas ninguém lê "há 380 min" e entende "desde o
 * começo da tarde".
 */
export function idadeDoPortalEmTexto(minutos: number): string | null {
  if (!Number.isFinite(minutos)) return null;
  const m = Math.abs(Math.round(minutos));
  if (m < 120) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} dias`;
}
