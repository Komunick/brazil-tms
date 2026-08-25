import { REGION_ORDER } from "../domain/region";
import { z } from "zod";

/**
 * Shared Zod schemas for feature 002 master data (data-model.md §Validation; pt-BR messages).
 * One create/update schema per entity, imported by BOTH the BFF route handlers and the
 * react-hook-form screens (DRY). Building blocks (contacts, CNPJ, plate, UF, money, enums, the
 * ownership/carrier refinement) are defined once and reused across the seven entities.
 *
 * The DB also enforces the hard invariants (UNIQUE, CHECK, FK); these schemas catch shape/format
 * errors at the boundary (400) before a row is touched, and the services surface DB conflicts (409).
 *
 * Optional fields coerce empty-string form inputs to `undefined` (HTML inputs yield "" when blank),
 * and numeric fields coerce numeric strings, so the same schema validates both JSON bodies and forms.
 */

// ---------------------------------------------------------------------------
// Coercion helpers
// ---------------------------------------------------------------------------

/**
 * Optional field that distinguishes "absent" from "cleared". A blank input ("" or null) becomes
 * explicit `null` (so an edit can CLEAR the column, and switching a resource to `owned` with a blank
 * carrier nulls `carrier_id`); a missing key stays `undefined` (so the partial-update services skip
 * it and leave the column unchanged).
 */
const blankable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? null : v), schema.nullable().optional());

/** Optional nested object: an all-blank object collapses to `null` (cleared); absent stays undefined. */
const optionalObject = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v === "object") {
      const hasValue = Object.values(v as Record<string, unknown>).some(
        (x) => x !== "" && x != null,
      );
      if (!hasValue) return null;
    }
    return v;
  }, schema.nullable().optional());

const optionalText = (max = 200) =>
  blankable(z.string().trim().max(max, `Máximo de ${max} caracteres.`));

/** Email that is optional but, when present, must be valid (blank → undefined). */
const optionalEmail = blankable(z.string().trim().email("E-mail inválido."));

/** Wrap a numeric schema so "" / null become undefined and numeric strings become numbers. */
const numberFromInput = (schema: z.ZodNumber) =>
  z.preprocess((v) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isNaN(n) ? v : n;
    }
    return v;
  }, schema.nullable().optional());

// ---------------------------------------------------------------------------
// Primitive building blocks
// ---------------------------------------------------------------------------

const nameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome.")
  .max(200, "O nome deve ter no máximo 200 caracteres.");

/** CNPJ — basic format check only (R7): 14 digits after stripping punctuation. */
export const cnpjSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\D/g, ""))
  .pipe(z.string().length(14, "CNPJ deve ter 14 dígitos."));

const optionalCnpj = blankable(cnpjSchema);

/**
 * Check digits (dígitos verificadores) of an 11-digit CPF, mod-11 as defined by the Receita Federal.
 * Repdigits ("111.111.111-11") satisfy the arithmetic but are never issued, so they are rejected.
 */
const hasValidCpfCheckDigits = (digits: string): boolean => {
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (upTo: number): number => {
    let sum = 0;
    for (let i = 0; i < upTo; i += 1) sum += Number(digits[i]) * (upTo + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
};

/**
 * CPF — digits only; a pasted punctuated value ("390.533.447-05") is normalized. Strips ONLY the
 * supported separators (dot/hyphen/space); any other character must FAIL the digit check below,
 * never be silently discarded ("abc390.533.447-05xyz" is rejected, not coerced). Beyond the format,
 * the check digits are verified (issue: "CPF tem que estar autenticado") — a well-formed but
 * non-existent number is refused.
 */
export const cpfSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[.\-\s]/g, ""))
  .pipe(z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos."))
  .refine(hasValidCpfCheckDigits, "CPF inválido.");

const optionalCpf = blankable(cpfSchema);

/**
 * Telefone — digits only, DDD required: 10 (fixo) or 11 (celular). A pasted formatted number
 * ("(11) 99999-8888") is normalized; letters or stray symbols fail rather than being discarded.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[()\-\s.]/g, ""))
  .pipe(z.string().regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos (com DDD)."));

const optionalPhone = blankable(phoneSchema);

/**
 * Renavam — basic format check only (R7 posture): digits after stripping punctuation, 9–11
 * (11 modern, 9 legacy pre-2013 registrations; no check-digit validation until asked).
 */
export const renavamSchema = z
  .string()
  .trim()
  // Strip only the supported separators — anything else (letters, stray symbols) must FAIL the
  // digit check below, never be silently discarded.
  .transform((s) => s.replace(/[.\-\s]/g, ""))
  .pipe(z.string().regex(/^\d{9,11}$/, "Renavam deve ter de 9 a 11 dígitos."));

const optionalRenavam = blankable(renavamSchema);

/** Chassi (VIN) — normalized uppercase, space/hyphen stripped; 17 standard chars (no I/O/Q). */
export const chassisSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase().replace(/[\s-]/g, ""))
  .pipe(
    z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Chassi inválido (17 caracteres, sem I, O ou Q)."),
  );

