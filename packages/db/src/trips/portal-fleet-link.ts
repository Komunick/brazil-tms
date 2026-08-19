import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AssignTripInput, PortalTrip, TripStatus, VehicleType } from "@brazil-tms/shared";
import { db } from "../client";
import { drivers, trailers, tripAssignments, trips, vehicles } from "../../schema";
import { assignTrip, mirrorAssignmentFromPortal } from "./trip-assignments";
import { Conflict } from "../errors";

/**
 * Viagem já em curso OU já encerrada: o registro é retroativo, sem mexer no status (ver
 * `mirrorAssignmentFromPortal`, que guarda a mesma lista e explica por que ela chega até `billed`).
 */
const MIRROR_STATUSES = new Set<TripStatus>([
  "assigned",
  "confirmed",
  "at_origin",
  "loading",
  "loaded",
  "in_transit",
  "at_destination",
  "unloading",
  "unloaded",
  "completed",
  "billing_pending",
  "billing_ready",
  "billed",
]);

/**
 * Turning the customer's words into a real assignment (2026-08-16).
 *
 * The portal states a driver's NAME and the plates; the TMS keeps registered drivers and vehicles
 * with rules attached. The two are not redundant and one cannot replace the other: text proves
 * nothing, while a link makes the TMS able to catch an expired licence, a vehicle of the wrong type,
 * or the same driver on two trips at once — and it is what silences the "no assignment" alert.
 *
 * So the customer's text is matched to the registry, and ONLY an exact match is written. Measured on
 * the live data before building this: 38 of 41 plates and 38 of 41 driver names already match, so
 * the automation carries almost everything and the handful left over are visible on the trip's own
 * screen (the portal card sits right above the empty form).
 *
 * Two deliberate refusals:
 *   - It never overrides a warning silently. `assignTrip` blocks on an expired licence or a vehicle
 *     type mismatch, and that refusal is the POINT: the customer put someone on the road the TMS
 *     would have stopped, and a robot must not wave that through.
 *   - It never invents a resource. A driver the fleet does not have is reported, not created.
 *
 * Uma terceira recusa caiu (2026-08-16): "só atribui viagem em `received`". A viagem só aparece no
 * portal depois de aceita, então boa parte delas chega aqui já andando, e a regra deixava o motorista
 * visível no card e o painel de Atribuições vazio para sempre. Agora a viagem em curso é registrada
 * onde está, sem mexer no status — ver `mirrorAssignmentFromPortal`.
 */

export type FleetLinkOutcome =
  | "linked"
  /** Vinculado apesar de avisos — o motivo fica gravado na própria atribuição. */
  | "linked_with_warnings"
  | "already_assigned"
  | "not_assignable"
  /** O portal ainda não disse quem vai — não é problema, é uma viagem sem motorista designado. */
  | "not_stated"
  | "no_match"
  | "blocked";

export interface FleetLinkResult {
  outcome: FleetLinkOutcome;
  /** What was missing or what blocked it — shown in the import history, never swallowed. */
  detail?: string;
}

/** Plates compare as letters and digits only: "DPF-9J13" and "dpf9j13" are the same truck. */
const foldPlate = (value: string): string => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/**
 * Nomes comparam SEM acento e sem espaço sobrando (2026-08-16).
 *
 * Dois sistemas, duas pessoas digitando o mesmo motorista, e o acento nunca sobrevive aos dois:
 * o portal diz "JOSE EDSON DA SILVA", a frota diz "JOSÉ EDSON DA SILVA", e o vínculo os tratava
 * como pessoas diferentes. Medido na base: 3 dos 15 "motoristas sem cadastro" estavam cadastrados
 * o tempo todo — e a operação ia atrás de recadastrar gente que já existia.
 *
 * Isto NÃO afrouxa o casamento: continua exigindo o nome inteiro, igual palavra por palavra. Só
 * para de tratar Ô e O como letras diferentes, do mesmo jeito que a placa já ignora o hífen.
 */
const ACENTOS = "ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ";
const SEM_ACENTO = "AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN";

export function foldName(value: string): string {
  const semAcento = [...value]
    .map((c) => {
      const i = ACENTOS.indexOf(c);
      return i === -1 ? c : SEM_ACENTO[i]!;
    })
    .join("");
  return semAcento.replace(/\s+/g, " ").trim().toUpperCase();
}

