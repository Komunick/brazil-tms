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
Active feature plan: `specs/009-reporting-audit-hardening/plan.md` (Reporting, Audit Views, Hardening, and MVP Acceptance).
For technologies, project structure, BFF/auth patterns, data model, contracts, and setup/test commands,
read that plan and its `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.
This is the **performance-visibility, hardening, and MVP-acceptance close-out** — the **final MVP slice**. Business users
get a **Reports** screen (`Relatórios`) with the three MVP-acceptance reports — **SLA performance by customer/lane/period**
(SLA-005, REP-002), **exception volume & delay reasons** (REP-003), and **billing readiness** (REP-004) — so the
spreadsheet stops being the system of record (§22 Phase 5 exit). It also fills the **audit-history view gap** where not
already embedded (§21.5/§13.12) and **proves the cross-cutting quality bars** for MVP acceptance (§23): permission
coverage (§18/§21.4), audit completeness (§21.5), localization coverage (§21.6), and performance (§21.2), recorded in an
end-to-end **traceability matrix** mapping every §23 criterion to its PRD IDs and owning slice. Freshness is **polling**
(no Realtime). It is **read-only over existing data and adds NOTHING durable**: **NO new table, enum, migration,
permission key, package, worker job, or runtime dependency**. The three reports are **synchronous read-model projections**
in `packages/db/src/trips/reporting.ts` (`querySlaReport`/`queryExceptionReport`/`queryBillingReadinessReport`) over data
slices 003–008 already produce — `trips.sla_status`/`trip_events` (007), `exceptions`+`reason_codes` (007), the
`billingStatus(current_status)` projection (003) + `billing_items.billing_period` (008) — re-exported server-only via
`apps/web/lib/trips/reporting.ts` and called directly from `GET /api/reports/*` (no worker). Per **clarify Q4** the
on-time pickup/arrival **predicate** inlined in `queryDashboardMetrics` is **extracted once** into a shared helper
`onTimeExpr` (`trips/on-time.ts`) consumed by **both** the dashboard and the SLA report — **DRY-for-correctness** so the
two surfaces never diverge (the only extraction; the §23 SLA-state counts come from stored `trips.sla_status`, **never
re-derived** — Constitution III). The **audit-history view EXTENDS** the already-shipped `GET /api/admin/audit-logs` +
`(shell)/admin/audit/` screen (slice 001, gated **`view_audit_log`**, Admin): adds `actorUserId`+`from`/`to`+pagination
filters and an actor-name/entity-label join, widening coverage to the §21.5 record types — it does **not** build a new
audit surface or key; the per-trip embedded timeline (`loadTripDetail`→`audit[]`, 005) stays on `view_all_trips`.
Authorization adds **NO new key**: reports reuse **`view_all_trips`** (all seven internal roles, mirroring the 005
dashboard), the audit view reuses **`view_audit_log`** (Admin), SLA-rule/document-requirement admin stays on
**`manage_commercial_data`** (002); reads are **not audited**. MVP reports are **tabular (TanStack Table) + summary
cards** in pt-BR — **NO charting library** (KISS / no new dep; charts are Later). The **hardening + acceptance pillar**
ships as **tests + deliverable docs**: `e2e/permission-coverage.spec.ts` (holder `2xx` vs non-holder `403` for every
operational/billing mutation across 001–008), `e2e/audit-completeness.spec.ts` (each §21.5 action writes an append-only
`audit_logs` row), an extended `apps/web/lib/messages.test.ts` (no dotted keys; `Reports`/`AuditView` namespaces; all
audit actions have flat labels), a recorded **performance validation** (§21.2 budgets — reports/list < 3 s, detail < 2 s),
and the **§23 traceability matrix** in `contracts/acceptance-and-hardening.md`. Per **clarify Q1**, §29-gated criteria are
**pass-with-blocked-sign-off** (verified on documented defaults, release permitted, sign-off tracked separately — not an
acceptance failure): per-customer SLA rules (§29 #2 → SLA-reporting sign-off **blocked**; report runs on
`DEFAULT_SLA_POLICY` with a visible **provisional** banner) and per-customer document/billing rules (§29 #3/#4/#5 →
billing-readiness-reporting sign-off **blocked**; report runs on the default checklist + manual values with a provisional
banner) — **never invented** (Constitution II). **Period** defaults to the last calendar month in `America/Sao_Paulo`,
bucketed per report (SLA by planned-pickup date, exceptions by `opened_at`, billing readiness by month-of-completion
`billing_period`); **% billing-ready within 24h** = completion→`billing_ready` event gap ≤ 24h (clarify Q3). The default
build ships **NO migration**; existing indexes meet the §21.2 budget at MVP volume — a contingent `0008` index migration
is added **only if** a measured report misses budget (research R6). New work: 3 report read models + the `onTimeExpr`
extraction + the extended `queryAuditLog`; ~4 BFF reads (3 report GETs on `view_all_trips` + the extended audit GET on
`view_audit_log`); the `(shell)/reports/` screen + extended audit screen + a Reports nav entry; `Reports`/`AuditView`
i18n namespaces; and the four hardening suites + traceability matrix. It builds on `specs/001-platform-access-shell/`
(the append-only `audit_logs` + `view_audit_log` + the audit endpoint/screen it extends; i18n/pt-BR; nav registry),
`specs/002-master-data-config/` (`manage_commercial_data`), `specs/003-trip-domain-lifecycle/` (the `billingStatus`
projection + append-only `trip_events`), `specs/005-control-tower/` (the read-model layer, daily dashboard REP-001, nav/
view registries, and REP-005 trip-list export it does **not** duplicate), `specs/007-execution-events-exceptions/` (the
SLA state + exception/reason-code model it reports over), and `specs/008-documents-billing-export/` (the billing items +
completed-missing-documents signal it reports over). Out of scope (Future): lane performance (REP-006), carrier scorecard
(REP-007), profitability/revenue (REP-008), advanced BI / data-warehouse / materialized views, and aggregate-report
export (raw extraction stays 005's REP-005).
<!-- SPECKIT END -->
