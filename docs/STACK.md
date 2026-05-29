# Brazil Transports - Tech Stack & Infra Reference

## 1) Product Context

This project implements a linehaul execution management system for Brazil Transports.

Brazil Transports receives pre-planned trips from customers such as Shopee, DHL eCommerce, and Mercado Livre. The product is focused on execution control, not route optimization.

Primary workflows:

- Import customer trip plans.
- Normalize and validate trips.
- Assign drivers, vehicles, trailers, and carriers.
- Track execution milestones.
- Manage exceptions and delays.
- Store proof-of-execution documents.
- Prepare billing-ready exports.
- Report SLA, exception, and billing performance.

---

## 2) High-Level Architecture

Recommended architecture:

**Next.js operational web app + BFF**, backed by **Supabase Postgres/Auth/Storage**, with a dedicated **background worker** for imports, exports, validations, alerts, and other long-running operational jobs.

Primary data access pattern:

- Web UI -> Next.js BFF (`/app/api/*`) -> Supabase Postgres/Auth/Storage
- Web UI -> Next.js BFF, polled via TanStack Query for list and dashboard freshness
- Next.js BFF -> Postgres job queue -> Worker process
- Worker process -> Supabase Postgres/Storage

Do not put heavy operational work directly inside request/response handlers when it can exceed normal web request expectations.

Examples of worker-owned jobs:

- Trip file import and validation.
- Duplicate detection.
- Customer template parsing.
- Billing export generation.
- Missing document checks.
- SLA risk recalculation.
- Alert generation.
- Future customer API polling or sync jobs.

Non-goals:

- Do not build a route optimization engine for MVP.
- Do not split into many microservices early.
- Do not use Supabase Edge Functions for this project unless a later architecture review explicitly changes this decision.
- Do not depend on Supabase Realtime. It is not reliable enough on self-hosted Supabase; use polling for freshness (see 3.10).

---

## 3) Stack

### 3.1 Web App

- **Next.js App Router**
- **TypeScript**
- **React Server Components** where useful for server-rendered pages
- **Client Components** for interactive operational surfaces such as dispatch board, filters, drawers, modals, and live trip views
- **Next.js Route Handlers** for BFF endpoints under `/app/api/*`

Rationale:

- Strong fit for a web-first operations product.
- Keeps the BFF close to the UI.
- Allows server-only use of privileged Supabase keys.
- Matches the stack already used in related work.

### 3.2 UI

- **Tailwind CSS**
- **shadcn/ui**
- **lucide-react** for icons
- **TanStack Table** for dense operational tables

UI direction:

- Dense but readable.
- Desktop-first for dispatch, control tower, finance, and management.
- Responsive enough for tablet and mobile document upload.
- Avoid marketing-style layouts; this is an operational control system.

### 3.3 Client State and Data Fetching

- **TanStack Query**

Use for:

- Polling trip lists and dashboards.
- Caching detail views.
- Request deduplication.
- Mutations for status changes, assignments, exceptions, document verification, and billing actions.

Polling via TanStack Query is the only freshness mechanism. Use it for all lists, dashboards, and detail views, with intervals tuned per surface (shorter for active control tower views, longer for slow-moving lists). The app does not depend on Supabase Realtime (see 3.10).

### 3.4 Validation and Domain Schemas

- **Zod**

Use for:

- API input validation.
- Import row validation.
- Shared form schemas.
- Internal job payload validation.
- Customer import template mapping validation.

Keep shared schemas in a package that can be reused by the web app and worker.

### 3.5 Time and Dates

- **Luxon**
- Canonical business timezone: **America/Sao_Paulo**
- Store timestamps in UTC.
- Display operational times in `America/Sao_Paulo` unless a customer-specific rule says otherwise.

Rules:

- All planned and actual trip timestamps must preserve timezone intent.
- Importers must normalize customer-provided dates explicitly.
- Avoid implicit JavaScript `Date` parsing for customer files.

### 3.6 Backend Platform

Recommended default for MVP and first production:

- **Self-hosted Supabase official Docker setup**

Recommended services:

- Postgres
- Auth
- Storage

Rationale:

- Full control over infrastructure, data residency, and upgrade timing.
- Supports customer contract and data residency constraints without renegotiation.
- Predictable cost as operational volume grows.
- Keeps the entire stack (app, worker, database) deployable on owned infrastructure.

