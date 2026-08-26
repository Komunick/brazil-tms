import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { drivers, locations, portalCommands, trailers, trips, vehicles } from "../../schema";

/**
 * JUNTAR O QUE A PRÉ-SM PRECISA, a partir de uma ordem do portal já concluída (2026-08-25, 026).
 *
 * A decisão de criar ou não é pura e mora em `packages/shared` — testável sem banco. Este arquivo é
 * a outra metade: a leitura que a alimenta.
 *
 * ── OS DADOS VÊM DA ORDEM, NÃO DA VIAGEM ──────────────────────────────────────────────────────
 *
 * Motorista e placas saem de `portal_commands`, que é o que foi EFETIVAMENTE pedido ao portal e
 * confirmado por ele. A viagem tem `customer_fields` com o que o robô leu por último, e os dois
 * podem divergir por alguns minutos — o robô varre a cada 20 segundos, mas a leitura seguinte pode
 * não ter chegado.
 *
 * Criar a Pré-SM com o motorista antigo, porque a leitura ainda não atualizou, seria escolta
 * contratada para quem não vai dirigir. A ordem é a fonte certa: ela é a decisão, e ela voltou
 * confirmada.
 */

export interface DadosDaPreSm {
  tripId: string;
  origem: string | null;
  destino: string | null;
  cpfMotorista: string | null;
  vinculoMotorista: string | null;
  cpfSegundoMotorista: string | null;
  vinculoSegundoMotorista: string | null;
  placas: { placa: string; vinculo: string | null }[];
  chegadaNaColeta: string | null;
  saidaDaColeta: string | null;
}

export async function dadosDaPreSm(portalCommandId: string): Promise<DadosDaPreSm | null> {
  const [ordem] = await db
    .select({
      tripId: portalCommands.tripId,
      driverId: portalCommands.driverId,
      secondDriverId: portalCommands.secondDriverId,
      plates: portalCommands.plates,
    })
    .from(portalCommands)
    .where(and(eq(portalCommands.id, portalCommandId), eq(portalCommands.action, "assign")))
    .limit(1);

  if (!ordem) return null;

  const [viagem] = await db
    .select({
      origem: locations.name,
      destino: sql<string>`destino.name`,
      chegada: trips.plannedPickupWindowStart,
      saida: trips.plannedPickupWindowEnd,
    })
    .from(trips)
    .innerJoin(locations, eq(locations.id, trips.originLocationId))
    .innerJoin(sql`locations as destino`, sql`destino.id = ${trips.destinationLocationId}`)
    .where(eq(trips.id, ordem.tripId))
    .limit(1);

  if (!viagem) return null;

  const [m1, m2] = await Promise.all([
    motoristaPeloPortal(ordem.driverId),
    motoristaPeloPortal(ordem.secondDriverId),
  ]);

  // O portal grava as placas numa string só, separadas por vírgula: `"PXW0I78,EMU0J25"`.
  const placas = (ordem.plates ?? "")
    .split(/[,;]/)
    .map((p) => p.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);

  return {
    tripId: ordem.tripId,
    origem: viagem.origem,
    destino: viagem.destino,
    cpfMotorista: m1?.cpf ?? null,
    vinculoMotorista: m1?.vinculo ?? null,
    cpfSegundoMotorista: m2?.cpf ?? null,
    vinculoSegundoMotorista: m2?.vinculo ?? null,
    placas: await vinculosDasPlacas(placas),
    chegadaNaColeta: viagem.chegada?.toISOString() ?? null,
    saidaDaColeta: viagem.saida?.toISOString() ?? null,
  };
}

/** O nosso cadastro, casado pelo id do portal — que é a única chave que os dois lados compartilham. */
async function motoristaPeloPortal(
  portalDriverId: number | null,
): Promise<{ cpf: string | null; vinculo: string } | null> {
  if (portalDriverId == null) return null;
  const [d] = await db
    .select({ cpf: drivers.cpf, vinculo: drivers.ownershipType })
    .from(drivers)
    .where(eq(drivers.portalDriverId, String(portalDriverId)))
    .limit(1);
  return d ?? null;
}

/**
 * A placa pode ser cavalo ou carreta, e o TMS as guarda em tabelas diferentes.
 *
 * A ORDEM É PRESERVADA: a primeira placa da ordem é o cavalo, e é ela que vai em `PlacaVeiculo`.
 * Ordenar pelo que o banco devolver trocaria cavalo por carreta na Pré-SM.
 *
 * Placa que não existe em nenhuma das duas entra com vínculo `null` — o que faz a decisão recusar
 * com `sem_vinculo_veiculo`, que é o certo: o portal aceita placa que o nosso cadastro não conhece,
 * e mandar um vínculo inventado é pior que não criar.
 */
export async function vinculosDasPlacas(placas: string[]): Promise<{ placa: string; vinculo: string | null }[]> {
  if (placas.length === 0) return [];

  const [vs, cs] = await Promise.all([
    db
      .select({ plate: vehicles.plate, tipo: vehicles.ownershipType })
      .from(vehicles)
      .where(inArray(vehicles.plate, placas)),
    db
      .select({ plate: trailers.plate, tipo: trailers.ownershipType })
      .from(trailers)
      .where(inArray(trailers.plate, placas)),
  ]);

  const mapa = new Map<string, string>();
  for (const l of [...vs, ...cs]) mapa.set(l.plate, l.tipo);

  return placas.map((placa) => ({ placa, vinculo: mapa.get(placa) ?? null }));
}

/**
 * Esta ordem é uma atribuição CONCLUÍDA? — a pergunta do enfileiramento.
 *
 * Mora no pacote de dados e não na rota porque é uma pergunta sobre o registro, e porque a rota que
 * encerra ordens não deveria precisar saber que aceitar e recusar não pedem escolta.
 */
export async function ordemDeAtribuicaoConcluida(
  portalCommandId: string,
): Promise<{ tripId: string } | null> {
  const [o] = await db
    .select({ tripId: portalCommands.tripId })
    .from(portalCommands)
    .where(
      and(
        eq(portalCommands.id, portalCommandId),
        eq(portalCommands.action, "assign"),
        eq(portalCommands.status, "done"),
      ),
    )
    .limit(1);
  return o ?? null;
}
