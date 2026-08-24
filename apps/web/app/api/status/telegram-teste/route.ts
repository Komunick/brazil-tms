import { NextResponse } from "next/server";
import { avisarSpotNoTelegram } from "@/lib/spot/telegram";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * POST /api/status/telegram-teste — prova que o aviso de spot chega no grupo (2026-08-24, a pedido).
 *
 * ── POR QUE UM TESTE, E NÃO ESPERAR A PRÓXIMA OFERTA ──────────────────────────────────────────
 *
 * Ofertas de spot são raras: de 3 a 21 por dia, e nenhuma em algumas manhãs. Sem um jeito de
 * provocar, a primeira notícia de que o Telegram parou vem no dia em que uma oferta boa passou e o
 * grupo não soube. É o mesmo raciocínio do botão de teste do aviso do sistema — e lá a lição já
 * estava escrita: aviso falha de formas que a tela não enxerga.
 *
 * ── ELE É REAL, E POR ISSO SE ANUNCIA ─────────────────────────────────────────────────────────
 *
 * O caminho é o MESMO da oferta de verdade: mesma função, mesmo formato, mesmo grupo. Um teste que
 * usa outro caminho não prova nada sobre o caminho que importa.
 *
 * A mensagem sai marcada como teste no lugar da rota, e com um preço absurdo. Quem receber precisa
 * saber em um segundo que aquilo não é frete para pegar — um teste indistinguível do real faria a
 * operação correr atrás de uma oferta que não existe.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `view_all_trips`, a mesma régua da tela de Status onde o botão vive. É um envio a um grupo
 * interno, não uma ação sobre viagem — e quem diagnostica precisa poder testar sem pedir permissão
 * a alguém.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const enviado = await avisarSpotNoTelegram({
      portalTripId: `teste-${Date.now()}`,
      tripNumber: "TESTE",
      route: `TESTE DE AVISO  ->  ignore esta mensagem`,
      price: "R$ 0,00",
      vehicle: `disparado do TMS em ${agora}`,
    });

    /**
     * `enviado: false` NÃO é erro de servidor, e por isso a resposta é 200 com a razão dentro.
     *
     * O caso comum é o mais bobo: as variáveis não foram configuradas ainda. Devolver 500 faria a
     * tela dizer "falhou" quando o certo é dizer "não está ligado" — e são duas conversas
     * diferentes com quem está diagnosticando.
     */
    const configurado = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
    return NextResponse.json({ enviado, configurado });
  } catch (error) {
    return handleRouteError(error);
  }
}
