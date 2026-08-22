/**
 * O AVISO FORA DO NAVEGADOR (2026-08-22, a pedido).
 *
 * O cartão de spot já aparece em toda tela do TMS, mas ele depende de o TMS estar VISÍVEL. Quem está
 * no portal, no e-mail ou com a janela minimizada não vê nada — e a oferta vale enquanto ninguém
 * aceitou.
 *
 * Isto é a notificação do sistema operacional: a que aparece no canto da tela mesmo com o navegador
 * atrás de outra janela.
 *
 * ── SÓ QUANDO O TMS NÃO ESTÁ NA FRENTE ─────────────────────────────────────────────────────────
 *
 * Quem está olhando o TMS já viu o cartão. Disparar as duas coisas ao mesmo tempo é ruído, e ruído
 * é o que faz alguém desligar o aviso inteiro na semana seguinte. `document.hidden` é o critério, e
 * ele responde exatamente à pergunta certa: "esta pessoa está vendo esta aba agora?".
 *
 * ── O QUE O NAVEGADOR NÃO DEIXA ────────────────────────────────────────────────────────────────
 *
 * Permissão é da PESSOA, dada uma vez, e só pode ser pedida a partir de um gesto dela — por isso o
 * botão na tela de ofertas, e não um pedido automático no carregamento (que o Chrome ignora e ainda
 * queima a chance de perguntar de novo).
 *
 * E aba FECHADA continua sem aviso: sem service worker não há como o site falar com o sistema
 * enquanto não está aberto em lugar nenhum. Quem cobre esse caso é o Telegram, que já existe. Este
 * módulo não finge o contrário.
 *
 * FALHA CALADO, como o som: navegador sem suporte, permissão negada, qualquer erro — o cartão
 * continua aparecendo. Aviso extra que vira condição é aviso que quebra o essencial.
 */

export type EstadoDoAviso = "indisponivel" | "concedida" | "negada" | "por_perguntar";

/** O que dá para saber sem incomodar ninguém: suporte do navegador e permissão já decidida. */
export function estadoDoAviso(): EstadoDoAviso {
  if (typeof window === "undefined" || !("Notification" in window)) return "indisponivel";
  const p = Notification.permission;
  return p === "granted" ? "concedida" : p === "denied" ? "negada" : "por_perguntar";
}

/**
 * Pede a permissão. Só faz sentido a partir de um clique.
 *
 * Devolve o estado depois da resposta, para a tela dizer o que aconteceu — inclusive quando a pessoa
 * nega, que é uma resposta legítima e precisa aparecer em vez de sumir.
 */
export async function pedirPermissao(): Promise<EstadoDoAviso> {
  if (estadoDoAviso() === "indisponivel") return "indisponivel";
  try {
    await Notification.requestPermission();
  } catch {
    // Navegador antigo com a API em callback. Sem drama: o estado abaixo diz no que deu.
  }
  return estadoDoAviso();
}

/**
 * Dispara o aviso do sistema.
 *
 * `somenteSeEscondido` é o padrão porque é o caso real: avisar quem já está olhando é repetição.
 * O teste passa `false` — quem apertou "testar" quer ver acontecer agora, olhando para a tela.
 *
 * `tag` faz o sistema SUBSTITUIR o aviso anterior em vez de empilhar. Numa sexta-feira de rajada,
 * empilhar cinquenta cartões no canto da tela é pior do que não avisar.
 */
export function avisarNoSistema(
  titulo: string,
  corpo: string,
  opcoes: { somenteSeEscondido?: boolean } = {},
): boolean {
  const somenteSeEscondido = opcoes.somenteSeEscondido ?? true;
  if (estadoDoAviso() !== "concedida") return false;
  if (somenteSeEscondido && typeof document !== "undefined" && !document.hidden) return false;
  try {
    new Notification(titulo, { body: corpo, tag: "spot", icon: "/favicon.ico" });
    return true;
  } catch {
    return false;
  }
}
