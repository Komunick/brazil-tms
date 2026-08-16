import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { customers, db, linkStationIds } from "../src";

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
      const [stationId, code] = line.split(/\s+/);
      return { stationId: stationId!, code: code! };
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
  if (unknownCode.length) {
    console.log(`códigos sem local no TMS (${unknownCode.length}): ${unknownCode.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
