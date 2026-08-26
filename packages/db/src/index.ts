export { db, getDb, schema, type DB } from "./client";
export * from "../schema";
export * from "./errors";
export * from "./audit/write-audit";
export * from "./trips/trip-dto";
export { createTrip, getTrip, listTrips } from "./trips/trips-service";
export { resolveLaneId } from "./trips/lane-resolution";
export { updateTripPlan } from "./trips/trip-plan";
export { updateOperationalFields } from "./trips/trip-operational-fields";
export {
  advanceTripFromSource,
  closeTripFromSource,
  isCancellationLabel,
  isClosedAtSource,
} from "./trips/source-status";
export type { AdvanceOutcome, CloseOutcome } from "./trips/source-status";
export {
  applyPortalExecution,
  applyPortalTrip,
  existingTripIds,
  linkStationIds,
  loadStationMap,
} from "./trips/portal-execution-apply";
export type {
  PortalApplyOutcome,
  PortalApplySummary,
  PortalApplyOptions,
} from "./trips/portal-execution-apply";
export { applyPortalPlan, applyPortalPlanTrip } from "./trips/portal-plan-apply";
// O vínculo com a frota registrada — exportado para o teste de integração que tranca o cadastro
// automático do veículo (2026-08-19).
export { linkFleetFromPortal } from "./trips/portal-fleet-link";
export type { FleetLinkOutcome, FleetLinkResult } from "./trips/portal-fleet-link";
export { resolvePortalActorId } from "./trips/portal-actor";
export {
  marcarVistasNoPortal,
  marcarRetiradasDoPortal,
  SILENCIO_HORAS,
  TETO,
  type RetiradasResumo,
} from "./trips/portal-withdrawn";
export type {
  PortalPlanOutcome,
  PortalPlanSummary,
  PortalPlanOptions,
} from "./trips/portal-plan-apply";
export { transitionTripStatus } from "./trips/trip-transitions";
export {
  cancelTrip,
  queryCancellationOptions,
  type CancellationOptionItem,
} from "./trips/trip-cancellation";
export { addTripNote } from "./trips/trip-events";
export { lerProgramacaoDaViagem, salvarPrevisto, marcarStatus } from "./trips/trip-programacao";
export type { ProgramacaoDaViagem } from "./trips/trip-programacao";
export { listarPlacasDoPortal } from "./trips/portal-placas";
export type { PlacaDoPortal } from "./trips/portal-placas";
export { listarComentarios, comentar, apagarComentario } from "./trips/comentarios";
export type { Comentario } from "./trips/comentarios";
export { createException, updateException, transitionException } from "./trips/exceptions";
export {
  assignTrip,
  reassignTrip,
  unassignTrip,
  confirmTripAssignment,
  checkAssignment,
  gatherEligibilityContext,
} from "./trips/trip-assignments";
// `TripAssignmentDto` (+ the extended `TripDetail`) is already re-exported via `export * from
// "./trips/trip-dto"` above.
export {
  queryTripBoard,
  getTripDetailView,
  queryDashboardMetrics,
  exportTripRows,
  getTripFilterOptions,
  queryExceptions,
  queryReasonCodes,
  queryCustomerSlaRules,
} from "./trips/trips-read";
export { queryWallboard, ON_THE_ROAD_STATUSES } from "./trips/wallboard-read";
export type { WallboardSummary, WallboardTrip } from "./trips/wallboard-read";
export { recordSpotOffer, readSpotOffersToday } from "./trips/spot-offers";
export type { SpotOfferView } from "./trips/spot-offers";
export {
  recordFleetPositions,
  readFleetPositions,
  lastFleetPositionAt,
  fleetSummary,
  normalizePlate,
} from "./fleet/fleet-positions";
export type {
  FleetPositionView,
  FleetFeedResult,
  FleetSummary,
  DeliveryRisk,
} from "./fleet/fleet-positions";
export type {
  TripBoardRow,
  TripBoardResult,
  TripDetailView,
  DashboardSummary,
  RegionSlice,
  TripFilterOptions,
  ResourceOption,
  ExceptionListItem,
  ReasonCodeOption,
  CustomerSlaRuleItem,
} from "./trips/trips-read";
// Feature 007 — SLA recompute + alert helpers. `ExceptionDto`/`AlertDto` (+ the extended `TripDetail`)
// are already re-exported via `export * from "./trips/trip-dto"` above.
export { recomputeTripSla, resolveSlaPolicy } from "./trips/sla";
// feature 009 — the shared on-time predicate (DRY-for-correctness with the dashboard, R2). The three
// report read models + the extended audit read are exported within their story phases below.
export { onTimeExpr, type OnTimeExpr, type OnTimeKind } from "./trips/on-time";
export { querySlaReport } from "./reporting/sla";
export { queryExceptionReport } from "./reporting/exceptions";
export { queryBillingReadinessReport } from "./reporting/billing-readiness";
export { queryAuditLog } from "./audit/audit-read";
export { createCustomerSlaRule, updateCustomerSlaRule } from "./trips/sla-rules";
export {
  generateAlert,
  autoResolveAlert,
  acknowledgeAlert,
  unacknowledgeAlert,
  listAlerts,
  type AlertCase,
  type AlertSeverity,
  type AlertListItem,
  type AlertListResult,
} from "./trips/alerts";
// Feature 008 — documents / requirements / rates / billing-items foundational reads + helpers.
// (`DocumentDto`/`DocumentSummary`/`BillingItemView`/`BillingAdjustmentDto`/`DocRef` flow through
// `export * from "./trips/trip-dto"` above.)
export {
  resolveRequiredTypes,
  satisfiedDocumentTypeIds,
  loadChecklistStatus,
  listDocumentRequirements,
  listDocumentTypes,
  createDocumentRequirement,
  updateDocumentRequirement,
  createDocumentType,
  updateDocumentType,
  type TripScope,
  type ChecklistStatus,
} from "./documents/requirements";
export {
  uploadDocument,
  verifyDocument,
  archiveDocument,
  getDocumentFileKey,
  assertUploadable,
} from "./documents/documents";
export { resolveRate, listRates, createRate, updateRate, type RateRow } from "./billing/rates";
export {
  ensureBillingItem,
  loadBillingItemView,
  billingPeriodSaoPaulo,
  updateBillingItem,
  addBillingAdjustment,
  removeBillingAdjustment,
} from "./billing/billing-items";
export { markCompleted, markBillingReady } from "./trips/completion";
// Aceitar/rejeitar no portal a partir do TMS: a fila de ordens que o robo executa (2026-08-21).
export {
  enfileirarOrdemDoPortal,
  pegarOrdensPendentes,
  encerrarOrdemDoPortal,
  ordensDaViagem,
  viagensComOrdemAberta,
  OrdemRecusada,
  type OrdemDoPortal,
} from "./trips/portal-commands";
export {
  readOrigemAtrasadaPorRegiao,
  readSpotPorRegiao,
  type OrigemAtrasadaDaRegiao,
  type SpotDaRegiao,
} from "./trips/programacao";
export { listarMotoristasDoPortal, type MotoristaDoPortal } from "./trips/portal-drivers";
export { createExportBatch, countBillableTrips, getExportDownload } from "./billing/export";
export {
  queryBillingList,
  queryExportBatches,
  queryRates,
  queryDocumentRequirements,
  queryDocumentTypes,
  type BillingListRow,
  type ExportBatchRow,
  type RateRowView,
  type DocumentRequirementView,
  type DocumentTypeView,
} from "./trips/trips-read";
// O BSC do cliente, espelhado (2026-08-17): grava o que a Shopee publicou e devolve o mais recente
// de cada recorte, com a idade colada.
export { saveBscSnapshot, queryLatestBsc, BSC_PERIODS } from "./reporting/bsc";
export type { BscPeriod, BscSnapshotInput, BscSnapshotView } from "./reporting/bsc";
// O pulso dos robôs e do worker (2026-08-19): só carimbos, sem julgamento — a régua mora na tela.
export { queryServerStatus } from "./reporting/server-status";
export type {
  ServerStatus,
  StatusFonte,
  StatusTarefa,
  StatusParPortal,
} from "./reporting/server-status";
// O push da SPX (2026-08-20): gravado cru até haver payload real para mapear.
export { recordSpxRouterEvent, querySpxRouterPulse } from "./imports/spx-router";
export type {
  SpxRouterEventInput,
  SpxRouterEventResult,
  SpxRouterPulse,
} from "./imports/spx-router";
// O pulso dos robôs (2026-08-21): intervalo prometido contra duração real do último ciclo.
export { recordRobotCycle, queryRobotCycles, countRobotsSufocando } from "./reporting/robot-cycles";
export type { RobotCycleInput, RobotCycleView } from "./reporting/robot-cycles";
export { readDashboardPrefs, writeDashboardPrefs } from "./users/dashboard-prefs";
export type { PainelGuardado } from "./users/dashboard-prefs";
export { readMalhaDeRotas } from "./reporting/malha";
export type { RotaDaMalha } from "./reporting/malha";
export {
  readDesempenhoGeral,
  readDesempenhoPorRota,
  readMelhoresDaRotaDaViagem,
} from "./reporting/motoristas";
export type { DesempenhoDoMotorista, DesempenhoNaRota } from "./reporting/motoristas";
export {
  readMinhaProgramacao,
  readProgramacao,
  marcarViagem,
  acompanharViagem,
  pararDeAcompanhar,
} from "./users/programacao";
export type { LinhaDaProgramacao } from "./users/programacao";
export type { ViagemAcompanhada } from "./users/programacao";
export {
  applyPortalDrivers,
  applyDriverSensitive,
  contarSemTelefone,
} from "./fleet/portal-drivers-apply";
export type { ResumoDoCadastro, FaltaRevelar } from "./fleet/portal-drivers-apply";
export {
  readRotasDoMotorista,
  readRegistrosDoMotorista,
  registrarNoMotorista,
} from "./fleet/driver-records";
export type { RotaDoMotorista, RegistroDoMotorista } from "./fleet/driver-records";
// O vínculo do recurso, gravado pelo diálogo de atribuição (026).
export {
  gravarVinculosDaAtribuicao,
  vinculosPorPlaca,
  type VinculoEscolhido,
  type VinculosDaAtribuicao,
} from "./trips/pre-sm-vinculos";
// A ponte rota → modelo de Pré-SM: a carga propõe, uma pessoa confirma (026).
export {
  gravarPropostasDeRota,
  listarCorrespondencias,
  definirConfirmacaoDaCorrespondencia,
  codRotaConfirmada,
  rotasParaCorrespondencia,
  type CorrespondenciaDaRota,
} from "./trips/pre-sm-rotas";
// A ponte estação → cidade: a carga propõe, uma pessoa confirma (027).
export {
  gravarPropostasDeCidade,
  listarCorrespondenciasDeCidade,
  definirConfirmacaoDaCidade,
  ibgeConfirmadoDaEstacao,
  type CorrespondenciaDaCidade,
} from "./trips/pre-sm-cidades";
// O estado da Pré-SM por viagem (026).
export {
  abrirTentativaDePreSm,
  encerrarTentativaDePreSm,
  contarTentativa,
  preSmDaViagem,
  preSmDeVariasViagens,
  criadasHoje,
  type PreSmDaViagem,
  type PreSmStatus,
} from "./trips/pre-sm";
export { dadosDaPreSm, type DadosDaPreSm } from "./trips/pre-sm-dados";
export { ordemDeAtribuicaoConcluida } from "./trips/pre-sm-dados";
export { preSmPorId } from "./trips/pre-sm";
export { registrarPedidoDeCancelamento, registrarPedidoDeEnvio } from "./trips/pre-sm";
export { preSmComAtribuicaoAtual } from "./trips/pre-sm";
// Bloquear um motorista — tirar alguém de circulação (2026-08-25, a pedido). NÃO é o
// `status = 'blocked'`, que é o portal do CLIENTE tendo desativado a pessoa.
export {
  bloquearMotorista,
  desbloquearMotorista,
  listarMotoristasBloqueados,
  bloqueiosPorIdDoPortal,
  motoristasBloqueadosEntre,
  type MotoristaBloqueado,
} from "./fleet/driver-block";

// A fila da aba GR — uma consulta, não uma tabela (027).
export { filaDaGR, linhaDaFilaGR, type LinhaDaFilaGR } from "./trips/gr-fila";
