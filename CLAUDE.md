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
Active feature plan: `specs/027-aba-gr/plan.md` (a aba GR — a Pré-SM feita por uma pessoa, depois da
atribuição). O desenho e as decisões de uso em `docs/PROPOSTA-ABA-GR.md`; as sete decisões difíceis
em `specs/027-aba-gr/research.md`; a API inteira em `docs/INTEGRA-14.2-REFERENCIA.md`.

**A 026 está no `dev` e NÃO deve ser promovida como está.** Ela cria a Pré-SM sozinha via
`setPreSMdeModelo`, e a gerenciadora respondeu por escrito em 25/08: **"Tem que ser pelo setPreSM"**.
A 027 substitui esse miolo. O resto da 026 sobrevive inteiro e **não se reescreve**.

**O que a fatia faz**: a LH atribuída cai numa aba **GR**. A linha mostra o que será enviado (placas,
motorista, vínculos, janela de coleta) e o que falta, com o botão travado enquanto faltar. Envio
**uma por uma**, sem lote. Depois de enviada a viagem **fica** na aba, em seção separada, com o
código e o cancelamento.

**O QUE NÃO SE REESCREVE** (tudo já no `dev`): o vínculo A/F/T e as migrações `0046`/`0047` · a
tabela `trip_pre_sm` e seus estados, incluindo `nao_tentada` · o índice único parcial · o
cancelamento (`setCancelaPreSM`, job + botão) · o aviso de divergência · a tela de conferência de
correspondências · o cliente da Integra em `workers/lib/integra/cliente.ts`.

**O que SOME**: `setPreSMdeModelo` e `getModelosPreSM` no cliente · o job `pre_sm.carregar_modelos` ·
a coluna `cod_modelo`.

**ARMADILHAS desta fatia** — as cinco que quebram de verdade:

1. **Não reescrever a 026.** A tabela do plano diz o que sobrevive. Refazer é retrabalho e risco.
2. **`drizzle-kit generate` NÃO serve aqui.** O journal tem 49 entradas e 27 snapshots: ele diffa
   contra o `0024` e **recria tabelas de produção**. Migração escrita à mão, sempre.
3. **Reusar `tokensDaEstacao`, nunca escrever um segundo normalizador.** A função nova
   (`ufECidadeDaEstacao`) devolve o que aquela descarta. Dois normalizadores divergem **em
   silêncio** — a estação não casa e nenhum erro aparece.
4. **Hora de São Paulo, nunca UTC.** A gerenciadora agenda escolta em hora local; mandar UTC desloca
   toda coleta em três horas, **passa em teste**, e só aparece na estrada.
5. **`subcontracted` não tem letra A/F/T.** Significa "ainda não classificado" — 1.246 veículos e
   405 motoristas estão assim. Vira motivo de bloqueio, nunca um chute.

**A PENDÊNCIA, com dono**: não se sabe como o `setPreSM` amarra a Pré-SM à programação que a Logae já
tem do portal — **não há campo de código de programação em nenhum método de criação**, conferido na
referência. Pergunta em aberto com a gerenciadora. Isso **não bloqueia as etapas 1 a 4**; o formato
do corpo fica isolado em `packages/shared/src/domain/pre-sm-corpo.ts`, e é o único lugar que muda
quando a resposta chegar.

**Validar sem gastar**: não há homologação (`CodErro 100`, medido) e a gerenciadora **cobra por
solicitação**. `getCidades`, `getRotas`, `getCliente` e `getTabela` são leitura e não custam — dá
para carregar tudo e olhar a aba com dados reais antes de existir botão que gaste.

**Fora de escopo**: efetivar (`setEfetivaPreSM`) · envio em lote · alterar Pré-SM quando a atribuição
muda (só avisa) · cancelamento automático ao cancelar a viagem · documentos, ajudante e temperatura ·
criar programação na Logae · ligar a criação automática.
<!-- SPECKIT END -->
