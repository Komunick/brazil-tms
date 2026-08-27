import { NextResponse } from "next/server";
import { lhsDoPainel, type MedidaDoPainel } from "@brazil-tms/db";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

/**
 * AS LH POR TRÁS DE UM NÚMERO DO PAINEL (2026-08-27, a pedido).
 *
 * `view_all_trips`, a mesma da página: quem vê o painel vê as viagens que ele conta. Uma permissão
 * mais estreita aqui faria o número aparecer e a lista não — e o buraco seria lido como defeito.
 *
 * Leitura pura, sob demanda: as LH não viajam no payload do painel porque uma frente movimentada
 * traria centenas de códigos a cada minuto de recarga, para uma lista que quase nunca é aberta.
 */
const MEDIDAS = new Set<MedidaDoPainel>(["pend", "atribuida", "risco", "fora"]);

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "view_all_trips");

    const url = new URL(request.url);
    const medida = url.searchParams.get("medida") ?? "";
    if (!MEDIDAS.has(medida as MedidaDoPainel)) {
      return NextResponse.json({ error: "Medida desconhecida." }, { status: 400 });
    }

    /*
     * `region` AUSENTE e `region` VAZIO são coisas diferentes.
     *
     * Ausente seria "todas as frentes", que este endpoint não oferece — ele existe para abrir UM
     * número de UM card. Vazio é a frente "sem região", que é um grupo real: estação que ainda não
     * tem região cadastrada. Tratar os dois igual traria o país inteiro para dentro daquele card.
     */
    const bruto = url.searchParams.get("region");
    const region = bruto === null || bruto === "" ? null : bruto;

    return NextResponse.json({ lhs: await lhsDoPainel(region, medida as MedidaDoPainel) });
  } catch (error) {
    return handleRouteError(error);
  }
}
