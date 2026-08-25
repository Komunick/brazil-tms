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
Active feature plan: `specs/026-pre-sm-logae/plan.md` (Pré-SM criada sozinha ao atribuir — a
integração com a gerenciadora Logae). Levantamento medido e decisões de negócio em
`docs/PROPOSTA-PRE-SM.md`; as três decisões difíceis em `specs/026-pre-sm-logae/research.md`.

**O que a fatia faz**: quando a ordem de atribuição volta confirmada do portal, o worker cria a
pré-solicitação de monitoramento na Logae via `setPreSMdeModelo` (NÃO o `setPreSM` completo, que
exigiria espelhar cidades com IBGE, cliente e filial). Fica em Pré-SM, sem efetivar.

**ARMADILHAS desta fatia** — as cinco que quebram de verdade:

1. **O CHECK recusa.** `ownership_type` ganha `agregado` e `terceiro`, mas `vehicles`, `trailers` e
   `drivers` têm cada um um CHECK que amarra `subcontracted` a ter `carrier_id` e `owned` a não ter.
   Sem reescrever os três na MESMA migração, a migração passa e o primeiro `update` é recusado. A
   forma nova não enumera valores: `owned` sem transportadora, todo o resto com.
2. **`subcontracted` fica dormente e significa "ainda não classificado"**, nunca erro — Postgres não
   remove valor de enum, e 1.246 veículos + 405 motoristas estão assim. Sem mutirão de cadastro: a
   classificação acontece pelo uso, no diálogo de atribuição. Mesma técnica do `trip_status` na 015
   (valor fora do tipo TS, coluna fixada com `.$type<>()`).
3. **Duplicata custa dinheiro** — a gerenciadora cobra por solicitação. Índice único **parcial**
   (`WHERE status IN ('pendente','criada')`), e o enfileiramento só quando `encerrarOrdemDoPortal`
   devolver `true` (ele já é idempotente: `WHERE status = 'sent'`). Parcial de propósito: se
   cobrisse tudo, uma Pré-SM cancelada travaria a viagem para sempre.
4. **Não há ambiente de teste.** Homologação responde `CodErro 100 — USUARIO INVALIDO` (medido
   25/08). A feature nasce DESLIGADA por `INTEGRA_PRE_SM_ATIVO`, com teto diário começando em zero,
   e o cancelamento (`setCancelaPreSM`) entra na MESMA fatia da criação — é a única forma de
   desfazer.
5. **A credencial some no próximo deploy** se for só para o `.env.local`: vai no `devops/config.env`,
   que é a fonte do `gen-env.sh`. Ler `docs/OPERACAO.md` antes.

**Vínculo A/F/T**: `owned`→F, `agregado`→A, `terceiro`→T. Pré-selecionado pelo `CNPJProprietario` que
`getVeiculo`/`getCarreta` devolvem (CNPJ raiz `03571231` = nosso → F; valor com zeros à esquerda =
CPF, pessoa física, nunca F). Motorista NÃO é derivável — `getMotorista` não devolve vínculo nem
empregador, então nasce em branco.

**Rota → modelo**: tabela `pre_sm_route_models` com `confirmado_em`; a carga PROPÕE, uma pessoa
CONFIRMA, e só linha confirmada cria Pré-SM. O casamento por nome precisa das quatro tolerâncias
(acento, parênteses, sigla colada a número, zero à esquerda) — sem a última, 4 rotas e 233
viagens/mês caem como "sem modelo".

**Fora de escopo**: efetivar (`setEfetivaPreSM`), alterar Pré-SM quando a atribuição muda (só avisa),
cancelamento automático ao cancelar a viagem, documentos/ajudante/temperatura, `setPreSM` completo, e
usar o `DataVencCNH` para o problema de CNH vencida (fatia própria).
<!-- SPECKIT END -->
