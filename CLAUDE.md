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
Active feature plan: `specs/031-motoristas-disponiveis/plan.md` — **a aba "Motoristas disponíveis"
na Torre de Controle**: a planilha PROGRAMAÇÃO SHOPEE FROTA virando lista viva. Quem acabou de chegar
é quem está livre. **Nenhuma tabela, coluna ou migração** — a disponibilidade é conclusão tirada a
cada leitura.

**A DESCOBERTA QUE GOVERNA A FATIA**: `trip_assignments` **NÃO é a fonte de quem está dirigindo**. O
portal é. Medido em 03/09: **49 viagens de 760** têm motorista no portal e nenhuma atribuição nossa
(o inverso é ZERO), e em **18 de 406 pares a atribuição aponta para OUTRA PESSOA** — em todos os 18 o
`ID do motorista (portal)` resolve para o nome do portal, ou seja, a nossa é a versão velha de uma
viagem reatribuída lá. Na janela da aba isso são **67 motoristas invisíveis**. É o mesmo erro que
`placas-do-motorista.ts` já documenta no cabeçalho.

**A segunda armadilha**: "a última viagem" é a que **CHEGA POR ÚLTIMO** — 15 motoristas têm mais de
uma viagem aberta ao mesmo tempo (um deles quatro). É também o que faz o "sai quando entra em viagem"
acontecer sozinho, sem ninguém remover nada.

**Medido**: consulta em **10,9 ms** com varredura de 8 dias, 215 linhas (116 finalizados, 19
cancelados, 80 a caminho), sem índice novo. Polling de 60 s, sem segundo plano — não é leilão.

**Decidido pelo usuário (03/09)**: a janela decide quem ENTRA, só viagem nova faz SAIR, com corte de
7 dias parado (contra a janela estrita, que perderia 20 livres, e contra a permanência sem corte, que
traria 72 parados há +30 dias). E o motorista livre que a atribuição vai recusar **aparece marcado**,
não escondido — são 4 dos 36 finalizados de hoje e ontem.

---

**A 030 (aceite de spot) está NO AR**: `specs/030-aceite-de-spot/plan.md` — **aceitar a oferta de spot no próprio
cartão** que aparece na tela de todo mundo, em dois gestos, mais Ignorar (que limpa só a tela de quem
clicou). O cartão para de sair sozinho em 30 s e **só some quando o PORTAL confirmar**.

**A descoberta que governa a fatia**: quase nada de estado novo é preciso. "Enviado" já é
`portal_commands`, "recusado" já é `status='failed'` + `last_error`, e **"aceito" já é
`customer_fields->>'Aceitação (portal)'`**. Só a **dispensa pessoal** (quem ignorou o quê) não existe
— é a única tabela nova. Copiar "aceita" para coluna nossa é O erro: das 19 ofertas de dois dias,
quase todas foram aceitas **direto no portal**, e a cópia diria "esperando" para sempre.

**Certificado contra produção antes de planejar**: 17 ordens de aceite, 13 concluídas — 11 delas em
LH de oferta de spot, disparadas de **0 a 3 min** depois do aviso (a operação já faz isso à mão).
Mediana de **3 s** do clique à resposta do portal em 396 ordens. As 4 recusas são todas
`131205003 — erro de status de viagem`: **a corrida do leilão**, que não some e por isso o cartão
mostra a recusa em vez de sumir.

**ACEITAR É IRREVERSÍVEL.** Nenhum passo de implementação dispara aceite real — o caminho de escrita
se prova contra viagem que NÃO está `Pending`, onde o guarda recusa antes de qualquer coisa sair.

---

**A 028 (pré-cadastro de motorista) continua sendo O TRABALHO COM DATA**, agora a nove dias:
`specs/028-fila-cadastro-motorista/plan.md` — o pré-cadastro preenchido pelo próprio motorista. O
evento é **10/09/2026**, com mais de 50 motoristas e ninguém do escritório presente.

**O que falta nela:**

1. O **primeiro `setMotorista` de verdade**, que nunca rodou. É **de graça** (decisão D7).
2. A **PR #6 do site** (`site-brazil-transports`), com o `min` nas datas, ainda aberta.
3. A fila tem **três pré-cadastros** e nenhum arquivado. O do **Alexandre é TESTE com dado errado**
   (usuário, 01/09) — a "divergência de CPF" que constava aqui como pendência **não existe**, era
   dado de teste. Falta o usuário dizer se Gabriel e Danilo são reais antes de arquivar.

**ARMADILHAS da 028** — as cinco que quebram de verdade:

1. **A resposta da rota é IDÊNTICA nos três casos de CPF** (novo · já na fila · já é motorista).
   Diferenciar — no corpo, no código ou no tempo — transforma o formulário numa máquina de
   descobrir quem é motorista da empresa. Há teste afirmando isso byte a byte; se cair, não
   "conserte o teste".
2. **O TMS revalida TUDO**, mesmo o que o formulário já validou.
3. **`drizzle-kit generate` NÃO serve aqui.** Migração à mão, renumerada só no merge, e **entrada no
   `meta/_journal.json` é obrigatória** — sem ela a migração é pulada e o deploy responde sucesso.
