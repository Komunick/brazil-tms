export { db, getDb, schema, type DB } from "./client";
export * from "../schema";
export * from "./errors";
export * from "./audit/write-audit";
export * from "./trips/trip-dto";
export { createTrip, getTrip, listTrips } from "./trips/trips-service";
export { updateTripPlan } from "./trips/trip-plan";
export { transitionTripStatus } from "./trips/trip-transitions";
export { cancelTrip } from "./trips/trip-cancellation";
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
} from "./trips/trips-read";
export type {
  TripBoardRow,
  TripBoardResult,
  TripDetailView,
  DashboardSummary,
  TripFilterOptions,
  ResourceOption,
} from "./trips/trips-read";
