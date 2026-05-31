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
Active feature plan: `specs/007-execution-events-exceptions/plan.md` (Execution Events, Exceptions, SLA Risk, and In-App Alerts).
For technologies, project structure, BFF/auth patterns, data model, contracts, and setup/test commands,
read that plan and its `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.
This is the **execution-tracking write surface and SLA/alert engine** over the trip domain: record execution
**milestones** (At Origin → [Loading] → Loaded → In Transit → At Destination → [Unloading] → Unloaded → Completed) and
free-form **notes** on the now-interactive Trip-Detail timeline; log/monitor/resolve **exceptions**
(Open↔Monitoring → Resolved/Cancelled, terminal) with configurable **reason codes**; compute a **server-authoritative
SLA-risk state** (On Track/At Risk/Late/Breached + reasons) on the board, the **"At risk"** view, Trip Detail, and the
dashboard; generate the six in-scope **in-app §17 alerts**; and configure **per-customer SLA rules**. Freshness is
**polling** (no Realtime). It adds **FOUR new tables** (`exceptions`, `reason_codes`, `customer_sla_rules` — PRD §14.1
entities — and the clarified in-app `alerts` store) and **THREE new enums** (`exception_status`/`exception_severity`/
`exception_responsible_party`, the five-value set adding `force_majeure`); `alert_case`/`alert_state`/
`reason_codes.category` are **CHECK text**, and **`trips.sla_status` stays `text`+CHECK (NO new enum)** with a new
sibling **`sla_reasons text[]`** (clarification D4). The `trip_events.exception_id` forward-hook FK is wired and the
**single** event-vocabulary extension is **`note`** (D5 — Loading/Unloading are `status_change`, not a new member). It
adds **NO new permission key, package, or worker process**: authorization **first-enforces** the pre-declared
`update_trip_status` (milestones/notes — Admin/Ops/Dispatcher/Control-Tower), `create_exceptions` and
`resolve_exceptions` (those + Fleet-Coordinator), and **reuses** `manage_commercial_data` for SLA-rule admin (reads +
alert acknowledgement stay on `view_all_trips`) — mirroring 004/`import_trips`, 005/`view_all_trips`,
006/`assign_resources`. SLA authority is **server-side**: a pure `evaluateSlaRisk` evaluator in `@brazil-tms/shared`
(D1 trigger→state map: window-miss⇒Late, else⇒At Risk, Breached unreachable in MVP; D2 worst-state-wins) + a
labeled-configurable `DEFAULT_SLA_POLICY` (warning 60m / tolerance 0m / confirm-cutoff 120m / time-in-status 120m); a
single `recomputeTripSla` writes `sla_status`/`sla_reasons` **synchronously in the mutation tx** (immediate UI truth)
**and** via the **first-ever scheduled worker job** (a ~5-min `pg-boss` cron sweep on the existing 004 worker —
per-trip fault-isolated, `SELECT … FOR UPDATE`, idempotent alert gen/auto-resolve via `ON CONFLICT DO NOTHING` on the
`(trip_id, alert_case) WHERE state IN ('active','acknowledged')` partial-unique). Exception/note/SLA-rule **services** in
`@brazil-tms/db` mirror 003's `transitionTripStatus`/`cancelTrip` transaction pattern; **milestones reuse
`transitionTripStatus`** (the status machine, `trip_events`, master data, 006 assignment/confirmed-at state, and 005
read models are reused, NOT redefined; `trip_events` stays append-only; exceptions/alerts retained, never hard-deleted;
audited as `exception.create`/`update`/`resolve`/`cancel`, `trip.note`, `sla_rule.create`/`update`; milestones reuse
`trip.status_change`). New work: the 4 tables + indexes + `trips`/`trip_events` ALTERs (migration `0006`), the SLA
evaluator + exception-lifecycle modules + `sla/jobs` + ~4 Zod files, ~5 `db` services + read-model fills (4 dashboard
metrics, exception/alert arrays, "At risk" filter), ~12 BFF endpoints, the `sla-sweep` worker job, and the 005-shell
fills (interactive timeline, exception panel, SLA indicator, alerts surface) + Exception Management & SLA-rule admin
screens. It builds on `specs/001-platform-access-shell/` (auth, audit, i18n, permission catalog),
`specs/002-master-data-config/` (customers/lanes; `manage_commercial_data`), `specs/003-trip-domain-lifecycle/` (trip
model, status machine, `transitionTripStatus`, append-only `trip_events` + its `exception_id` hook, `trips.sla_status`
placeholder), `specs/005-control-tower/` (board/detail/dashboard read models + the UI shell it fills), and
`specs/006-dispatch-assignment/` (assignment/confirmed-at state read for missing-assignment/missed-confirmation risk).
Open items are **configurable defaults / deferred slice inputs, not blockers and not invented** (Constitution II):
per-customer SLA rules (§29 Input #2 — company defaults + per-customer SLA sign-off **blocked** until supplied),
per-milestone planned times (time-in-status 120-min default), §17 alert cases 7–8 (deferred to 008/009), and
exception/event attachments (deferred to 008).
<!-- SPECKIT END -->