const optionalChassis = blankable(chassisSchema);

/** BR/Mercosul plate (R11): normalized to uppercase, hyphen/space stripped. */
export const plateSchema = z
  .string()
  .trim()
  .min(1, "Informe a placa.")
  .transform((s) => s.toUpperCase().replace(/[\s-]/g, ""))
  .pipe(
    z.string().regex(/^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/, "Placa inválida (formato BR/Mercosul)."),
  );

/** Brazilian state (UF) — closed 2-letter set. */
export const ufSchema = z.enum(
  [
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
  ],
  { errorMap: () => ({ message: "UF inválida." }) },
);
export const UF_VALUES = ufSchema.options;
const optionalUf = blankable(ufSchema);

/** Non-negative integer amount of centavos (BRL, R7). */
export const moneyCentsSchema = z
  .number({ invalid_type_error: "Valor inválido." })
  .int("O valor deve ser um inteiro em centavos.")
  .nonnegative("O valor não pode ser negativo.");

/** Date as an ISO calendar day string (YYYY-MM-DD). */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD).");
const optionalDate = blankable(dateStringSchema);

export const latitudeSchema = z
  .number()
  .min(-90, "Latitude inválida.")
  .max(90, "Latitude inválida.");
export const longitudeSchema = z
  .number()
  .min(-180, "Longitude inválida.")
  .max(180, "Longitude inválida.");

/** A contact entry (R8 — stored as jsonb, validated here). */
export const contactSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do contato.").max(200),
  email: optionalEmail,
  phone: optionalText(40),
  role: optionalText(80),
});
export type Contact = z.infer<typeof contactSchema>;

/** Billing contact — like a contact but without a role. */
export const billingContactSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do contato.").max(200),
  email: optionalEmail,
  phone: optionalText(40),
});

// ---------------------------------------------------------------------------
// Enum schemas (mirror the Postgres enums in packages/db/schema/enums.ts)
// ---------------------------------------------------------------------------

export const resourceStatusSchema = z.enum(
  ["active", "inactive", "unavailable", "maintenance", "blocked"],
  { errorMap: () => ({ message: "Status inválido." }) },
);
export const RESOURCE_STATUS_VALUES = resourceStatusSchema.options;
export type ResourceStatus = z.infer<typeof resourceStatusSchema>;

/**
 * O VÍNCULO DO RECURSO — e por que são DOIS tipos, não um (2026-08-25, fatia 026).
 *
 * A gerenciadora Logae exige `F` (frota própria), `A` (agregado) ou `T` (terceiro). O TMS
 * distinguia só `owned` de `subcontracted`, o que dava o `F` e deixava os outros dois juntos.
 *
 * ── POR QUE `subcontracted` CONTINUA NO TIPO ──────────────────────────────────────────────────
 *
 * O plano desta fatia dizia para deixá-lo FORA, copiando o que a 015 fez com o `trip_status`. Ao
 * escrever o código ficou claro que não dá: na 015 uma migração de dados esvaziou os valores
 * dormentes, e aqui **1.246 veículos e 405 motoristas continuam com `subcontracted`** — porque foi
 * decidido não fazer mutirão de cadastro. Um tipo que não o inclui seria falso: ler um veículo
 * devolveria um valor que o tipo jura não existir, e o primeiro `switch` exaustivo passaria batido
 * por ele.
 *
 * Então a separação é outra: **o que uma linha PODE SER** ≠ **o que a tela PODE ESCOLHER**.
 */