Self-hosting requires discipline: proper backup, monitoring, and upgrade procedures must be in place before production use.

Realtime and Edge Functions are intentionally excluded from this stack because they are the least reliable parts of self-hosted Supabase. Freshness is handled by polling (see 3.10); long-running and event-driven work is handled by the worker (see 3.11).

Acceptable alternative:

- **Supabase managed project**

Use the managed project only if the team needs to reduce operational burden during early MVP, or if backup, monitoring, and upgrade discipline for a self-hosted stack cannot yet be guaranteed. Keep the migration path between self-hosted and managed open by avoiding managed-only features.

### 3.7 Database

- **Postgres**
- Supabase migrations or SQL migration tooling
- Row Level Security is deferred for MVP — all access is server-side via the BFF (see 5.2)

Core database areas:

- Customers
- Locations
- Lanes
- Trips
- Trip assignments
- Drivers
- Vehicles
- Trailers
- Carriers
- Trip events
- Exceptions
- Documents
- Rates
- Billing items
- Import batches
- Export batches
- Audit logs

Design principles:

- Keep original customer plan values separate from executed values.
- Use immutable event/audit records for critical operational history.
- Prefer explicit status transitions over free-form status strings.
- Model customer-specific mappings instead of hardcoding each customer throughout the app.

### 3.8 Auth and Authorization

- **Supabase Auth**
- Authorization is enforced in the Next.js BFF — the single source of truth for permissions in MVP.
- Postgres RLS is deferred until direct client access exists (see 5.2).

Roles (target set):

- Admin
- Operations Manager
- Dispatcher
- Control Tower
- Fleet Coordinator
- Finance
- Executive Viewer
- Customer Viewer (post-MVP, tenant-scoped)

Keep the permission surface minimal: implement a distinct permission set only where role capabilities actually differ, collapsing roles that share permissions until they genuinely diverge. Defer Customer Viewer until tenant scoping ships.

Rules:

- Treat the Supabase anon key as public.
- Keep service role key server-only.
- Never expose service role key to browser bundles, mobile clients, logs, or customer-facing scripts.
- Customer Viewer access must be tenant-scoped before release.

### 3.9 File Storage

- **Supabase Storage**

Use for:

- POD files.
- CT-e and MDF-e references or files where applicable.
- Gate receipts.
- Photos.
- Occurrence reports.
- Signed documents.
- Billing support documents.

Rules:

- Store file metadata in Postgres.
- Store binary files in object storage.
- Do not store documents directly inside Postgres.
- Document access must follow trip/customer permissions.

### 3.10 Realtime

- **Not used.** The app does not depend on Supabase Realtime on any host.

Reason:

- Self-hosted Realtime is a separate service with WAL/replication, scaling, and reconnection concerns, and is one of the least reliable parts of the self-host stack.
- This is an internal, desktop-first operations tool where polling is sufficient.

Instead, use polling via TanStack Query for:

- Trip detail timeline updates.
- Active control tower views.
- Assignment/status changes on high-value operational boards.

Tune poll intervals per surface. Treat Realtime only as a possible future enhancement, to be reconsidered after a dedicated architecture review; do not build features that require it.

### 3.11 Background Jobs

- **Postgres-backed job queue** — `pg-boss` or `graphile-worker`
- Dedicated **Node.js worker process**
- Scheduling via the queue's built-in cron/repeatable jobs (no separate scheduler service)

Rationale: the queue lives in the Postgres database that already holds durable import/export batch status (see Queue principles below), so there is no separate Redis service to run, secure, back up, or monitor.

Worker responsibilities:

- Parse uploaded trip files.
- Validate import rows.
- Detect duplicates.
- Generate import error reports.
- Generate billing exports.
- Recalculate SLA risk.
- Detect missing documents.
- Generate internal alerts.
- Run scheduled customer sync jobs in later phases.

Queue principles:

- Jobs must be idempotent where practical.
- Long jobs must record progress.
- Failed jobs must record useful error messages.
- Import and export batches must have durable status records in Postgres.

### 3.12 Import and Export Files

Recommended libraries:

- CSV parsing: `csv-parse` or equivalent mature parser.
- XLSX parsing/export: `exceljs` or equivalent mature workbook library.

Rules:

- Customer import templates must be configurable.
- Use one import engine driven by per-customer template configuration; do not build a separate importer per customer.
- Importers should preserve original file and row references.
- Every import creates an import batch record.
- Every billing export creates an export batch record.

### 3.13 Tooling

- ESLint
- Prettier
- TypeScript strict mode
- Vitest for unit tests
- Playwright for critical UI and workflow tests

Recommended test focus:

- Import validation.
- Duplicate detection.
- Status transitions.
- Assignment conflict checks.
- Billing readiness rules.
- Permission checks.

---

## 4) Infrastructure and Deployment

### 4.1 Recommended MVP Infrastructure

For MVP and first production, prefer a self-hosted stack:

- One VPS initially, sized to current operational volume
- Docker Compose stacks:
  1. `infra/supabase/` - Supabase official self-host stack
  2. `infra/app/` - Next.js app
  3. `infra/worker/` - worker process
  4. `infra/caddy/` - public reverse proxy

Self-hosted Supabase components:

- Postgres
- Auth
- Storage
- Studio
- Kong/API gateway

This keeps the database, auth, and storage layer on owned infrastructure alongside the app and worker runtime.

Explicit constraints:

- **Supabase Edge Functions must not be used.**
- **The Realtime service is not enabled.** Freshness comes from polling (see 3.10).

### 4.2 Managed Supabase Alternative

If the managed project is selected instead, use:

- Managed Supabase project for Postgres, Auth, and Storage
- One VPS or app platform for:
  - Next.js app
  - Worker service
  - Redis
  - Caddy reverse proxy, if using VPS

This reduces operational burden on the database, auth, and storage layer at the cost of infrastructure control. Choose it when backup, monitoring, and upgrade discipline for a self-hosted stack cannot yet be guaranteed. The app stays polling-only even on managed, so it remains portable between hosts.

### 4.3 Reverse Proxy

- **Caddy**

Responsibilities:

- TLS termination.
- App routing.
- Supabase gateway routing if self-hosted.
- Studio protection if self-hosted.
- Optional Basic auth for internal admin services.

### 4.4 Suggested Domains

Example production domains:

- `tms.braziltransports.com.br` -> Next.js app
- `api-tms.braziltransports.com.br` -> Supabase gateway, only if direct Supabase access is required
- `studio-tms.braziltransports.com.br` -> Supabase Studio, protected and internal/admin-only

Adjust domains to the actual company domain before deployment.

---

## 5) Security Model

### 5.1 Key Handling

- Supabase anon key is not used for direct browser data access in MVP (no direct client access; see 5.2). If introduced later, only with RLS in place.
- Supabase service role key is server-only.
- Service role key may be used only in:
  - Next.js server runtime
  - Worker process
  - Secure ops scripts

Never expose privileged keys in:

- Browser bundles.
- Mobile bundles.
- Client-side environment variables.
- Logs.
- Uploaded files.
- Customer-facing exports.

### 5.2 Row Level Security

**Deferred for MVP.** All data access is server-side through the BFF, which is the single source of authorization (see 5.3). Adding RLS now would duplicate that logic in SQL for no MVP benefit — the service role key bypasses RLS anyway.

Preconditions that make this safe:

- Do not expose the Supabase API gateway / PostgREST publicly (see 4.4). The BFF is the only path to Postgres.
- Do not use the anon key for direct table access from browser clients.

Introduce RLS when direct client access actually ships:

- Customer portal access.
- Direct mobile access.

At that point RLS becomes the defense-in-depth layer for customer-scoped and other sensitive tables.

### 5.3 Application Permissions

The BFF must enforce role-level permissions for:

- Trip edits.
- Assignment changes.
- Status transitions.
- Exception resolution.
- Document verification.
- Rate edits.
- Billing export.
- User management.

### 5.4 Audit Trail

Audit the following:

- Import confirmation.
- Trip creation and customer updates.
- Manual edits to plan or execution fields.
- Assignment changes.
- Status transitions.
- Exception lifecycle.
- Document verification.
- Billing calculations and adjustments.
- Export batch creation.
- Permission and user changes.

### 5.5 Studio and Admin Access

If self-hosted:

- Protect Supabase Studio with Caddy Basic auth or stronger access control.
- Do not expose Postgres publicly.
- Restrict internal admin services by network rules where possible.

---

## 6) Data and Computation Responsibilities

### 6.1 Web UI

The UI owns:

