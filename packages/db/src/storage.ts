import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage helper (feature 004, research R12). Server/worker-only — uses the service-role key
 * and is consumed by BOTH the BFF (`apps/web` re-exports this via `lib/supabase/storage.ts`) and the
 * import worker (parse downloads the original; generate-error-report uploads the report). The private
 * `imports` bucket holds the original upload + the generated error report; only their keys/metadata
 * live in Postgres. Downloads are server-mediated short-lived signed URLs — never public object URLs
 * (Constitution IV; the Supabase gateway exposes Storage but objects stay private).
 *
 * It deliberately does NOT `import "server-only"`: `@brazil-tms/db` is loaded by the plain-Node worker
 * too. The web side re-applies the server-only guard at its re-export boundary.
 */

let cachedClient: SupabaseClient | undefined;

function getClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase Storage requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (server/worker-only).",
    );
  }
  cachedClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedClient;
}

/** The private bucket name (default `imports`; overridable via IMPORT_BUCKET). */
export function importBucket(): string {
  return process.env.IMPORT_BUCKET ?? "imports";
}

/** Storage key of the original uploaded file for a batch (one per batch). */
export function originalStorageKey(batchId: string): string {
  return `originals/${batchId}`;
}

/** Storage key of the generated error report for a batch. */
export function errorReportStorageKey(batchId: string): string {
  return `error-reports/${batchId}.xlsx`;
}

async function putObject(
  key: string,
  bytes: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await getClient()
    .storage.from(importBucket())
    .upload(key, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed for ${key}: ${error.message}`);
  return key;
}

/** Upload the original import file; returns its storage key (recorded on `import_batches`). */
export async function putOriginal(
  batchId: string,
  bytes: Buffer | Uint8Array,
  contentType = "application/octet-stream",
): Promise<string> {
  return putObject(originalStorageKey(batchId), bytes, contentType);
}

/** Upload the generated error report (CSV/XLSX); returns its storage key. */
export async function putErrorReport(
  batchId: string,
  bytes: Buffer | Uint8Array,
  contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
): Promise<string> {
  return putObject(errorReportStorageKey(batchId), bytes, contentType);
}

/** Download an object by key (the worker parse job reads the original). */
export async function downloadObject(key: string): Promise<Buffer> {
  const { data, error } = await getClient().storage.from(importBucket()).download(key);
  if (error || !data) throw new Error(`Storage download failed for ${key}: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Issue a short-lived signed download URL (server-mediated; no public object URL). */
export async function signedUrl(key: string, expiresInSeconds: number): Promise<string> {
  const { data, error } = await getClient()
    .storage.from(importBucket())
    .createSignedUrl(key, expiresInSeconds);
  if (error || !data) throw new Error(`Storage signed URL failed for ${key}: ${error?.message ?? "no data"}`);
  return data.signedUrl;
}
