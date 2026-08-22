import { and, eq } from "drizzle-orm";
import type { PortalStop } from "@brazil-tms/shared";
import { db } from "../client";
import { locations } from "../../schema";
import { writeAudit } from "../audit/write-audit";

/**
 * A ESTAÇÃO NOVA NASCE SOZINHA, do catálogo do próprio cliente (2026-08-21).
 *
 * Antes disto, viagem cuja estação o TMS não conhecia era DESCARTADA — não virava viagem, não virava
 * nem linha de importação. O único rastro era uma linha no console do robô, na VM, no meio de
 * dezenas. Foi assim que a `LT0Q8T02EN8G1` chegou aceita no portal e o usuário foi atribuí-la sem
 * encontrá-la: o destino era `XPT-LPE-92`, que ninguém tinha cadastrado.
 *
 * ── POR QUE ISSO NÃO É ADIVINHAÇÃO ─────────────────────────────────────────────────────────────
 *
 * O cliente é a autoridade sobre o nome e o código da estação DELE, e manda os dois em toda viagem:
 * `station` (o id), `station_code` (`XPT-LPE-92`) e `station_name` (`XPT_PE_Palmares_02`). Criar a
 * partir disso é copiar o que ele afirma, não inferir.
 *
 * ── E POR QUE ISSO NÃO VIOLA "SÓ CADASTRAR ROTA NOSSA" ─────────────────────────────────────────
 *
 * A regra do usuário é que rota que a empresa não roda não vira trabalho. Ela continua valendo, e
 * quem a aplica é o ACEITE, não o cadastro:
 *
 *   - a estação nasce SEM REGIÃO e sem nenhuma marca de que é nossa;
 *   - a fila de classificação de região já filtra por "usada em viagem ACEITA", então proposta
 *     recusada nunca gera trabalho;
 *   - no instante em que a viagem é aceita, ela passa a contar como rota da operação — sozinha.
 *
 * O conflito que forçou esta mudança é novo: desde que o aceite passou a ser feito no TMS, a viagem
 * precisa EXISTIR aqui para poder ser aceita. Criar a estação só depois do aceite seria pedir que a
 * pessoa aceitasse no portal justamente nos casos novos — o passo que este trabalho todo eliminou.
 */

export interface EstacaoCriada {
  locationId: string;
  code: string;
  name: string;
  stationId: string;
}

/**
 * Garante que a estação desta parada existe, devolvendo o id do local.
 *
 * Devolve `null` quando não dá para criar com honestidade — sem id do portal ou sem código, que é o
 * caso da planilha. Aí a viagem segue o caminho antigo e é recusada com `unknown_station`, que
 * continua certo: não há o que copiar.
 *
 * IDEMPOTENTE por dois caminhos. O código é único por cliente, então uma corrida entre dois lotes
 * cai no conflito e a linha existente é reaproveitada; e um local que já tenha o código mas ainda
 * não o id do portal é VINCULADO em vez de duplicado — é exatamente o estado de quem foi cadastrado
 * à mão antes de o robô existir.
 */
export async function garantirEstacao(
  customerId: string,
  parada: PortalStop,
  actorUserId: string,
): Promise<EstacaoCriada | null> {
  const stationId = (parada.stationId ?? "").trim();
  const code = (parada.stationCode ?? "").trim();
  const name = (parada.stationName ?? "").trim() || code;
  if (!stationId || !code) return null;

  return db.transaction(async (tx) => {
    // Já existe pelo código? Então é só ensinar o id do portal a ele.
    const existente = await tx
      .select({ id: locations.id, externalStationId: locations.externalStationId })
      .from(locations)
      .where(and(eq(locations.customerId, customerId), eq(locations.code, code)))
      .limit(1);

    if (existente[0]) {
      if (!existente[0].externalStationId) {
        await tx
          .update(locations)
          .set({ externalStationId: stationId, updatedAt: new Date() })
          .where(eq(locations.id, existente[0].id));
      }
      return { locationId: existente[0].id, code, name, stationId };
    }

    const linha = await tx
      .insert(locations)
      .values({ customerId, code, name, externalStationId: stationId, country: "BR" })
      .returning({ id: locations.id });

    /**
     * A auditoria DIZ QUE VEIO DO PORTAL.
     *
     * Local criado por gente e local copiado do cliente são coisas diferentes na hora de conferir um
     * cadastro estranho — e sem essa marca as duas ficam indistinguíveis seis meses depois.
     */
    await writeAudit(tx, {
      actorUserId,
      action: "location.create",
      entityType: "location",
      entityId: linha[0]!.id,
      previousValue: null,
      newValue: { code, name, externalStationId: stationId, origem: "portal" },
      reason: "Estação nova encontrada numa viagem do portal.",
    });

    return { locationId: linha[0]!.id, code, name, stationId };
  });
}
