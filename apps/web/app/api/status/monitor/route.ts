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
    let ciclosParados = 0;
    const parados: string[] = [];

    for (const ciclo of status.ciclos) {
      const { saude } = saudeDoCiclo(ciclo.intervalMs, ciclo.durationMs);
      ciclos[ciclo.robot] = saude;
      if (saude === "lento") ciclosLentos += 1;

      /**
       * CICLO QUE PAROU DE APARECER (2026-09-05).
       *
       * `saudeDoCiclo` compara duração com intervalo: ela pega o ciclo LENTO, não o
       * ciclo que sumiu. Um laço que morre para de gravar pulso, e o registro dele
       * fica congelado no banco com a última razão saudável — verde para sempre.
       *
       * É exatamente o furo que o comentário do laço de spot descreve: em 29/08
       * foram oito horas sem oferta sem dar para dizer se o mercado estava parado
       * ou se o ciclo estava quebrado. O pulso resolveu do lado de quem grava;
       * isto resolve do lado de quem olha.
       *
       * O fator de 5× é generoso de propósito. O laço de spot roda a cada 5 s: no
       * limite justo, uma oscilação de rede de meio minuto já acusaria. E o piso de
       * 5 minutos existe pelo mesmo motivo — sem ele, um ciclo de 5 s daria alarme
       * a cada 25 segundos de silêncio.
       */
      // Ciclo que nunca declarou ritmo nao pode ser julgado por ritmo.
      //
      // `portal_history` e assim: ele e gravado UMA VEZ por carga de pagina — o
      // primeiro ciclo da execucao usa o modo `history`, e do segundo em diante
      // usa `execution`. O registro fica com `interval_ms` nulo e a idade so
      // cresce, o que faria este teste acusa-lo para sempre.
      //
      // `saudeDoCiclo` ja trata o mesmo caso como "sem_dado"; aqui vale a mesma
      // regra, e pelo mesmo motivo.
      if (!ciclo.intervalMs || ciclo.intervalMs <= 0) continue;

      const idadeMs = agora.getTime() - new Date(ciclo.receivedAt).getTime();
      const limiteMs = Math.max(5 * 60_000, ciclo.intervalMs * 5);
      if (idadeMs > limiteMs) {
        ciclosParados += 1;
        parados.push(ciclo.robot);
        ciclos[ciclo.robot] = "parado";
      }
    }

    return NextResponse.json({
      ok: fontesAtrasadas === 0 && tarefasAtrasadas === 0 && ciclosLentos === 0,
      fontes,
      fontesAtrasadas,
      tarefas: { atrasadas: tarefasAtrasadas, falhas24h },
      ciclos,
      ciclosLentos,
      ciclosParados,
      parados,
      atribuicoesPendentes: status.atribuicoesPendentes,
      agora: status.agora,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
