import type { SpotOfferInput } from "@brazil-tms/shared";

/**
 * O AVISO DE SPOT NO TELEGRAM, saindo do TMS (2026-08-24, a pedido).
 *
 * ── POR QUE ELE MUDOU DE CASA ─────────────────────────────────────────────────────────────────
 *
 * O aviso existia antes do TMS: um script numa VM Windows detectava a oferta e mandava para o
 * Telegram e para cá. Essa VM travava sozinha, e como o script era o único robô sem sinal de vida,
 * ninguém sabia dizer se o silêncio era falta de oferta ou máquina morta.
 *
 * Com a detecção movida para o robô do portal, a VM foi desligada — e o Telegram teria ido junto.
 * Ele passa a sair daqui, do mesmo lugar que já recebe a oferta. É a mesma mensagem, para o mesmo
 * grupo; muda só quem a envia.
 *
 * ── FALHA CALADO, E ISSO É DELIBERADO ─────────────────────────────────────────────────────────
 *
 * Sem as variáveis configuradas, não manda nada e não reclama: um TMS de desenvolvimento não deve
 * avisar o grupo da operação, e uma instalação nova não deve quebrar por causa de um aviso.
 *
 * E erro do Telegram NUNCA derruba a gravação da oferta. A oferta no banco é o que sustenta a tela,
 * o som e o cartão do dia; o Telegram é um destino a mais. Se o Telegram estiver fora do ar, o pior
 * que pode acontecer é o aviso não chegar no celular — e não a oferta sumir do sistema.
 *
 * ── E NÃO SEGURA A RESPOSTA AO ROBÔ ───────────────────────────────────────────────────────────
 *
 * Quem chama esta rota é o ciclo de spot, que roda de cinco em cinco segundos. Esperar o Telegram
 * responder antes de devolver o `200` faria o ciclo seguinte atrasar por causa de uma rede lenta do
 * lado de lá. Por isso o disparo é solto — ver o comentário no ponto de chamada.
 */

/** Quanto esperar pelo Telegram antes de desistir. Curto: é aviso, não transação. */
const TEMPO_LIMITE_MS = 8000;

/**
 * A mensagem, em HTML — o formato mais simples que o Telegram aceita com negrito.
 *
 * Os campos são os mesmos que o cartão da tela mostra, e na mesma ordem, para quem olha os dois não
 * ter de traduzir entre eles. O que não veio do portal simplesmente não aparece: linha com "—" num
 * aviso de celular é ruído que empurra o que importa para fora da notificação.
 */
function montarMensagem(o: SpotOfferInput): string {
  const escapar = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const linhas = [`🔨 <b>OFERTA DE SPOT</b>`, ``, `<b>${escapar(o.route)}</b>`];
  if (o.tripNumber) linhas.push(`LH <code>${escapar(o.tripNumber)}</code>`);
  if (o.price) linhas.push(`💰 ${escapar(o.price)}`);
  if (o.vehicle) linhas.push(`🚛 ${escapar(o.vehicle)}`);
  if (o.originArrival) linhas.push(`🕐 origem ${escapar(formatarInstante(o.originArrival))}`);
  if (o.operator) linhas.push(`👤 ${escapar(o.operator)}`);
  return linhas.join("\n");
}

/**
 * O instante em horário de São Paulo, curto.
 *
 * O robô manda em ISO com fuso; quem lê no celular quer "24/08 14:30". Se vier num formato que não
 * dá para interpretar, devolve como veio — melhor um texto estranho do que uma data inventada.
 */
function formatarInstante(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Manda a oferta para o grupo. Devolve `false` quando não havia o que mandar ou o envio falhou —
 * quem chama usa isso só para registrar, nunca para decidir o destino da oferta.
 */
export async function avisarSpotNoTelegram(oferta: SpotOfferInput): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: montarMensagem(oferta),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controle.signal,
    });
    if (!res.ok) {
      // O corpo do Telegram diz o motivo real (chat errado, bot bloqueado, token inválido), e sem
      // ele o diagnóstico vira adivinhação.
      const corpo = await res.text().catch(() => "");
      console.warn(
        JSON.stringify({ aviso: "telegram-spot", status: res.status, corpo: corpo.slice(0, 200) }),
      );
      return false;
    }
    return true;
  } catch (erro) {
    console.warn(
      JSON.stringify({ aviso: "telegram-spot", erro: String(erro).slice(0, 200) }),
    );
    return false;
  } finally {
    clearTimeout(relogio);
  }
}
