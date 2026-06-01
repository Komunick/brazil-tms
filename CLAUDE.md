# Brazil Transports — Linehaul Execution TMS

Execution-focused TMS (a "control tower"): import pre-planned customer trips
(Shopee, DHL eCommerce, Mercado Livre), assign resources, track milestones, manage
exceptions, store proof, and prepare billing exports. **Not** a route optimizer.

## Repo status

Planning + Spec-Driven Development phase. **No application code yet** — the repo is
docs + GitHub Spec Kit scaffolding. Build work happens feature-by-feature via Spec Kit.

## Documentation map (read the relevant one before working)

- `docs/PRD.md` — product source of truth (the WHAT/WHY): scope, requirements (IDs),
  data model, status machine, gating inputs (§29), decision log (§30).
- `docs/STACK.md` — authoritative tech & infra decisions (the HOW).
- `docs/PRINCIPLES.md` — KISS / DRY / YAGNI rules (the ≥3 rule for abstraction).
- `docs/DELIVERY-WORKFLOW.md` — branching, PRs, deploys, quality gates.
- `docs/SPEC-SLICING.md` — how the PRD is sliced into 9 Spec Kit features (+ ownership matrix).
- `.specify/memory/constitution.md` — governing rules; prevails on technical/process conflict.

On conflict: constitution + STACK govern HOW; PRD governs product scope.

## Non-negotiable constraints (these cause real mistakes if missed)

Self-hosted Supabase = **Postgres + Auth + Storage only**. Hard exclusions — do NOT
introduce these or propose them in any plan (amending requires a constitution change):

- **NO Supabase Realtime** — freshness is polling via TanStack Query, always.
- **NO Supabase Edge Functions.**
- **NO Redis / BullMQ / external broker** — background work uses a Postgres-backed
  queue (`pg-boss`/`graphile-worker`) + one Node worker process.
- **NO microservices** — one app + one worker. **NO route-optimization engine.**
- **RLS deferred** — authorization is enforced in the BFF only; never expose the
  Supabase gateway/PostgREST publicly; service-role key stays server-only.
- Customer variation (import templates, SLA, docs, reason codes) is **config-driven** —
  one import engine, never per-customer code.

Full rationale: `docs/STACK.md` and the constitution.

## Git & delivery (full rules: `docs/DELIVERY-WORKFLOW.md`)

- Work on short-lived feature branches off `dev`. Feature PRs target **`dev`**, never `main`
  (`gh pr create --base dev`). `main` is production.
- **AI must NOT merge to `main`**, approve/force prod deploys, or bypass CI/branch protection.
  Production promotion (`dev → main`) is human-only.
- End commit messages with the `Co-Authored-By` trailer the harness requires.

## Spec-Driven workflow

