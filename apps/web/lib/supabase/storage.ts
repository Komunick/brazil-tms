import "server-only";

/**
 * Server-only re-export of the canonical Supabase Storage helper (feature 004, T022/R12). The
 * implementation lives in `@brazil-tms/db` so the import worker can share it; this boundary re-applies
 * the `server-only` guard for the Next app (the service-role key must never reach the browser —
 * Constitution IV). The BFF uses `putOriginal` (upload route) and `signedUrl` (error-report download).
 */
export {
  putOriginal,
  putErrorReport,
  downloadObject,
  signedUrl,
  importBucket,
  originalStorageKey,
  errorReportStorageKey,
} from "@brazil-tms/db/storage";