export const ownershipTypeSchema = z.enum(["owned", "subcontracted", "agregado", "terceiro"], {
  errorMap: () => ({ message: "Tipo de propriedade inválido." }),
});
export const OWNERSHIP_TYPE_VALUES = ownershipTypeSchema.options;
export type OwnershipType = z.infer<typeof ownershipTypeSchema>;

/**
 * O que a tela pode ESCOLHER — sem `subcontracted`.
 *
 * Ele é legado: significa "ainda não classificado", e é o estado de quem nunca passou por uma
 * atribuição depois desta fatia. Uma linha pode estar assim; ninguém pode escolher ficar assim.
 */
export const vinculoEscolhivelSchema = z.enum(["owned", "agregado", "terceiro"], {
  errorMap: () => ({ message: "Vínculo inválido." }),
});
export const VINCULO_ESCOLHIVEL_VALUES = vinculoEscolhivelSchema.options;
export type VinculoEscolhivel = z.infer<typeof vinculoEscolhivelSchema>;

/** `subcontracted` não é erro: é ausência de classificação, e a tela precisa dizer isso. */
export function precisaClassificarVinculo(v: OwnershipType | null | undefined): boolean {
  return v == null || v === "subcontracted";
}

export const vehicleTypeSchema = z.enum(
  [
    "van",
    "vuc",
    "tres_quartos",
    "toco",
    "truck",
    "bitruck",
    // A tractor unit is its own registry entry — the fleet owns cavalos, and a customer schedule
    // names the COMPOSITION it wants (carreta/truck/…), which is a different question.
    "cavalo",
    "carreta",
    "carreta_ls",
    "bitrem",
    "rodotrem",
  ],
  { errorMap: () => ({ message: "Tipo de veículo inválido." }) },
);
export const VEHICLE_TYPE_VALUES = vehicleTypeSchema.options;
export type VehicleType = z.infer<typeof vehicleTypeSchema>;

export const trailerTypeSchema = z.enum(
  ["sider", "bau", "graneleiro", "tanque", "frigorifico", "prancha", "cacamba", "porta_container"],
  { errorMap: () => ({ message: "Tipo de reboque inválido." }) },
);
export const TRAILER_TYPE_VALUES = trailerTypeSchema.options;
export type TrailerType = z.infer<typeof trailerTypeSchema>;

export const carrierContractStatusSchema = z.enum(["active", "suspended", "expired"], {
  errorMap: () => ({ message: "Status de contrato inválido." }),
});
export const CARRIER_CONTRACT_STATUS_VALUES = carrierContractStatusSchema.options;

export const carrierDocumentationStatusSchema = z.enum(["pending", "complete", "expired"], {
  errorMap: () => ({ message: "Status de documentação inválido." }),
});
export const CARRIER_DOCUMENTATION_STATUS_VALUES = carrierDocumentationStatusSchema.options;

// ---------------------------------------------------------------------------
// Ownership/carrier invariant (mirror of the DB CHECK — FR-022/FR-023)
// ---------------------------------------------------------------------------

/**
 * Espelha o CHECK do banco: **frota própria não tem transportadora; todo o resto tem.**
 *
 * Escrito assim — `owned` de um lado, "o resto" do outro — e não enumerando os valores, que era a
 * forma antiga (`subcontracted ⇒ tem`). A diferença importa: com a lista explícita, `agregado` e
 * `terceiro` não satisfaziam nenhum braço e toda gravação era recusada. É o mesmo motivo pelo qual
 * o CHECK do banco foi reescrito na mesma migração — se um dos dois enumerar e o outro não, a tela
 * aceita o que o banco recusa.
 *
 * `undefined` passa: é atualização parcial, que não está mexendo no vínculo.
 */
export function isOwnershipCarrierValid(data: {
  ownershipType?: OwnershipType;
  carrierId?: string | null;
}): boolean {
  if (data.ownershipType === undefined) return true;
  if (data.ownershipType === "owned") return !data.carrierId;
  return Boolean(data.carrierId);
}

const OWNERSHIP_CARRIER_REFINE = {
  message:
    "Recurso subcontratado exige uma transportadora; recurso próprio não pode ter transportadora.",
  path: ["carrierId"],
};

