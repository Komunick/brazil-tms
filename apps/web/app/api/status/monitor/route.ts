import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { queryServerStatus } from "@brazil-tms/db";
import { handleRouteError } from "@/lib/api/respond";
import { Unauthorized } from "@/lib/auth/require-auth";
import { saudeDaFonte, saudeDaTarefa, saudeDoCiclo } from "@/lib/status/saude";

export const dynamic = "force-dynamic";

/**
 * Token no CABEÇALHO, e não no corpo como nas rotas de ingestão.
 *
 * As rotas dos robôs põem o token no corpo porque quem chama roda na origem do
 * fornecedor e um `Authorization` obrigaria a um preflight de CORS. Aqui quem
 * chama é o Uptime Kuma, servidor para servidor, sem navegador no meio — então
 * o cabeçalho é o lugar natural, e mantém o token fora dos logs de acesso, que
 * registram a URL mas não os cabeçalhos.
 *
 * Token PRÓPRIO, separado do `PORTAL_FEED_TOKEN`: este só lê. Reusar o token de
 * ingestão daria ao monitoramento a credencial que ESCREVE viagens — e um token
 * que vive no `.env` de outra VM é um token a mais para vazar.
 */
function conferirToken(request: Request): void {
  const esperado = process.env.MONITOR_TOKEN ?? "";
  const recebido = request.headers.get("x-monitor-token") ?? "";

  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  if (!esperado || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Unauthorized("Token de monitoramento inválido.");
  }
}

/**
 * GET /api/status/monitor — o mesmo pulso de `/api/status`, já julgado.
 *
 * Somente leitura. Nada aqui expõe segredo: são vereditos, contagens e o
 * relógio do servidor.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    conferirToken(request);

    const status = await queryServerStatus();
    // O `agora` VEM DO SERVIDOR, junto com os carimbos. Calcular idade contra o
    // relógio de outra máquina é como a hora errada da TV da sala vira alarme
    // falso — e aqui a outra máquina seria a VM de monitoramento.
    const agora = new Date(status.agora);

    const fontes: Record<string, string> = {};
    let fontesAtrasadas = 0;
    for (const fonte of status.fontes) {
      const { saude } = saudeDaFonte(fonte.chave, fonte.ultimo, agora);
      fontes[fonte.chave] = saude;
      // "sem_regua" (spot) nunca conta como atraso: oferta é evento, não relógio.
      if (saude === "atrasado") fontesAtrasadas += 1;
    }

    let tarefasAtrasadas = 0;
    let falhas24h = 0;
    for (const tarefa of status.tarefas) {
      if (saudeDaTarefa(tarefa.ultimo, agora).saude === "atrasado") tarefasAtrasadas += 1;
      falhas24h += tarefa.falhas;
    }

    const ciclos: Record<string, string> = {};
    let ciclosLentos = 0;
    for (const ciclo of status.ciclos) {
      const { saude } = saudeDoCiclo(ciclo.intervalMs, ciclo.durationMs);
      ciclos[ciclo.robot] = saude;
      if (saude === "lento") ciclosLentos += 1;
    }

    return NextResponse.json({
      ok: fontesAtrasadas === 0 && tarefasAtrasadas === 0 && ciclosLentos === 0,
      fontes,
      fontesAtrasadas,
      tarefas: { atrasadas: tarefasAtrasadas, falhas24h },
      ciclos,
      ciclosLentos,
      atribuicoesPendentes: status.atribuicoesPendentes,
      agora: status.agora,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
