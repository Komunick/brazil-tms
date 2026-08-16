import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src";

/**
 * Measure each lane's real transit time from what actually happened, and write it onto the lane
 * (2026-08-16).
 *
 * `lanes.expected_transit_minutes` has always been a field somebody types in — a number negotiated
 * or guessed, then left to rot. The execution import now records real departures and arrivals
 * (`departed` / `destination_arrived`, instants from the customer's own portal), so the honest value
 * is the one the trips themselves state: the MEDIAN of the observed durations. Median, not mean, so
 * one truck that broke down for two days does not redefine the lane.
 *
 * Rules that make the number trustworthy rather than merely available:
 *   - a lane needs at least `MIN_SAMPLE` measurements; below that it is reported, not written;
 *   - a duration outside (0, MAX_HOURS] is discarded as a data error, not averaged in;
 *   - a lane whose transit somebody already filled in is NEVER silently overwritten — the measured
 *     value is only reported next to it, and applied only when run with `--overwrite`.
 *
 * Rerun it whenever more history has accumulated:
 *   pnpm --filter @brazil-tms/db db:lanes:transit [--overwrite]
 */

const MIN_SAMPLE = 3;
const MAX_HOURS = 96;

interface LaneMeasurement {
  laneId: string;
  origin: string;
  destination: string;
  samples: number;
  medianMinutes: number;
  currentMinutes: number | null;
}

async function main(): Promise<void> {
  const overwrite = process.argv.includes("--overwrite");

  const rows = (await db.execute(sql`
    with medicoes as (
      select
        t.lane_id,
        extract(epoch from (chegada.event_timestamp - saida.event_timestamp)) / 60 as minutos
      from trips t
      join trip_events saida
        on saida.trip_id = t.id and saida.event_type = 'departed'
      join trip_events chegada
        on chegada.trip_id = t.id and chegada.event_type = 'destination_arrived'
      where t.lane_id is not null
        and saida.event_timestamp is not null
        and chegada.event_timestamp is not null
        and chegada.event_timestamp > saida.event_timestamp
        and chegada.event_timestamp <= saida.event_timestamp + interval '${sql.raw(String(MAX_HOURS))} hours'
    )
    select
      l.id as lane_id,
      origem.code as origem,
      destino.code as destino,
      count(*)::int as amostras,
      round(percentile_cont(0.5) within group (order by m.minutos))::int as mediana,
      l.expected_transit_minutes as atual
    from medicoes m
    join lanes l on l.id = m.lane_id
    join locations origem on origem.id = l.origin_location_id
    join locations destino on destino.id = l.destination_location_id
    where l.archived_at is null
    group by l.id, origem.code, destino.code, l.expected_transit_minutes
    order by count(*) desc
  `)) as unknown as {
    lane_id: string;
    origem: string;
    destino: string;
    amostras: number;
    mediana: number;
    atual: number | null;
  }[];

  const measured: LaneMeasurement[] = rows.map((r) => ({
    laneId: r.lane_id,
    origin: r.origem,
    destination: r.destino,
    samples: Number(r.amostras),
    medianMinutes: Number(r.mediana),
    currentMinutes: r.atual === null ? null : Number(r.atual),
  }));

  const thin = measured.filter((m) => m.samples < MIN_SAMPLE);
  const usable = measured.filter((m) => m.samples >= MIN_SAMPLE);
  const toWrite = usable.filter((m) => m.currentMinutes === null || overwrite);
  const kept = usable.filter((m) => m.currentMinutes !== null && !overwrite);

  for (const m of toWrite) {
    await db.execute(sql`
      update lanes
      set expected_transit_minutes = ${m.medianMinutes}, updated_at = now()
      where id = ${m.laneId}
    `);
  }

  console.log(`Rotas com medição: ${measured.length}`);
  console.log(`  gravadas: ${toWrite.length}`);
  console.log(`  amostra pequena (<${MIN_SAMPLE}), não gravadas: ${thin.length}`);
  console.log(
    `  já preenchidas à mão, preservadas: ${kept.length}${overwrite ? "" : " (use --overwrite para substituir)"}`,
  );

  if (toWrite.length) {
    console.log("\nGravadas (rota · amostras · trânsito medido):");
    for (const m of toWrite.slice(0, 40)) {
      console.log(
        `  ${m.origin} → ${m.destination}  ${m.samples}x  ${formatMinutes(m.medianMinutes)}`,
      );
    }
    if (toWrite.length > 40) console.log(`  … e mais ${toWrite.length - 40}`);
  }

  // The ones a human already answered for: show both numbers so a wrong one is visible, and let the
  // human decide. A silent overwrite of negotiated data would be the worse failure.
  if (kept.length) {
    console.log("\nPreservadas (rota · cadastrado → medido):");
    for (const m of kept) {
      console.log(
        `  ${m.origin} → ${m.destination}  ${formatMinutes(m.currentMinutes!)} → ${formatMinutes(m.medianMinutes)} (${m.samples}x)`,
      );
    }
  }
}

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