/** Apply the ownership/carrier invariant to any schema with `ownershipType` + `carrierId`. */
export const ownershipCarrierRefine = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(isOwnershipCarrierValid, OWNERSHIP_CARRIER_REFINE);

const carrierIdField = blankable(z.string().uuid("Transportadora inválida."));

// ---------------------------------------------------------------------------
// 1. Customer (US1)
// ---------------------------------------------------------------------------

const customerBase = z.object({
  name: nameSchema,
  legalName: optionalText(200),
  customerCode: z
    .string()
    .trim()
    .min(1, "Informe o código do cliente.")
    .max(60, "Código muito longo."),
  taxId: optionalCnpj,
  contacts: z.array(contactSchema).optional().default([]),
  billingContact: optionalObject(billingContactSchema),
});

export const createCustomerSchema = customerBase;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = customerBase.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// ---------------------------------------------------------------------------
// 2. Location (US2)
// ---------------------------------------------------------------------------

const locationBase = z.object({
  customerId: z.string().uuid("Cliente inválido."),
  code: z.string().trim().min(1, "Informe o código.").max(60, "Código muito longo."),
  name: nameSchema,
  address: optionalText(300),
  city: optionalText(120),
  state: optionalUf,
  country: z.string().trim().length(2, "País inválido.").default("BR"),
  latitude: numberFromInput(latitudeSchema),
  longitude: numberFromInput(longitudeSchema),
  /**
   * A REGIÃO OPERACIONAL da estação (2026-08-20).
   *
   * LIMITADA às três, e isto é uma mudança de ideia declarada: o filtro do quadro aceita texto livre
   * de propósito — região desconhecida na URL deve devolver lista vazia, não erro 400. Na ESCRITA o
   * risco é o oposto: um "SUDESTE " com espaço ou um "Sudeste" minúsculo criaria um quarto cartão
   * no painel sem ninguém perceber, e ninguém acharia o erro olhando a tela. Ler tolera, escrever
   * não. Uma quarta região é uma linha em `REGION_ORDER`.
   *
   * `nullish` e não `transform`: um transform tornaria o campo OBRIGATÓRIO no tipo de saída, e todo
   * pendências mostra.
   */
  region: z.enum(REGION_ORDER).nullish(),
  gateInstructions: optionalText(1000),
});

export const createLocationSchema = locationBase;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = locationBase.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

// ---------------------------------------------------------------------------
// 3. Lane (US2)
// ---------------------------------------------------------------------------

const laneBase = z.object({
  customerId: z.string().uuid("Cliente inválido."),
  originLocationId: z.string().uuid("Origem inválida."),
  destinationLocationId: z.string().uuid("Destino inválido."),
  expectedTransitMinutes: numberFromInput(z.number().int().nonnegative()),
  defaultVehicleType: blankable(vehicleTypeSchema),
  standardRateCents: numberFromInput(moneyCentsSchema),
  tollEstimateCents: numberFromInput(moneyCentsSchema),
  standardDistanceKm: numberFromInput(z.number().nonnegative("A distância não pode ser negativa.")),
  /**
   * A rota faz parte da MALHA da empresa — ou seja, é nossa (2026-08-23).
   *
   * Opcional e SEM `.default()`. Quem cadastra uma rota à mão está dizendo que ela é nossa, e a
   * tela manda `true`; o padrão `false` mora na criação, em `createLane`.
   *
   * O `.default()` aqui seria uma armadilha silenciosa: `updateLaneSchema` é `laneBase.partial()`
   * e um default sobrevive ao `.partial()`, então toda edição que não mandasse o campo receberia
   * `false` do próprio Zod — e a rota sairia da malha ao ter o preço corrigido.
   */
  inNetwork: z.boolean().optional(),
});

/** origin ≠ destination (degenerate-lane guard, mirrors the DB CHECK). */
const laneNotDegenerate = (data: {
  originLocationId?: string;
  destinationLocationId?: string;
}): boolean =>
  data.originLocationId === undefined ||
  data.destinationLocationId === undefined ||
  data.originLocationId !== data.destinationLocationId;

