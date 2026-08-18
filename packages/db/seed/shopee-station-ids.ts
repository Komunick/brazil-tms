import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { customers, db, linkStationIds, locations } from "../src";

/**
 * Teach the TMS which of its Shopee locations is which station in the CUSTOMER's own system — the
 * reconciliation the execution import depends on (2026-08-16).
 *
 * Why an id and not the name: the customer's portal names a station "[8300]SoC_RJ_Duque de Caxias",
 * the TMS calls the same site SOC-RJ2, and the names do not survive comparison — matching by name
 * resolved 28 of 43 stations, and worse, it MERGES two real sites whose names differ by an accent
 * ("SoC_BA_Simoes Filho" is SOC-BA2; "LM Hub_BA_Simões Filho" is HUB-LBA-17). The portal's own API
 * publishes both its station id and the operational code next to each other, so the pairing is
 * exact rather than inferred.
 *
 * The pairs live in a plain text file, one "<id> <CODE>" per line, captured from that API:
 *   pnpm --filter @brazil-tms/db db:seed:shopee-stations caminho/estacoes.txt
 *
 * Idempotent: an id already pointing at a site is left alone, and a code the TMS does not have is
 * reported instead of guessed.
 */

const CUSTOMER_CODE = "SHOPEE";

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) throw new Error("Informe o arquivo com os pares '<id> <CÓDIGO>'.");

  const pairs = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "<id> <CÓDIGO> <nome com espaços>" — o nome é opcional e só serve para criar o local novo.
      const [stationId, code, ...rest] = line.split(/\s+/);
      return { stationId: stationId!, code: code!, name: rest.join(" ").trim() || null };
    })
    .filter((p) => p.stationId && p.code);

  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerCode, CUSTOMER_CODE))
    .limit(1);
  const customerId = customer[0]?.id;
  if (!customerId) throw new Error(`Cliente ${CUSTOMER_CODE} não existe.`);

  const { linked, unknownCode } = await linkStationIds(customerId, pairs);
  console.log(`estações vinculadas: ${linked} de ${pairs.length}`);

  // A code the TMS has never seen is not a mapping problem — it is a site nobody registered, because
  // the planning spreadsheet only ever named the routes already being run. The customer's own
  // catalogue is the authority for both the code and the name, so the site is created from it and
  // the import stops being blocked on data entry that has no other source.
  const missing = pairs.filter((p) => unknownCode.includes(p.code));
  let created = 0;
  for (const { stationId, code, name } of missing) {
    if (!name) continue;
    await db.insert(locations).values({
      customerId,
      code,
      name,
      externalStationId: stationId,
      state: ufFromCode(code),
    });
    created++;
  }
  if (created > 0) console.log(`locais criados a partir do catálogo do cliente: ${created}`);

  const stillMissing = missing.filter((p) => !p.name).map((p) => p.code);
  if (stillMissing.length) {
    console.log(
      `códigos sem local e sem nome no arquivo (${stillMissing.length}): ${stillMissing.join(", ")}`,
    );
  }
}

/**
 * UF from the operational code — `HUB-LSP-64` → SP, `XPT-LMG-96` → MG. The customer's codes carry
 * the state in their middle segment, optionally prefixed with the network letter (`LSP` = L + SP).
 * Returns null when the segment is not a state, rather than guessing.
 */
const UF = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "),
);
function ufFromCode(code: string): string | null {
  for (const part of code.toUpperCase().split(/[-_]/)) {
    if (UF.has(part)) return part;
    if (part.length === 3 && UF.has(part.slice(1))) return part.slice(1);
  }
  return null;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
