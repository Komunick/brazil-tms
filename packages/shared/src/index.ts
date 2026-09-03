// Public surface of @brazil-tms/shared.
// Consumers may also import via subpath exports (see package.json "exports").
export * from "./formatting";
export * from "./auth/permissions";
export * from "./auth/cargo-invariantes";
export * from "./audit/actions";
export * from "./audit/legivel";
export * from "./domain/trip-status";
export * from "./domain/trip-display-status";
export * from "./domain/fleet-alerts";
export * from "./domain/portal-acceptance";
export * from "./domain/portal-assignment";
export * from "./domain/spot-decisao";
export * from "./domain/pesquisa-ja-existe";
export * from "./domain/portal-confirmacao";
// O vínculo que a gerenciadora Logae exige, e o que o dono do veículo sugere (026).
export * from "./domain/pre-sm";
// O casamento rota → modelo de Pré-SM, com as quatro tolerâncias de nome de estação (026).
export * from "./domain/pre-sm-modelos";
export * from "./domain/pre-sm-cadastro";
export * from "./domain/pre-sm-corpo";
export * from "./domain/region";
export * from "./domain/status-programacao";
export * from "./domain/coordenada-de-rota";
export * from "./domain/passagem-de-turno";
export * from "./domain/passagem-de-turno-sugestao";
export * from "./domain/assignment-eligibility";
export * from "./domain/sla-risk";
export * from "./domain/exceptions";
export * from "./domain/operational-fields";
export * from "./sla/jobs";
export * from "./import/portal-jobs";
export * from "./import/turno-jobs";
export * from "./import/perfil-jobs";
// feature 008 — documents, completion, billing readiness, rates & export.
export * from "./domain/documents";
export * from "./domain/billing";
export * from "./billing/jobs";
export * from "./documents/jobs";
export * from "./schemas/auth";
export * from "./schemas/admin-user";
export * from "./schemas/master-data";
export * from "./schemas/pre-cadastro";
export * from "./domain/cnh-lida";
export * from "./domain/cnh-jobs";
export * from "./domain/motorista-corpo";
export * from "./domain/pesquisa-corpo";
export * from "./domain/cidade-ibge";
export * from "./schemas/trip";
export * from "./schemas/trip-assignment";
export * from "./schemas/trip-board";
export * from "./schemas/trip-event";
export * from "./schemas/exception";
export * from "./schemas/customer-sla-rule";
export * from "./schemas/alert";
export * from "./schemas/import";
export * from "./schemas/document";
export * from "./schemas/document-requirement";
export * from "./schemas/resource-documents";
export * from "./schemas/rate";
export * from "./schemas/billing";
export * from "./import";
// feature 009 — reporting + audit-view query schemas, period helpers & read-model row types.
export * from "./schemas/report";
export * from "./schemas/audit";
export * from "./domain/reporting";
// feature 016 — freight rate lookup (agregados): sheet normalizer + query filters.
export * from "./domain/freight-rates";
export * from "./schemas/freight-rate";
export * from "./schemas/spot-offer";
export * from "./schemas/fleet-position";
export * from "./schemas/portal-command";
export * from "./schemas/dashboard-prefs";
export * from "./import/portal-drivers-api";