/** O mesmo dobramento, feito pelo Postgres, para a comparação acontecer dentro da consulta. */
const foldNameSql = (col: SQL | ReturnType<typeof sql.raw>): SQL =>
  sql`upper(btrim(regexp_replace(translate(${col}, ${ACENTOS}, ${SEM_ACENTO}), '\\s+', ' ', 'g')))`;

/** The two plates the portal packs into one field: tractor first, trailer second. */
function platesOf(label: string | null): { vehicle: string | null; trailer: string | null } {
  if (!label) return { vehicle: null, trailer: null };
  const parts = label
    .split(/[,;/]/)
    .map((p) => foldPlate(p))
    .filter(Boolean);
  return { vehicle: parts[0] ?? null, trailer: parts[1] ?? null };
}

export async function linkFleetFromPortal(
  tripId: string,
  portal: PortalTrip,
  actorUserId: string,
): Promise<FleetLinkResult> {
  const { vehicle: vehiclePlate, trailer: trailerPlate } = platesOf(portal.plateLabel);
  const driverName = portal.driverLabel?.trim() ?? "";
  // A maioria das viagens ainda não tem motorista designado no portal. Isso não é uma falha de
  // casamento — contar como tal enterraria os casos que realmente precisam de cadastro.
  if (!vehiclePlate || !driverName) return { outcome: "not_stated" };

  const trip = (
    await db
      .select({
        currentStatus: trips.currentStatus,
        // O tipo que o CLIENTE declarou para esta viagem (`vehicle_type_name` no payload do portal,
        // já convertido pelo `portal-plan-apply`). É o que permite cadastrar o caminhão sozinho mais
        // abaixo, sem chutar nada.
        plannedVehicleType: trips.plannedVehicleType,
      })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1)
  )[0];
  if (!trip) return { outcome: "not_assignable", detail: "viagem não encontrada" };

  /**
   * Em qual dos dois caminhos esta viagem entra (2026-08-16).
   *
   * `received` é o caso normal: atribui e move para "Atribuída". Qualquer status em curso é a viagem
   * que chegou aqui já andando — o portal só a mostra depois de aceita — e aí o registro é retroativo,
   * sem tocar no status. Encerrada não recebe nada.
   *
   * Isto era uma recusa seca em tudo que não fosse `received`, e o efeito era o motorista aparecer no
   * card do portal enquanto o painel de Atribuições ficava vazio para sempre.
   */
  const emCurso = trip.currentStatus !== "received";
  if (emCurso && !MIRROR_STATUSES.has(trip.currentStatus as TripStatus)) {
    return { outcome: "not_assignable", detail: trip.currentStatus };
  }

  /**
   * A atribuição que já existe — para ser COMPARADA mais abaixo, não para encerrar o assunto aqui
   * (2026-08-19).
   *
   * Isto era um `return "already_assigned"` seco: atribuiu uma vez, ficava para sempre. E o cliente
   * TROCA. Medido em produção: 15 viagens com motorista e placa diferentes do que o portal dizia,
   * porque a troca aconteceu depois do primeiro espelho.
   *
   * O dano não era só o dado velho. Duas dessas viagens seguravam a placa antiga e, pela regra de
   * conflito de agenda, BLOQUEAVAM a viagem que de fato tinha aquele caminhão — a placa velha
   * impedindo a viagem certa. `LT0Q8J02E2LN1` guardava a `ATM8A55` enquanto o portal já dizia
   * `MKK6B69`, e com isso a `LT0Q8J02E2LW1`, dona real da `ATM8A55`, ficava sem ninguém.
   *
   * A decisão (do usuário, 2026-08-19): o PORTAL manda. É nele que o cliente escala o motorista,
   * então quando os dois discordam quem está errado é o TMS.
   */
  const atual = (
    await db
      .select({
        id: tripAssignments.id,
        driverId: tripAssignments.driverId,
        vehicleId: tripAssignments.vehicleId,
      })
      .from(tripAssignments)
      .where(and(eq(tripAssignments.tripId, tripId), eq(tripAssignments.isCurrent, true)))
      .limit(1)
  )[0];

  const acharVeiculo = async () =>
    (
      await db
        .select({
          id: vehicles.id,
          ownershipType: vehicles.ownershipType,
          carrierId: vehicles.carrierId,
        })
        .from(vehicles)
        .where(
          and(
            sql`upper(regexp_replace(${vehicles.plate}, '[^A-Za-z0-9]', '', 'g')) = ${vehiclePlate}`,
            eq(vehicles.status, "active"),
            isNull(vehicles.archivedAt),
          ),
        )
        .limit(1)
    )[0];

  let vehicle = await acharVeiculo();

  const driver = (
    await db
      .select({
        id: drivers.id,
        ownershipType: drivers.ownershipType,
        carrierId: drivers.carrierId,
      })
      .from(drivers)
      .where(
        and(
          sql`${foldNameSql(sql`${drivers.name}`)} = ${foldName(driverName)}`,
          eq(drivers.status, "active"),
          isNull(drivers.archivedAt),
        ),
      )
      .limit(1)
  )[0];

  /**
   * O CAMINHÃO QUE FALTA É CADASTRADO NA HORA (2026-08-19, a pedido).
   *
   * O motorista chega ao TMS por uma exportação que alguém precisa lembrar de fazer; a placa chega
   * junto da VIAGEM, de graça, a cada ciclo. O efeito da assimetria era medível: das 8 viagens que
   * ainda ficavam sem motorista no TMS enquanto o portal mostrava um, 6 eram só isso — placa que o
   * cadastro não tinha. A operação via "NA ORIGEM, sem ninguém" e o portal via um motorista escalado.
   *
   * NADA AQUI É CHUTE. O tipo sai de `planned_vehicle_type`, que é o `vehicle_type_name` que o
   * próprio cliente manda na viagem, já convertido pelo mapeador de `portal-plan-apply`. Sem esse
   * tipo o veículo NÃO é criado — a coluna é obrigatória e a compatibilidade de veículo decide
   * atribuição, então inventar um tipo poria o caminhão errado no despacho.
   *
   * A transportadora vem do MOTORISTA, pela mesma razão já documentada mais abaixo: é com a pessoa
   * que o contrato existe, e o veículo segue quem dirige.
   *
   * O cadastro nasce mínimo e honesto — placa, tipo, dono — com a origem escrita na observação. Quem
   * for completar documento e rastreador encontra o registro já existindo, em vez de ter que criá-lo
   * antes de a viagem poder andar.
   */
  if (!vehicle && driver && trip.plannedVehicleType) {
    const subcontratadoDoMotorista = driver.ownershipType === "subcontracted";
    try {
      await db.insert(vehicles).values({
        plate: vehiclePlate,
        vehicleType: trip.plannedVehicleType as VehicleType,
        ownershipType: driver.ownershipType,
        carrierId: subcontratadoDoMotorista ? (driver.carrierId ?? undefined) : undefined,
        status: "active",
        notes: `Cadastrado automaticamente do portal do cliente em ${new Date().toISOString().slice(0, 10)}: placa vinda da viagem, tipo declarado pelo cliente.`,
      });
    } catch {
      // Corrida com outro ciclo, ou placa que já existe arquivada/inativa. Não é motivo para perder o
      // vínculo: a busca abaixo decide, e um `no_match` continua sendo uma saída honesta.
    }
    vehicle = await acharVeiculo();
  }

  if (!vehicle || !driver) {
    const faltando = [
      !driver ? `motorista "${driverName}"` : null,
      !vehicle ? `placa ${vehiclePlate}` : null,
    ]
      .filter(Boolean)
      .join(" e ");
    return { outcome: "no_match", detail: `sem cadastro: ${faltando}` };
  }

  // The trailer is optional: a missing one is not a reason to leave the trip unassigned.
  const trailer = trailerPlate
    ? (
        await db
          .select({ id: trailers.id })
          .from(trailers)
          .where(
            and(
              sql`upper(regexp_replace(${trailers.plate}, '[^A-Za-z0-9]', '', 'g')) = ${trailerPlate}`,
              eq(trailers.status, "active"),
              isNull(trailers.archivedAt),
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  /**
   * A transportadora, quando os recursos são subcontratados — que é a regra e não a exceção nesta
   * frota: 883 dos 982 motoristas e 888 dos 902 veículos. Ela NÃO é uma decisão nova: cada recurso
   * subcontratado já carrega a sua (o banco exige por constraint). Sem passá-la, `assignTrip` recusa
   * tudo por "atribuição incompleta" — foi exatamente o que aconteceu na primeira rodada, 48
   * bloqueios e zero vínculos.
   */
  const subcontratado =
    driver.ownershipType === "subcontracted" || vehicle.ownershipType === "subcontracted";
  const carrierId = driver.carrierId ?? vehicle.carrierId ?? undefined;

  /**
   * Motorista e veículo cadastrados sob transportadoras diferentes (decisão 2026-08-16).
   *
   * Isto começou recusando o vínculo, por um raciocínio que continua válido em tese: juntar gente de
   * uma transportadora com caminhão de outra é uma escolha comercial, não um detalhe a adivinhar.
   *
   * Só que a divergência medida aqui não carrega escolha nenhuma. A frota entrou por planilha e caiu
   * em dois baldes: 878 motoristas em "Agregados", 575 veículos em "Transportes Parceiros (Demo)".
   * Não há um par que discorde — há uma importação que arquivou os dois lados em lugares diferentes,
   * e a regra estava recusando 40 das 57 viagens vivas por causa disso.
   *
   * Então vale a transportadora do MOTORISTA: é com a pessoa que o contrato existe, o veículo segue
   * quem dirige, e nenhum dos dois lados é inventado. A divergência não é engolida — vai escrita na
   * atribuição, que é onde alguém olha quando o pagamento do subcontratado não bate.
   */
  const carrierDiverges = Boolean(
    subcontratado &&
    driver.carrierId &&
    vehicle.carrierId &&
    driver.carrierId !== vehicle.carrierId,
  );

  /**
   * A COMPARAÇÃO, agora que motorista e veículo estão resolvidos.
   *
   * Igual ao que já está lá: nada a fazer, e o ciclo seguinte não repete trabalho. Diferente: o
   * portal manda, e o TMS é corrigido.
   */
  if (atual && atual.driverId === driver.id && atual.vehicleId === vehicle.id) {
    return { outcome: "already_assigned" };
  }
  const substituindo = Boolean(atual);

  const nota = [
    "Atribuição espelhada do portal do cliente.",
    // Fica escrito na própria atribuição que ela SUBSTITUIU outra, e por quê. Sem isso, quem abrir a
    // viagem amanhã vê um motorista trocado e nenhuma explicação.
    substituindo ? "Substituiu a anterior: o cliente trocou motorista ou caminhão no portal." : null,
    emCurso ? `Registrada com a viagem já em curso (${trip.currentStatus}).` : null,
    carrierDiverges
      ? "Transportadora tomada do motorista; o veículo está cadastrado sob outra."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const base = {
    driverId: driver.id,
    vehicleId: vehicle.id,
    trailerId: trailer?.id,
    carrierId: subcontratado ? carrierId : undefined,
    // The optimistic guard: if a dispatcher assigned this trip a second ago, our write loses
    // rather than overwriting a person's decision.
    expectedFromStatus: trip.currentStatus as TripStatus,
    notes: nota,
  };

  // Viagem parada em "Recebida" é atribuída de verdade e avança; viagem já andando é registrada onde
  // está. Os dois passam pelo MESMO avaliador — só o efeito no status difere.
  /**
   * Qual caminho, e por que são três.
   *
   * `received`            → `assignTrip`: atribui de verdade e move a viagem para "Atribuída".
   * em curso, SEM atual   → `mirrorAssignmentFromPortal`: registra retroativo, sem mexer no status.
   * em curso, COM atual   → o mesmo espelho, com `substituirAtual`, que supersede a linha antiga.
   *
   * `received` COM atribuição corrente não acontece: é justamente o estado que `assignTrip` recusa,
   * e `unassignTrip` devolve a viagem para lá já sem atribuição. Se aparecer, cai no `catch` abaixo
   * com o motivo escrito, em vez de virar silêncio.
   */
  const atribuir = (
    id: string,
    entrada: AssignTripInput,
    ator: string,
    bloqueiosAceitos: readonly string[] = [],
  ) =>
    emCurso
      ? mirrorAssignmentFromPortal(id, entrada, ator, substituindo, bloqueiosAceitos)
      : assignTrip(id, entrada, ator, bloqueiosAceitos);

  try {
    // Strict first: if nothing is wrong, the assignment carries no excuse attached to it.
    await atribuir(tripId, base, actorUserId);
    return substituindo
      ? { outcome: "linked", detail: "substituiu a atribuição anterior (o portal mudou)" }
      : { outcome: "linked" };
  } catch (error) {
    if (!(error instanceof Conflict)) throw error;
    /**
     * A recusa dura continua de pé — motorista inativo, veículo em manutenção, contrato de
     * transportadora vencido. O cliente pôs alguém na estrada que o TMS teria parado, e um robô não
     * pode deixar passar calado.
     *
     * COM UMA EXCEÇÃO, decidida pelo usuário em 2026-08-19: CNH VENCIDA.
     *
     * A `LT0Q8J02DZHQ1` ficou sem motorista no quadro por causa disso — ELENO ALEXANDRE BISPO, CNH
     * vencida em 09/01/2026, e o portal o escalou assim mesmo. O TMS recusar não impedia a viagem de
     * acontecer; só escondia quem estava dirigindo. E esconder é pior: a operação perde o motorista
     * na tela E perde o aviso.
     *
     * Então o vínculo aceita e REGISTRA, e a tela da viagem mostra "CNH vencida em 09/01/2026" em
     * vermelho ao lado do nome. O risco fica visível onde alguém decide, em vez de virar uma viagem
     * vazia que ninguém sabe por que está vazia.
     *
     * Isto vale SÓ para o espelho do portal. A atribuição feita à mão continua barrada — lá existe
     * uma pessoa na frente da tela, que pode corrigir o cadastro ou escolher outro motorista.
     *
     * Na exportação do portal são 3 motoristas ativos com CNH vencida, de 375.
     */
    const cnhVencida =
      error.code === "ASSIGNMENT_BLOCKED" &&
      warningCodes(error.details).includes("doc_expired") &&
      bloqueiosSaoSoDaCnh(error.details);
    if (error.code !== "OVERRIDE_REQUIRED" && !cnhVencida) {
      return { outcome: "blocked", detail: error.message };
    }

    const avisos = warningCodes(error.details);
    // The one warning that is a real conflict RIGHT NOW rather than a gap in our own records: the
    // same driver or truck already committed to another trip at the same time. That is a decision,
    // not paperwork, so it stays with a person (decision 2026-08-16).
    if (avisos.includes("schedule_overlap")) {
      return { outcome: "blocked", detail: "conflito de agenda: recurso já está em outra viagem" };
    }

    // Everything else is our registry catching up with reality — 901 of 902 vehicles have no
    // document date on file, so demanding a human for each would mean nobody is ever assigned. The
    // mirror proceeds, and the reason says exactly what was accepted and why, on the record.
    try {
      await atribuir(
        tripId,
        {
          ...base,
          overrideReason: `Espelho da atribuição do cliente no portal. ${
            cnhVencida ? "CNH DO MOTORISTA VENCIDA — aceito por decisão da operação. " : ""
          }Avisos aceitos: ${avisos.join(", ") || "não detalhados"}.`,
        },
        actorUserId,
        cnhVencida ? [CNH_VENCIDA] : [],
      );
      return { outcome: "linked_with_warnings", detail: avisos.join(", ") };
    } catch (retry) {
      if (retry instanceof Conflict) return { outcome: "blocked", detail: retry.message };
      throw retry;
    }
  }
}

/**
 * A ÚNICA exceção tolerada: CNH vencida, e nada mais junto (2026-08-19).
 *
 * `true` só quando TODOS os bloqueios são a validade da carteira do motorista. Se vier acompanhado
 * de motorista inativo, veículo em manutenção ou documento do caminhão vencido, a recusa continua —
 * a decisão do usuário foi sobre a CNH, não sobre bloquear menos.
 */
const CNH_VENCIDA = "driver:doc_expired";

function bloqueiosSaoSoDaCnh(details: unknown): boolean {
  if (!Array.isArray(details) || details.length === 0) return false;
  return details.every((f) => {
    const item = f as { resourceKind?: unknown; code?: unknown };
    return `${String(item.resourceKind)}:${String(item.code)}` === CNH_VENCIDA;
  });
}

/** The finding codes carried by an `OVERRIDE_REQUIRED`, when it carries any. */
function warningCodes(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details
    .map((f) => (f && typeof f === "object" ? String((f as { code?: unknown }).code ?? "") : ""))
    .filter(Boolean);
}