Flow: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks`
→ `/speckit-analyze` → `/speckit-implement`. Skills are **hyphenated** (not `speckit.*`).
Each spec must reference PRD sections/IDs rather than duplicating them, and stay within
one feature slice (see `docs/SPEC-SLICING.md`). The plan's Constitution Check gate must pass.

## Tech stack (once code exists; detail in `docs/STACK.md`)

Next.js App Router + TypeScript (strict) · Tailwind + shadcn/ui · TanStack Query + Table ·
Zod · Luxon. Monorepo: `apps/web`, `packages/{shared,db}`, `workers/`, `infra/`.
Start with two packages (`shared`, `db`); add more only with justification.

## Environment & conventions

- Windows + PowerShell host. Python/`rich` CLIs need UTF-8 (`PYTHONUTF8=1`) — set
  persistently; a running session may need `$env:PYTHONUTF8='1'` inline.
- Production UI is **pt-BR**; timezone `America/Sao_Paulo`; store timestamps in UTC; currency BRL.
- Code style is enforced by ESLint/Prettier — not by this file. Tests: Vitest + Playwright.

<!-- SPECKIT START -->
Active feature plan: `specs/008-documents-billing-export/plan.md` (Documents, Completion, Billing Readiness, Rates, and Export).
For technologies, project structure, BFF/auth patterns, data model, contracts, and setup/test commands,
read that plan and its `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.
This is the **proof-and-money close-out** over the trip domain: attach **proof documents** (POD, CT-e/MDF-e refs, gate
receipts) and **verify** them (accepted/rejected/pending review); **gate Completed and Billing Ready** on the
per-customer **required-document checklist** + pricing + dispute rules; maintain **simple rates** (customer/lane/
vehicle-type/effective-date) and a typed **billable breakdown** (tolls/waiting-time/redelivery/extra-stops/penalties/
discounts/manual → planned/executed/adjustment/final); and **export** billing-ready trips to CSV/spreadsheet with durable
**export-batch history**. It fills slice 005's Trip-Detail documents/billing placeholders, the "Completed trips missing
documents" dashboard widget, and the "Missing documents" board view, and lights up the **two §17 alert cases** 007
deferred (completed-but-missing-documents, billing-blocked-by-missing-proof) via the **007 `alerts` store**. Freshness is
**polling** (no Realtime). It adds **SEVEN new tables** (`document_types` config master — clarify Q2 — `documents`,
`document_requirements`, `rates`, `billing_items`, `billing_adjustments` — the BILL-004 typed line table — and
`export_batches`, mirroring 004's `import_batches`) and **THREE new enums** (`document_verification_status`,
`export_batch_status` mirroring `import_batch_status`, `billing_adjustment_type`); `export_batches.format`/
`billing_items.dispute_status` are **CHECK text** and `document_types` is a **config table** (not enums). Crucially there
is **NO `trips` ALTER** — **billing lifecycle status is the `billingStatus(current_status)` projection** slice 003 already
defines (FR-011), and the new tables FK *to* `trips`. **Completion and Billing Ready are transitions on the existing 003
status machine**: `markCompleted`/`markBillingReady` gather context, call the **pure** `evaluateCompletionReadiness`/
`evaluateBillingReadiness` (`@brazil-tms/shared` — the §19.3/§19.4 gates, a Vitest focus), then drive the change through
the **reused `transitionTripStatus`** (concurrency guard + `trip_events` + `trip.status_change` audit) — completion
auto-advances to `billing_pending` (§11.6) and creates the billing item. A missing required document is satisfied by an
**accepted upload OR an audited per-document "unavailable-with-reason" waiver** recorded inside the gated transition
(clarify Q3). Billing values are a **computed projection** (`computeBillingValues`), never stored. Binaries live in
**Supabase Storage** via the existing `packages/db/src/storage.ts` client (extended with `documents`/`billing-exports`
buckets); uploads are validated to **PDF/JPG/PNG ≤ ~10 MB** (configurable, clarify Q4). It adds **NO new permission key,
package, worker process, or runtime dependency** (ExcelJS emits both CSV+XLSX): authorization **first-enforces**
`upload_documents` (Admin/Ops/Dispatcher/Control-Tower/Fleet-Coord/Finance), `verify_documents` (Admin/Ops/Finance),
`mark_completed` (Admin/Ops/Control-Tower), `mark_billing_ready` (Admin/Finance), `edit_rates` (Admin/Finance),
`export_billing` (Admin/Finance), and **reuses** `manage_commercial_data` for document requirements + the document-type
master (reads + document download stay on `view_all_trips`; export-file download on `export_billing`) — mirroring
004/`import_trips`, 005/`view_all_trips`, 006/`assign_resources`, 007/exception keys. The worker gains **TWO jobs** on the
existing pg-boss queue: an **on-demand `billing.export`** (heavy ExcelJS generation off the request path, durable
`export_batches` status, trips `billing_ready → billed`) and a **scheduled `documents.checks`** sweep (the **second**
scheduled job, ~5-min `DOCUMENT_CHECKS_CRON`, lighting up the two §17 cases idempotently via the 007 store). New
**services** in `@brazil-tms/db` (documents, requirements/types, rates, billing-items, completion, export) mirror 003's
`transitionTripStatus`/`cancelTrip` transaction pattern; the 003 status machine + `billingStatus` projection, 002 master
data + `manage_commercial_data`, the 004 Storage client + worker/queue + `import_batches` pattern, the 005 read models +
UI shell, and the 007 `alerts` store are reused, **NOT redefined**; `trip_events`/`audit_logs` stay append-only; the
seven tables mutate but are soft-deleted/retained, never hard-deleted; audited as `document.upload`/`verify`/`waive`/
`archive`, `document_requirement.*`, `document_type.*`, `rate.*`, `billing_item.update`, `billing.export` (completion/
billing-ready reuse `trip.status_change`). New work: the 7 tables + 3 enums + indexes (migration `0007`, **no `trips`
ALTER**), the documents + billing pure modules + `billing/jobs` + `documents/jobs` + ~4 Zod files, ~6 `db` services +
read-model fills (`completedMissingDocuments`, documents/billing detail, billing lists, export history), ~18 BFF
endpoints, the two worker jobs, the two Storage buckets, and the 005-shell fills (Trip-Detail documents/billing sections,
"Missing documents" view, dashboard widget) + Documents/Billing/rate-admin/document-requirement-admin screens. It builds
on `specs/001-platform-access-shell/` (auth, audit, i18n, the six permission keys it first-enforces, the Supabase
server/Storage client), `specs/002-master-data-config/` (customers/lanes/vehicle types; `manage_commercial_data`),
`specs/003-trip-domain-lifecycle/` (the `trip_status` machine, `transitionTripStatus`, the `billingStatus` projection,
append-only logs), `specs/004-trip-import-validation/` (the `import_batches` durable-batch + worker/pg-boss +
`packages/db/src/storage.ts` patterns), `specs/005-control-tower/` (board/detail/dashboard read models + view registry +
the UI shell it fills), and `specs/007-execution-events-exceptions/` (the in-app `alerts` store it feeds; the
attachment-storage surface it provides). Open items are **gated business inputs — configurable defaults + blocked
sign-off, not invented** (Constitution II): per-customer required proof documents (§29 Input #3 — `DEFAULT_DOCUMENT_
CHECKLIST` + per-customer document-checklist sign-off **blocked** until supplied), the finance billing export format
(#4 — labeled default column set + export sign-off **blocked**), and per-customer billing rules for toll/waiting-time/
penalty/cancellation (#5 — manual values + billing-rule sign-off **blocked**).
<!-- SPECKIT END -->
