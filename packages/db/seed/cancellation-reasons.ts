import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { cancellationOptions, db } from "../src";

/**
 * OS MOTIVOS DE CANCELAMENTO — que NUNCA chegaram à produção (descoberto em 31/08).
 *
 * ── COMO ISSO PASSOU DESPERCEBIDO ─────────────────────────────────────────────────────────────
 *
 * Medido em produção: a tabela `cancellation_options` tinha as três opções de `billing_impact` e
 * **zero** de `reason`. E `cancelTrip` recusa logo no começo quando a lista de motivos está vazia:
 *
 *     if (reasonCodes.size === 0 || billingCodes.size === 0)
 *       throw new Conflict("CANCELLATION_NOT_CONFIGURED", …)
 *
 * Ou seja: **o botão de cancelar viagem do TMS nunca funcionou**, para ninguém. E ninguém reclamou,
 * porque as 822 viagens canceladas vieram do PORTAL — o robô lê "Cancelada" e o TMS acompanha. O
 * caminho que falhava era o de cancelar por aqui, e ele quase nunca é usado.
 *
 * A origem: os motivos foram acrescentados ao `trip-domain-sample.ts` depois de ele já ter rodado em
 * produção, e ele é idempotente por código — quem rodou de novo pulou o que já existia e nunca
 * chegou a inserir o que faltava... porque ninguém rodou de novo. E rodá-lo hoje criaria uma viagem
 * `DEMO-TRIP-001` em produção.
 *
 * Daí esta semente separada: só os motivos, sem amostra nenhuma.
 *
 *     pnpm --filter @brazil-tms/db db:seed:cancellation-reasons
 *
 * Idempotente: pula o que já existe.
 */
const MOTIVOS = [
  /*
    "Cancelado pelo cliente" é o primeiro por ser o mais comum — e é ele que descreve a viagem que o
    cliente RETIRA do portal depois de a gente ter aceitado. Foi esse o caso que trouxe esta semente
    à existência (LT0Q8V02F17J1 e LT0Q9502F19L1, aceitas em 28/08 e sumidas do portal uma hora
    depois).
  */
  { code: "cancelled_by_customer", labelPt: "Cancelado pelo cliente", sortOrder: 1 },
  { code: "no_vehicle_available", labelPt: "Sem veículo disponível", sortOrder: 2 },
  { code: "no_driver_available", labelPt: "Sem motorista disponível", sortOrder: 3 },
  { code: "weather_road", labelPt: "Clima/estrada", sortOrder: 4 },
  { code: "documentation_issue", labelPt: "Problema de documentação", sortOrder: 5 },
  { code: "other", labelPt: "Outro", sortOrder: 6 },
] as const;

async function main(): Promise<void> {
  let inseridos = 0;
  for (const m of MOTIVOS) {
    const existe = await db
      .select({ id: cancellationOptions.id })
      .from(cancellationOptions)
      .where(and(eq(cancellationOptions.kind, "reason"), eq(cancellationOptions.code, m.code)))
      .limit(1);
    if (existe[0]) continue;
    await db.insert(cancellationOptions).values({
      kind: "reason",
      code: m.code,
      labelPt: m.labelPt,
      sortOrder: m.sortOrder,
    });
    inseridos += 1;
  }

  const total = await db
    .select({ kind: cancellationOptions.kind, code: cancellationOptions.code })
    .from(cancellationOptions)
    .where(eq(cancellationOptions.active, true));
  const motivos = total.filter((o) => o.kind === "reason").length;
  const impactos = total.filter((o) => o.kind === "billing_impact").length;

  console.log(`${inseridos} motivo(s) inserido(s).`);
  console.log(`Agora: ${motivos} motivo(s) e ${impactos} impacto(s) de faturamento ativos.`);
  if (motivos === 0 || impactos === 0) {
    console.log("ATENÇÃO: com um dos dois em zero, cancelar viagem continua recusando.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
