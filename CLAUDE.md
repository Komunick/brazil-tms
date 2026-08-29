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
- `docs/OPERACAO.md` — **a máquina ligada**: as três fontes de dado (robôs), onde cada deploy roda,
  segredos, o que o deploy NÃO faz, os jobs do worker e o diagnóstico de "parou de chegar dado".
  Leia antes de tocar em produção — `devops/` não é versionado, então essa história só existe ali.
- `docs/SPEC-SLICING.md` — how the PRD is sliced into 9 Spec Kit features (+ ownership matrix).
- `docs/PROPOSTA-PRE-SM.md` — **proposta, nada implementado**: criar a Pré-SM na Logae ao atribuir,
  via `setPreSMdeModelo`. Traz os números medidos em produção e as três decisões de negócio, todas
  com caminho definido — inclusive o vínculo A/F/T, que vira campo no diálogo de atribuição.
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
Active feature plan: `specs/028-fila-cadastro-motorista/plan.md` — o **pré-cadastro de motorista
parceiro**, preenchido pelo próprio motorista. **Tem prazo: 10/09/2026**, um evento com mais de 50
motoristas e ninguém do escritório presente.

O desenho e a API em `docs/PROPOSTA-CADASTRO-MOTORISTA.md`; o que foi medido em
`specs/028-fila-cadastro-motorista/research.md`; **o contrato para o outro repositório** em
`contracts/pre-cadastro.md`.

**O QUE TEM DATA são as etapas 1 e 2** — a rota que recebe e a fila. Leitura da CNH, conferência,
envio à gerenciadora e automação são P2/P3 e **não podem bloquear o evento**.

**A DIVISÃO ENTRE DOIS REPOSITÓRIOS**: o formulário vive em `site-brazil-transports` (servidor
144.24.36.23, não clonado aqui). O TMS é **banco e API**. Este repositório entrega para lá o
**contrato**, nunca código.

**ARMADILHAS desta fatia** — as cinco que quebram de verdade:

1. **A resposta da rota é IDÊNTICA nos três casos de CPF** (novo · já na fila · já é motorista).
   Diferenciar — no corpo, no código ou no tempo — transforma o formulário numa máquina de
   descobrir quem é motorista da empresa. Há teste afirmando isso byte a byte; se ele cair, não
   "conserte o teste".
2. **O TMS revalida TUDO**, mesmo o que o formulário já validou. Uma requisição feita fora do site
   chega igual à feita por dentro.
3. **`drizzle-kit generate` NÃO serve aqui.** O journal diffa contra o `0024` e **recria tabelas de
   produção**. Migração escrita à mão, e renumerada só no merge.
4. **Descartar ARQUIVA, não apaga** — princípio III da constituição. O índice único de CPF é
   parcial justamente por isso.
5. **Campo não lido fica VAZIO e assinalado, nunca inventado.** Um valor plausível e errado é pior
   do que um vazio, porque ninguém confere o que parece certo.

**O QUE JÁ EXISTE E NÃO SE REESCREVE**: a fatia **025** (bucket privado, histórico, link curto) —
as fotos entram por ali · `drivers.ownershipType` é o vínculo A/F/T · `drivers` já tem nome, CPF,
telefone e CNH · as decisões da fatia **021** sobre leitura de documento são herdadas e ampliadas.

**Descoberto em 29/08, relendo o manual do PDF em vez da conversão HTML** (53 métodos contra 62):
o `setMotorista` **tem** um bloco `Documentos` em Base64 — dá para anexar arquivo pela API, ao
contrário do que se afirmava. E há campos de fallback para quando o código IBGE não é conhecido.
**O toxicológico continua não existindo em lugar nenhum do manual** — capturar e marcar como ação
manual, nunca inventar endpoint.

**Ler manual em PDF**: use o **PDF**, não conversão. `pdftotext -layout` + `iconv -f LATIN1`. A
conversão HTML perde tabelas inteiras e já levou a duas conclusões erradas por ausência.

---

**A 027 (aba GR) está PAUSADA**, não cancelada: `specs/027-aba-gr/plan.md`. E **a 026 está no `dev`
e NÃO deve ser promovida como está** — ela cria a Pré-SM via `setPreSMdeModelo`, e a gerenciadora
respondeu em 25/08 que **tem de ser pelo `setPreSM`**. A 027 substitui esse miolo; o resto da 026
sobrevive inteiro e não se reescreve (vínculo A/F/T, migrações `0046`/`0047`, `trip_pre_sm`, o
cancelamento, a tela de conferência, o cliente da Integra).

**Validar sem gastar**: não há homologação (`CodErro 100`, medido) e a gerenciadora **cobra por
solicitação**. Tudo das etapas 1 a 4 da 028 não gasta nada.
<!-- SPECKIT END -->
