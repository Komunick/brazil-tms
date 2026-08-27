import { type PgBoss } from "pg-boss";
import { fecharAtrasados } from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";

/**
 * A TRAVA DE SEGURANÇA DA PASSAGEM DE TURNO (2026-08-26, a pedido).
 *
 * ── O QUE ELA EVITA ───────────────────────────────────────────────────────────────────────────
 *
 * Fechar o turno é um BOTÃO — foi decidido assim porque o botão registra QUEM entregou, e é isso
 * que a planilha tenta fazer com os campos de assistente e supervisor.
 *
 * Mas botão depende de alguém lembrar, e às 7h da manhã, depois de doze horas de plantão, ninguém
 * lembra. Um bloco esquecido em aberto aceita edição dias depois — e aí a linha do tempo deixa de
 * ser um registro do que se sabia NAQUELE turno e vira um documento editável, o que é a única coisa
 * que um diário de passagem não pode ser.
 *
 * ── POR QUE UM DIA DE CARÊNCIA, E NÃO A HORA EXATA DA VIRADA ──────────────────────────────────
 *
 * Porque o objetivo é impedir edição retroativa, não cravar o segundo em que o turno acabou. Quem
 * sai às 7h e lembra de anotar uma coisa às 7h20 está fazendo o certo, e travar na hora cheia
 * transformaria isso em informação perdida.
 *
 * Um dia é folgado o bastante para nunca atrapalhar quem está trabalhando, e apertado o bastante
 * para que ninguém "conserte" um turno na semana seguinte.
 *
 * ── E POR QUE ELA DEIXA CLARO QUE FOI ELA ─────────────────────────────────────────────────────
 *
 * `fechado_por_user_id` fica nulo e `fechado_automaticamente` fica verdadeiro. A tela mostra os dois
 * casos de forma diferente, e isso importa: um bloco travado por esquecimento NÃO teve passagem de
 * turno, e quem lê precisa saber disso antes de confiar no que está escrito.
 */

/**
 * Quantos dias um bloco pode ficar aberto depois do seu dia.
 *
 * Configurável por ambiente para o caso de a operação pedir mais folga — mas o padrão é 1, e mexer
 * nisso deveria ser conversa, não ajuste silencioso.
 */
function carencia(): number {
  const bruto = Number(process.env.TURNO_CARENCIA_DIAS ?? "1");
  // Um valor inválido não pode virar zero: zero fecharia o bloco de HOJE, no meio do expediente.
  return Number.isFinite(bruto) && bruto >= 1 ? Math.trunc(bruto) : 1;
}

export interface ResultadoDaTrava {
  fechados: number;
  carenciaDias: number;
}

export async function runFecharAtrasados(): Promise<ResultadoDaTrava> {
  const dias = carencia();
  return { fechados: await fecharAtrasados(dias), carenciaDias: dias };
}

export async function registerTurnoFecharAtrasados(boss: PgBoss): Promise<void> {
  await work(boss, JOB.turnoFecharAtrasados, async () => {
    const inicio = Date.now();
    const r = await runFecharAtrasados();
    console.log(
      JSON.stringify({ job: JOB.turnoFecharAtrasados, ...r, durationMs: Date.now() - inicio }),
    );
  });
  /**
   * Uma vez por dia, às 8h — depois de o turno noturno ter acabado às 7h e antes de o diurno estar
   * a pleno.
   *
   * A hora do cron é UTC no pg-boss, então `0 11 * * *` é 8h em São Paulo. O bloco alvo é sempre de
   * pelo menos um dia atrás, então a hora exata não é crítica — mas rodar de madrugada seria pior:
   * é justamente quando o turno noturno está escrevendo.
   */
  const cron = process.env.TURNO_TRAVA_CRON ?? "0 11 * * *";
  await boss.schedule(JOB.turnoFecharAtrasados, cron, {}, {});
}
