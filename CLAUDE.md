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
Active feature plan: `specs/005-control-tower/plan.md` (Control Tower, Trip List, Trip Detail, and Daily Dashboard).
For technologies, project structure, BFF/auth patterns, data model, contracts, and setup/test commands,
read that plan and its `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.
This is the **read/operating surface** over the trip domain: a dense Trip Control Tower list (server-side
search/filter/sort/paginate, default = active/open trips), a Trip Detail page, a Home daily dashboard, a synchronous
capped CSV export, and inline editing of live planned fields before completion. It is read-first — freshness is
**polling via TanStack Query** (no Realtime) — and adds **NO new table, enum, package, worker, or permission key**:
authorization reuses the pre-declared `view_all_trips` (granted to all 7 internal roles in 001 but never enforced),
which 005 **enforces for the first time**, re-gating the trip read endpoints from `manage_trips` → `view_all_trips`
(edits keep `manage_trips`). The one write — operational-field edits — **reuses 003's `updateTripPlan`** (immutable
plan, post-`confirmed` REVIEW_REQUIRED gate, `trip.plan_update` audit) plus a thin BFF "before completion" guard; it
does NOT redefine the status machine, billing projection, or audit. New work is read models in `@brazil-tms/db`
(board/detail/dashboard/export), one index (`trips_pickup_start_idx`), a trip-board Zod schema + active-status helper
in `@brazil-tms/shared`, ~5 BFF endpoints, and the three screens. Per the clarified spec (option B), the four
TRIP-002 dimensions owned by later slices (assigned driver/vehicle/carrier → 006; SLA risk → 007) are NOT built —
006/007 add their own filters/indicators; Trip Detail shows labelled placeholder sections for assignment/exceptions
(006/007) and documents/billing (008). It builds on `specs/001-platform-access-shell/` (auth, audit, i18n, app shell,
permission catalog), `specs/002-master-data-config/` (customers/locations/lanes used as filters + names), and
`specs/003-trip-domain-lifecycle/` + `specs/004-trip-import-validation/` (the trip model, status machine, plan-update
service, and import batches it consumes read-only). Seven items remain BLOCKED on business inputs / upstream slices
(SLA-risk thresholds → 007/§29#2; assignment dims → 006; billing & document detail → 008/§29#3–5; "Limited" edit
scope → §18; saved-views-by-role mapping; export-cap value) — scaffolded as labeled documented defaults, not invented.
<!-- SPECKIT END -->