const LANE_DEGENERATE_REFINE = {
  message: "A origem e o destino devem ser locais diferentes.",
  path: ["destinationLocationId"],
};

export const createLaneSchema = laneBase.refine(laneNotDegenerate, LANE_DEGENERATE_REFINE);
export type CreateLaneInput = z.infer<typeof createLaneSchema>;

export const updateLaneSchema = laneBase
  .partial()
  .refine(laneNotDegenerate, LANE_DEGENERATE_REFINE);
export type UpdateLaneInput = z.infer<typeof updateLaneSchema>;

// ---------------------------------------------------------------------------
// 4. Driver (US3/US4)
// ---------------------------------------------------------------------------

const driverBase = z.object({
  name: nameSchema,
  // Digits only, DDD required — the driver phone is a dial target for dispatch, not free text.
  phone: optionalPhone,
  // Issue #28 [0005]: CPF replaced the driver e-mail; the DB `email` column is dormant.
  cpf: optionalCpf,
  licenseNumber: optionalText(40),
  licenseCategory: optionalText(8),
  licenseExpiry: optionalDate,
  ownershipType: ownershipTypeSchema,
  carrierId: carrierIdField,
  employer: optionalText(200),
  status: resourceStatusSchema.optional(),
  notes: optionalText(2000),
});

export const createDriverSchema = ownershipCarrierRefine(driverBase);
export type CreateDriverInput = z.infer<typeof createDriverSchema>;

export const updateDriverSchema = ownershipCarrierRefine(driverBase.partial());
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;

// ---------------------------------------------------------------------------
// 5. Vehicle (US3/US4)
// ---------------------------------------------------------------------------

const vehicleBase = z.object({
  plate: plateSchema,
  vehicleType: vehicleTypeSchema,
  // Issue #30 [0007]: Brazilian registry identifiers. ANTT (RNTRC) stays free text — its format
  // varies by era/category — while Renavam and Chassi have well-defined shapes.
  anttNumber: optionalText(20),
  renavam: optionalRenavam,
  chassis: optionalChassis,
  capacityKg: numberFromInput(z.number().int().nonnegative()),
  ownershipType: ownershipTypeSchema,
  carrierId: carrierIdField,
  owner: optionalText(200),
  trackerProvider: optionalText(120),
  trackerId: optionalText(120),
  documentExpiry: optionalDate,
  status: resourceStatusSchema.optional(),
  notes: optionalText(2000),
});

export const createVehicleSchema = ownershipCarrierRefine(vehicleBase);
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = ownershipCarrierRefine(vehicleBase.partial());
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

// ---------------------------------------------------------------------------
// 6. Trailer (US3/US4)
// ---------------------------------------------------------------------------

const trailerBase = z.object({
  plate: plateSchema,
  trailerType: trailerTypeSchema,
  capacityKg: numberFromInput(z.number().int().nonnegative()),
  ownershipType: ownershipTypeSchema,
  carrierId: carrierIdField,
  owner: optionalText(200),
  documentExpiry: optionalDate,
  status: resourceStatusSchema.optional(),
  notes: optionalText(2000),
});

export const createTrailerSchema = ownershipCarrierRefine(trailerBase);
export type CreateTrailerInput = z.infer<typeof createTrailerSchema>;

export const updateTrailerSchema = ownershipCarrierRefine(trailerBase.partial());
export type UpdateTrailerInput = z.infer<typeof updateTrailerSchema>;

// ---------------------------------------------------------------------------
// 7. Carrier (US4)
// ---------------------------------------------------------------------------

const carrierContactSchema = z.object({
  name: optionalText(200),
  email: optionalEmail,
  phone: optionalText(40),
  address: optionalText(300),
});

const carrierBase = z.object({
  name: nameSchema,
  legalName: optionalText(200),
  taxId: optionalCnpj,
  contact: optionalObject(carrierContactSchema),
  contractStatus: carrierContractStatusSchema.optional(),
  documentationStatus: carrierDocumentationStatusSchema.optional(),
});

export const createCarrierSchema = carrierBase;
export type CreateCarrierInput = z.infer<typeof createCarrierSchema>;

export const updateCarrierSchema = carrierBase.partial();
export type UpdateCarrierInput = z.infer<typeof updateCarrierSchema>;
