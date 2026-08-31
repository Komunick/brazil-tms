import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MOTORISTA_JOBS,
  VINCULOS_DA_PESQUISA,
  type MotoristaPesquisarPayload,
} from "@brazil-tms/shared";
import { getBffBoss } from "@/lib/queue/boss";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * PEDIR A PESQUISA À GERENCIADORA — ⚠️ **esta rota GASTA** (fatia 028, etapa 6).
 *
 * É a única rota do sistema cuja consequência é uma linha na fatura. Tudo aqui está desenhado em
 * torno disso, e vale comparar com a rota de envio ao lado, que é de graça:
 *
 *   · ela aceita corpo vazio; esta EXIGE as escolhas, porque não há padrão de gasto;
 *   · ela pode ser chamada à vontade; esta é travada no banco antes da chamada;
 *   · ela é enfileirada por um job automático também; esta só sai de um clique.
 *
 * ── AS TRÊS OPÇÕES SÃO OBRIGATÓRIAS NO CORPO, e isso é deliberado ─────────────────────────────
 *
 * `Expressa`, `PesquisaPlus` e `PesquisaBiometrica` mudam o preço. Um `.default(false)` aqui
 * pareceria conveniência e seria uma escolha de gasto tomada pelo código — e pior, uma escolha
 * silenciosa: quem chamasse sem os campos nunca saberia o que deixou de pedir.
 *
 * Exigi-los força a tela a mandar o que a pessoa marcou, e o que ela marcou fica gravado junto do
 * pedido para o dia em que a fatura vier com uma linha que ninguém lembra.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `manage_fleet_data`, a mesma chave da conferência. Quem confere é quem decide mandar pesquisar —
 * e uma permissão nova só para isto seria mais uma chave para administrar sem nada em troca.
 *
 * ── QUEM APERTOU VIAJA NO PAYLOAD ─────────────────────────────────────────────────────────────
 *
 * `ctx.userId`, da sessão, nunca do corpo. O job roda depois, e é o clique que tem dono: sem isto o
 * registro diria "o worker pediu", que não responde nada quando a cobrança aparecer.
 *
 * ── 202, E ELE QUER DIZER MENOS DO QUE PARECE ─────────────────────────────────────────────────
 *
 * Aceito, não pedido. A cobrança acontece quando o worker chamar, e a trava contra o clique duplo
 * também mora lá — `reivindicarPesquisa`, escrita condicional e atômica. Esta rota pode ser chamada
 * duas vezes sem gastar duas: quem chega em segundo encontra a linha tomada e desiste.
 */
const corpo = z.object({
  vinculo: z.enum(VINCULOS_DA_PESQUISA, {
    errorMap: () => ({ message: "Escolha o vínculo: frota, agregado ou terceiro." }),
  }),
  expressa: z.boolean(),
  pesquisaPlus: z.boolean(),
  biometrica: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "manage_fleet_data");

    const { id } = await params;
    const escolhas = corpo.parse(await request.json());

    const boss = await getBffBoss();
    const payload: MotoristaPesquisarPayload = {
      preRegistrationId: id,
      solicitadoPor: ctx.userId,
      ...escolhas,
    };
    await boss.send(MOTORISTA_JOBS.motoristaPesquisar, payload as object);

    return NextResponse.json({ pedido: true }, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