4. **Descartar ARQUIVA, não apaga** (princípio III). O índice único de CPF é parcial por isso.
5. **Campo não lido fica VAZIO e assinalado, nunca inventado.**

**A divisão entre dois repositórios**: o formulário vive em `site-brazil-transports` (servidor
144.24.36.23, não clonado aqui). O TMS é **banco e API**, e entrega para lá o **contrato**
(`contracts/pre-cadastro.md`), nunca código.

---

## A 029 (cargos editáveis) está ENTREGUE — 59 de 60

`specs/029-cargos-editaveis/`. O acesso deixou de ser catálogo em código: quem manda são as tabelas
`cargos` e `cargo_permissoes`, editáveis em **Sistema → Cargos**. Falta só a **T036**, a conferência
à mão na tela, que é do usuário.

**O que era, e por que mudou**: dos 34 usuários ativos, **20 eram `admin`** — porque o catálogo vivia
em código e quem precisava de uma combinação inexistente virava admin. E o motivo que olha para a
frente (usuário, 31/08): **vão entrar sistemas de outros setores no TMS**.

**O QUE NÃO SE REESCREVE, e o porquê de cada um:**

- **`requirePermission` é o ponto único de autorização.** 169 chamadas passam por ele e não foram
  tocadas. `can` recebe o CONJUNTO (`Principal`), nunca o papel — a troca de assinatura foi o que
  fez o compilador achar os 62 pontos diretos, e é o que impede um segundo caminho de decisão.
- **Sem cargo ⇒ conjunto VAZIO**, nunca `ROLE_PERMISSIONS[role]`. Um fallback faria tudo continuar
  funcionando se a leitura do cargo quebrasse. `apps/web/lib/auth/sem-cargo.test.ts` tranca isso.
- **`ROLE_PERMISSIONS` é SEMENTE**, fora do caminho de execução: a migração `0060` foi semeada dela,
  e `db:conferir-acesso` a usa como o lado "antes" da comparação.
- **A trava do último admin é UMA função + UM ponto**, contada no banco **depois da escrita** —
  contar antes perde a corrida de duas abas. Vale para os quatro caminhos do FR-010.
- **`users.role` continua vivo** e não decide nada. Removê-lo é fatia futura: o deploy migra ANTES
  do build, e durante o build o app antigo ainda serve.
- **Selo nunca concede acesso**, e `selos.test.ts` prova por CONSTRUÇÃO (varre o código procurando o
  vocabulário de acesso), não por exemplo.
- **A foto usa a máquina da 025** (bucket, chave, link curto) mas NÃO o serviço de frota: alargou-se
  a COLUNA (`entity_type` aceita `user`) e **não** a PORTA (`RESOURCE_DOCUMENT_ENTITY_TYPES`).

**Dois padrões que esta fatia deixou, e que voltam a morder:**

- **Teste que lê código-fonte precisa ignorar COMENTÁRIO.** Aconteceu duas vezes: a asserção pegava a
  frase que explica a regra, e "consertar" seria apagar o porquê.
- **Teste prova o que se entende; SIMULAÇÃO revela o que não se entende.** A migração rodada no dev
  dentro de uma transação desfeita achou uma pessoa ficando sem cargo (`customer_viewer`), e rodar a
  consulta da sessão pelo drizzle achou uma data voltando como string num campo tipado `Date`.

---

**A 027 (aba GR) está PAUSADA**, não cancelada. E **a 026 está no `dev` e NÃO deve ser promovida como
está** — ela cria a Pré-SM via `setPreSMdeModelo`, e a gerenciadora respondeu em 25/08 que tem de ser
pelo `setPreSM`. A 027 substitui esse miolo; o resto da 026 sobrevive inteiro.

**Validar sem gastar**: não há homologação (`CodErro 100`, medido) e a gerenciadora **cobra por
solicitação**. Nada da 029 gasta; as etapas 1 a 4 da 028 também não.

**Ler manual em PDF**: use o **PDF**, não conversão. `pdftotext -layout` + `iconv -f LATIN1`.

**O tmsdev não tem viagem do dia** (o banco parou de ser alimentado em 29/08; os robôs escrevem em
produção). Painel vazio lá é falta de dado, não regressão.
<!-- SPECKIT END -->

**O PERFIL FICOU ÓRFÃO POR ALGUMAS HORAS, e o guarda que sobrou disso vale saber**: os componentes
do mini perfil existiam e nenhuma tela os importava — `grep` só devolvia a própria definição. Hoje o
nome é clicável na lista de Usuários e na BARRA DE TOPO (que é por onde se troca a própria foto), e
`lib/ui/componentes-tem-dono.test.ts` cai se algum voltar a ficar sem dono.

Foi o quinto caso de `dado-capturado-e-nunca-mostrado` no projeto: "o código faz X" não prova que
alguém VÊ X. Marcar tarefa porque o ARQUIVO existe é como se erra.