- Presentation state.
- Filters and saved view selection.
- Local form state.
- Smooth countdowns and relative display helpers.
- Optimistic UI only where rollback is straightforward.

The UI must not own:

- Billing readiness decisions.
- Final SLA classification.
- Assignment conflict authority.
- Permission decisions.
- Customer import parsing rules.

### 6.2 BFF

The Next.js BFF owns:

- Authentication context.
- Role and permission checks.
- API input validation.
- Request-level orchestration.
- Server-only Supabase access.
- Mutations that require audit logging.
- Read models for operational screens.

### 6.3 Worker

The worker owns:

- Long-running imports.
- File parsing.
- Export generation.
- Scheduled checks.
- SLA risk recalculation.
- Alert generation.
- Retryable external integration calls in later phases.

### 6.4 Database

The database owns:

- Durable operational state.
- Constraints.
- Foreign keys.
- Event and audit history.
- Transactional integrity.
- RLS policies.

---

## 7) Repository Conventions

Recommended layout:

```text
docs/
  PRD.md
  STACK.md
  PRINCIPLES.md

apps/
  web/
    app/
    components/
    lib/

packages/
  shared/
    schemas/        # Zod schemas: API input, import rows, job payloads
    domain/         # status machine, SLA + billing rules
    importers/      # config-driven mapping engine + per-customer template config
  db/
    migrations/
    seed/

workers/
  jobs/             # import-trips, billing-export, document-checks, alerts (folders)
  index.ts          # single worker process entrypoint

infra/
  supabase/         # Supabase official self-host stack
  app/
  worker/
  caddy/
```

Use a monorepo from the start (web and worker share schemas, domain, status, and import logic).

Keep the package count minimal:

- Start with two packages: `shared` and `db`. Split further only when a real reuse or versioning boundary appears — not before (PRINCIPLES: abstract after ≥3 real repetitions).
- Importers are **data-driven**: one mapping engine plus per-customer template configuration (PRD CUST-003, INT-002/003). Do not create a code package per customer.
- Background jobs are folders inside the worker, not separate packages.

---

## 8) Operational Notes

### 8.1 Backups

Required:

- Daily Postgres backups at minimum.
- Off-server backup storage.
- Storage/object backup policy.
- Restore test procedure.
- Backup monitoring.

Because the default deployment is self-hosted, backup and restore discipline is mandatory before production use.

### 8.2 Monitoring

Minimum:

- App health check.
- Worker health check.
- Queue health check.
- Database availability check.
- Storage availability check.
- Error logging.
- Failed job visibility.

Recommended alerts:

- App down.
- Worker down.
- Queue backlog above threshold.
- Import job failure.
- Export job failure.
- Database backup failure.
- Storage access failure.

### 8.3 Logging

Log:

- Request errors.
- Worker job starts/failures/completions.
- Import batch failures.
- Export batch failures.
- Integration failures.
- Permission denials for sensitive actions.

Do not log:

- Service role keys.
- Passwords.
- Raw tokens.
- Full sensitive documents.
- Excessive personal data.

---

## 9) Future Integrations

Likely future integrations:

- Customer API ingestion from Shopee, DHL eCommerce, and Mercado Livre.
- Email attachment ingestion for trip plans.
- GPS/telematics providers.
- WhatsApp/SMS/email notification providers.
- ERP/accounting system.
- CT-e/MDF-e document provider, if required.
- OCR/document extraction provider.

Integration rule:

- External integrations should enter through the BFF or worker, not directly from the browser.
- Integration payloads should be recorded with enough metadata to debug disputes and customer data mismatches.

---

## 10) MVP Stack Decision

Use the following for MVP:

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query
- TanStack Table
- Zod
- Luxon with `America/Sao_Paulo`
- Self-hosted Supabase (official Docker setup) for Postgres, Auth, and Storage
- Polling via TanStack Query for freshness; no Supabase Realtime or Edge Functions
- Next.js Route Handlers as BFF; authorization in the BFF, RLS deferred (see 5.2)
- Postgres-backed job queue (pg-boss/graphile-worker) + Node.js worker process
- Caddy for reverse proxy and TLS termination
- Docker Compose for the self-hosted stack: Supabase, app, and worker
- ESLint, Prettier, TypeScript strict mode
- Vitest and Playwright

This stack keeps the product close to patterns already used in related work, while adding the worker and queue layer needed for a real linehaul execution system.
