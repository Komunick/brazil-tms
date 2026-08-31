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
Active feature plan: `specs/029-cargos-editaveis/plan.md` — **cargos editáveis, mini perfil e
selos**. O acesso ao TMS deixa de ser catálogo em código e passa a ser dado editável por um admin.

**O NÚMERO QUE JUSTIFICA A FATIA**: dos 34 usuários ativos, **20 são `admin`** (14 `dispatcher`, 1
`operations_manager`, e ZERO nos outros quatro papéis). Quando o papel fixo não coube, a pessoa
virou admin — e hoje 20 pessoas podem apagar arquivo e exportar faturamento porque precisavam ver a
Expedição.

**A DESCOBERTA QUE DEFINE O DESENHO**: `requirePermission(ctx, chave)` já é ponto de estrangulamento
único — **169** dos 231 usos passam por ele; os outros **62** chamam `can(papel, chave)` direto. E
`loadSession` lê a linha do usuário no Postgres **a cada requisição**, não de um token. Por isso
FR-007 (mudança de cargo valer sem sair e entrar) **sai de graça**.

**AS CINCO ARMADILHAS desta fatia**:

1. **Fallback silencioso para o papel antigo.** Sem cargo, o conjunto é **vazio** — nunca
   `ROLE_PERMISSIONS[role]`. O fallback esconderia justamente o defeito que mais importa: tudo
   continuaria funcionando e ninguém saberia que a tabela nova não está sendo lida.
2. **Remover `users.role` nesta leva.** A migração roda com o app ANTERIOR no ar (`deploy.sh` não
   migra), e ele lê a coluna. Derrubá-la derruba a produção. `cargo_id` também nasce NULO, pelo mesmo
   motivo: o app anterior cria usuário sem saber preenchê-lo.
3. **Trava do último admin em quatro lugares.** São quatro caminhos (apagar cargo, tirar a permissão,
   mover a última pessoa, desativá-la) e UMA função pura, chamada de um ponto só, **dentro da
   transação e DEPOIS da escrita** — verificar antes perde a corrida de duas abas.
4. **Alargar a PORTA junto com a COLUNA.** `resource_documents` passa a aceitar `user` no CHECK, mas
   `RESOURCE_DOCUMENT_ENTITY_TYPES` (o vocabulário das rotas de frota) **continua `driver|vehicle`**.
   A foto tem rota própria.
5. **Migração sem entrada no `meta/_journal.json`** é pulada, e o deploy responde sucesso.

**A PROVA DE QUE NINGUÉM PERDE ACESSO** é executável, não é promessa:
`scripts/029-conferir-acesso.ts` compara pessoa a pessoa o conjunto de antes (`ROLE_PERMISSIONS`) com
o de depois (as tabelas), em leitura pura contra produção. **34 de 34 idênticos** antes de qualquer
código novo subir.

**O que NÃO se reescreve**: os 169 `requirePermission` · a fatia **025** (bucket privado, histórico,
link curto), que é onde a foto entra · `nav.ts`, de onde o catálogo de áreas é DERIVADO (um teste
afirma que toda `PermissionKey` aparece em exatamente um lugar da tela, senão a CI cai).

---

**EM ESPERA, e as duas têm data ou dívida:**

**A 028 (pré-cadastro de motorista)** está pausada por decisão do usuário em 31/08 — mas **tem prazo:
10/09/2026**, evento com mais de 50 motoristas e ninguém do escritório. Plano em
`specs/028-fila-cadastro-motorista/plan.md`; o formulário vive em `site-brazil-transports` (outro
repositório) e o TMS entrega para lá o **contrato**, nunca código. Pendências dela: a divergência de
CPF do primeiro cadastro real, e o primeiro `setMotorista` de verdade (que é de graça).

**A 027 (aba GR)** está pausada. E **a 026 está no `dev` e NÃO deve ser promovida como está** — ela
cria a Pré-SM via `setPreSMdeModelo`, e a gerenciadora respondeu em 25/08 que tem de ser pelo
`setPreSM`. A 027 substitui esse miolo; o resto da 026 sobrevive inteiro (vínculo A/F/T, migrações
`0046`/`0047`, `trip_pre_sm`, o cancelamento, a tela de conferência, o cliente da Integra).

**Validar sem gastar**: não há homologação (`CodErro 100`, medido) e a gerenciadora **cobra por
solicitação**. Nada da 029 gasta; tudo das etapas 1 a 4 da 028 também não.

**Ler manual em PDF**: use o **PDF**, não conversão. `pdftotext -layout` + `iconv -f LATIN1`. A
conversão HTML perde tabelas inteiras e já levou a duas conclusões erradas por ausência.
<!-- SPECKIT END -->
