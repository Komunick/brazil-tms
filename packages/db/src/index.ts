export { db, getDb, schema, type DB } from "./client";
export * from "../schema";
export * from "./errors";
export * from "./audit/write-audit";
export * from "./trips/trip-dto";
export { createTrip, getTrip, listTrips } from "./trips/trips-service";
export { updateTripPlan } from "./trips/trip-plan";
export { transitionTripStatus } from "./trips/trip-transitions";
export { cancelTrip } from "./trips/trip-cancellation";
export { addTripNote } from "./trips/trip-events";
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
export type {
  TripBoardRow,
  TripBoardResult,
  TripDetailView,
  DashboardSummary,
  TripFilterOptions,
  ResourceOption,
  ExceptionListItem,
  ReasonCodeOption,
  CustomerSlaRuleItem,
} from "./trips/trips-read";
// Feature 007 — SLA recompute + alert helpers. `ExceptionDto`/`AlertDto` (+ the extended `TripDetail`)
// are already re-exported via `export * from "./trips/trip-dto"` above.
export { recomputeTripSla, resolveSlaPolicy } from "./trips/sla";
export {
  generateAlert,
  autoResolveAlert,
  acknowledgeAlert,
  listAlerts,
  type AlertCase,
  type AlertSeverity,
  type AlertListItem,
  type AlertListResult,
} from "./trips/alerts";
