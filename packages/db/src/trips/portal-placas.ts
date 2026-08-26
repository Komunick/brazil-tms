import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * AS PLACAS QUE O PORTAL JÁ USOU — a lista do diálogo de atribuição (2026-08-26, a pedido).
 *
 * O formulário pedia a placa em campo de texto livre, ao lado de um motorista que vinha de lista.
 * A assimetria custava caro: quem digita erra, e uma placa errada no portal é uma ordem errada que
 * já saiu.
 *
 * ── A FONTE É O QUE O PORTAL ESCALOU, e não o nosso cadastro ──────────────────────────────────
 *
 * Exatamente como `listarMotoristasDoPortal`, e pela mesma razão. Nosso cadastro tem 923 veículos e
 * 791 carretas, mas o campo que vai ser preenchido é o DELES: uma placa que existe aqui e não lá
 * seria oferecida e recusada na hora de gravar. O que o portal já usou, ele aceita.
 *
 * Medido em 26/08: 936 placas distintas em 6.423 usos, todas nos últimos 90 dias — a mesma ordem
 * de grandeza dos 540 motoristas que a lista de motoristas já carrega sem esforço.
 *
 * ── AS PLACAS VÊM NUMA STRING SÓ, SEPARADAS POR VÍRGULA ───────────────────────────────────────
 *
 * Uma carreta chega como `"PXW0I78,EMU0J25"` — cavalo e reboque no mesmo campo. O `unnest` sobre o
 * `string_to_array` desdobra isso em uma linha por placa; sem ele, a lista ofereceria o par grudado
 * como se fosse uma placa só, e ninguém acharia nenhuma das duas.
 *
 * ── ORDENADAS POR USO, e não alfabeticamente ──────────────────────────────────────────────────
 *
 * Quem procura uma placa está pensando num caminhão que roda; a que rodou trinta vezes no mês tem
 * muito mais chance de ser a certa do que a que apareceu uma vez em maio. A busca por texto resolve
 * o resto.
 */

export interface PlacaDoPortal {
  placa: string;
  /** Quantas viagens já saíram com ela — é o que decide a ordem da lista. */
  viagens: number;
  /** A última vez que o portal a usou, em ISO. */
  vistoEm: string;
}

export async function listarPlacasDoPortal(limite = 1500): Promise<PlacaDoPortal[]> {
  const linhas = await db.execute<{ placa: string; viagens: string; visto: Date }>(sql`
    with placas as (
      select
        -- Normalizada aqui e não na tela: a mesma placa aparece como "ABC1D23" e "abc-1d23" em
        -- viagens diferentes, e sem isto a lista teria a mesma placa duas vezes.
        upper(regexp_replace(btrim(p), '[^A-Za-z0-9]', '', 'g')) as placa,
        t.updated_at
      from trips t,
           lateral unnest(string_to_array(t.customer_fields ->> 'Placa (portal)', ',')) p
      where coalesce(t.customer_fields ->> 'Placa (portal)', '') <> ''
    )
    select placa, count(*)::text as viagens, max(updated_at) as visto
      from placas
     where placa <> ''
     group by placa
     order by count(*) desc, max(updated_at) desc
     limit ${limite}
  `);

  return linhas.map((r) => ({
    placa: r.placa,
    viagens: Number(r.viagens ?? 0),
    vistoEm: new Date(r.visto).toISOString(),
  }));
}
