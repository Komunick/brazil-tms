import { type PgBoss } from "pg-boss";
import {
  descartarFoto,
  fotosVencidas,
  PRAZO_DA_FOTO_DIAS,
  resolvePortalActorId,
} from "@brazil-tms/db";
// O armazenamento tem entrada própria — é o mesmo caminho que o resto do worker usa.
import { documentsBucket, removeObject } from "@brazil-tms/db/storage";
import { JOB, work } from "../../lib/queue";

/**
 * O DESCARTE DA FOTO DE PERFIL AOS 90 DIAS (fatia 029, FR-024 e FR-024a).
 *
 * A foto de rosto de quem foi desativado tem prazo declarado — 90 dias, decidido em 31/08 — e o
 * descarte **acontece sozinho**. Um prazo que depende de alguém lembrar não é prazo, é intenção.
 *
 * ── VARREDURA DIÁRIA, E NÃO AGENDAMENTO NO ATO ────────────────────────────────────────────────
 *
 * Agendar um job com noventa dias de atraso na hora da desativação seria mais direto, e exigiria
 * CANCELÁ-LO na reativação. Um cancelamento esquecido apaga a foto de alguém que voltou a trabalhar.
 * A varredura filtra por `desativado_em`, zerado na reativação: quem volta some do alvo sozinho, e
 * não há estado para esquecer.
 *
 * Uma vez por dia basta e é o certo: o prazo é de noventa dias. Um job de cinco em cinco minutos
 * gastaria 288 execuções diárias para responder uma pergunta que muda uma vez por trimestre.
 *
 * ── O OBJETO SAI ANTES DA LINHA ───────────────────────────────────────────────────────────────
 *
 * Linha sem objeto vira cartão quebrado na tela; objeto sem linha vira lixo que ninguém encontra.
 * Nesta ordem, o pior caso é uma linha órfã — e a varredura do dia seguinte a encontra e limpa.
 * Na ordem inversa, o pior caso é um rosto guardado para sempre num bucket, sem nada apontando
 * para ele. Um dos dois erros se conserta sozinho.
 */
export async function runLimparFotos(): Promise<{ descartadas: number; falhas: number }> {
  const vencidas = await fotosVencidas(PRAZO_DA_FOTO_DIAS);
  if (vencidas.length === 0) return { descartadas: 0, falhas: 0 };

  const autor = await resolvePortalActorId();
  let descartadas = 0;
  let falhas = 0;

  for (const foto of vencidas) {
    try {
      await removeObject(foto.fileStorageKey, documentsBucket());
      await descartarFoto(foto, autor);
      descartadas += 1;
    } catch (e) {
      /*
        Uma foto que falha não pode parar as outras: são pessoas diferentes, e o prazo de cada uma
        corre sozinho. A falha é contada e sai no log; a próxima varredura tenta de novo, porque o
        alvo é uma consulta e não uma fila consumida.
      */
      falhas += 1;
      console.error(JSON.stringify({ job: JOB.perfilLimparFotos, foto: foto.documentId, erro: String(e) }));
    }
  }

  return { descartadas, falhas };
}

export async function registerPerfilLimparFotos(boss: PgBoss): Promise<void> {
  await work(boss, JOB.perfilLimparFotos, async () => {
    const inicio = Date.now();
    const r = await runLimparFotos();
    console.log(
      JSON.stringify({ job: JOB.perfilLimparFotos, ...r, durationMs: Date.now() - inicio }),
    );
  });

  /**
   * 4h de São Paulo — `0 7 * * *` em UTC, que é o fuso do cron do pg-boss.
   *
   * De madrugada porque ninguém está olhando foto de perfil às quatro da manhã, e porque o descarte
   * não compete com o resto do worker. A hora exata não é crítica: o alvo tem noventa dias de idade,
   * então algumas horas a mais ou a menos não mudam nada.
   */
  const cron = process.env.PERFIL_LIMPAR_FOTOS_CRON ?? "0 7 * * *";
  await boss.schedule(JOB.perfilLimparFotos, cron, {}, {});
}
