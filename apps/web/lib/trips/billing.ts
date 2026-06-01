import "server-only";

/**
 * Feature 008 — server-only re-export of the completion/Billing-Ready transitions + the billing view
 * (US2). US4 extends this file with the billing-item mutations.
 */
export { markCompleted, markBillingReady, loadBillingItemView } from "@brazil-tms/db";
