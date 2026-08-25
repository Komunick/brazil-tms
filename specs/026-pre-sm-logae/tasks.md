# Tasks: Pré-SM criada sozinha ao atribuir

**Feature**: `026-pre-sm-logae` | **Spec**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md)

**Base**: `docs/PROPOSTA-PRE-SM.md` (números medidos), [research.md](./research.md) (R1–R6),
[data-model.md](./data-model.md), [contracts/integra-pre-sm.md](./contracts/integra-pre-sm.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]** = paralelizável (arquivo diferente, sem dependência pendente)
- **[USn]** = a história da spec que a tarefa serve

## Path Conventions

Monorepo: `apps/web` (Next), `packages/shared` (domínio puro), `packages/db` (schema + acesso),
`workers/` (o worker pg-boss). Estrutura desta fatia definida em [plan.md](./plan.md).

## Ordem, e por quê

A ordem do plano não é a das prioridades da spec: **US2 (o vínculo) vem primeiro** porque é o maior
risco de banco e entrega valor sozinha — o cadastro passa a distinguir agregado de terceiro, o que
hoje ninguém sabe. US1 depende dela.

---

## Phase 1: Setup

**Purpose**: o que precisa existir antes de qualquer código, e o interruptor que mantém a feature
inofensiva enquanto ela não estiver provada.

- [X] T001 Registrar `INTEGRA_LOGIN`, `INTEGRA_SENHA`, `INTEGRA_PRE_SM_ATIVO` (padrão desligado) e `INTEGRA_PRE_SM_TETO_DIARIO` (padrão `0`) em `apps/web/.env.example` e no bloco do worker, documentando cada uma
- [ ] T002 Acrescentar as mesmas quatro variáveis ao `devops/config.env` e ao bloco correspondente do `devops/gen-env.sh` na VM — **não versionado**; ver `docs/OPERACAO.md`. Pôr só no `.env.local` NÃO segura: o próximo deploy o regenera a partir do `config.env`
- [X] T003 [P] Registrar em `docs/OPERACAO.md` a nova integração: o que é, onde as credenciais moram, e que a feature nasce desligada

**Checkpoint**: as variáveis existem nos dois ambientes e sobrevivem a um deploy.

---

## Phase 2: Foundational (bloqueia tudo)

**Purpose**: a migração e o schema. Nenhuma história pode começar antes disto.

**⚠️ É a etapa de maior risco desta fatia.** Ler [data-model.md](./data-model.md) inteiro antes.

- [X] T004 Acrescentar `agregado` e `terceiro` ao `ownershipType` em `packages/db/schema/enums.ts`, mantendo `subcontracted` no enum como **valor dormente** — Postgres não remove valor de enum, e 1.246 veículos + 405 motoristas o carregam hoje
- [X] T005 Criar o tipo TypeScript restrito (`owned` | `agregado` | `terceiro`) em `packages/shared/src/schemas/master-data.ts`, **sem** `subcontracted`, e fixar as colunas de `vehicles`, `trailers` e `drivers` com `.$type<>()` — mesma técnica do `trip_status` na 015
- [X] T006 Reescrever os três CHECKs em `packages/db/schema/{vehicles,trailers,drivers}.ts` para `(ownership_type = 'owned' AND carrier_id IS NULL) OR (ownership_type <> 'owned' AND carrier_id IS NOT NULL)` — **sem isto a feature quebra no primeiro update**: `agregado` não satisfaz nenhum braço da regra atual e o banco recusa a linha
- [X] T007 [P] Criar `packages/db/schema/trip-pre-sm.ts` com o enum `pre_sm_status` (`pendente`, `criada`, `recusada`, `sem_dados`, `cancelada`) e as colunas de `data-model.md` §3
- [X] T008 [P] Criar `packages/db/schema/pre-sm-route-models.ts` com `confirmado_em` anulável e único em `(origem_norm, destino_norm)`
- [X] T009 Gerar a migração `--custom` (**0046** hoje) com: `ADD VALUE` dos dois valores, os três `DROP`/`ADD CONSTRAINT`, as duas tabelas, e o índice único **PARCIAL** `WHERE status IN ('pendente','criada')`. Parcial de propósito: cobrindo todos os estados, uma Pré-SM cancelada travaria a viagem para sempre
- [X] T010 Rodar a migração no banco de **dev** e conferir que um `update` para `agregado` passa — o teste que prova o T006. Medido em 25/08: no PG 16 o `ADD VALUE` e a reescrita do CHECK cabem na mesma transação, porque o CHECK novo só cita `'owned'`
- [X] T011 Varrer `packages/`, `apps/web/` e `workers/` confirmando que nada trata `subcontracted` como erro: ele significa **"ainda não classificado"**. Sem mutirão de cadastro — a classificação acontece pelo uso (FR-010)

**Checkpoint**: migração aplicada no dev, os três valores gravam, o cadastro existente intacto.

**⚠️ Renumerar a migração no merge, nunca antes.**

---

## Phase 3: User Story 2 — O vínculo é escolhido por quem sabe (P1)

**Goal**: quem atribui vê o vínculo pré-preenchido, corrige se preciso, e não é perguntado de novo.

**Independent Test**: atribuir um veículo nunca classificado, ver a sugestão, trocar, salvar; atribuir
de novo e conferir que o valor volta sem perguntar.

- [X] T012 [P] [US2] Escrever em `packages/shared/src/domain/pre-sm.ts` a tradução `ownership_type` → vínculo da gerenciadora (`owned`→`F`, `agregado`→`A`, `terceiro`→`T`, `subcontracted`→**nada**), com teste em `pre-sm.test.ts`
- [X] T013 [P] [US2] Escrever em `packages/shared/src/domain/pre-sm.ts` a regra que deriva o vínculo sugerido a partir do `CNPJProprietario`: CNPJ de raiz `03571231` → frota própria; valor com zeros à esquerda (CPF) → nunca frota própria; outro CNPJ → sem sugestão. Com teste
- [X] T014 [US2] Acrescentar `getVeiculo` e `getCarreta` ao cliente em `workers/lib/integra/cliente.ts` — feito na Fase 4, junto do resto do cliente
- [ ] T015 [US2] **CANCELADA — o desenho mudou, e não há o que fazer.** O plano pedia o BFF expondo a sugestão do dono, o que exigiria a credencial de produção da Logae dentro do app web, furando a regra de segredos. A sugestão pelo `CNPJProprietario` continua possível, mas como trabalho do worker gravando o resultado — e ficou **fora desta fatia**: o pré-preenchimento pelo que já está no cadastro (Fase 3) já entrega o valor da história, e a pessoa responde uma vez por recurso de qualquer jeito. Na Fase 3 o pré-preenchimento vem de `GET /api/fleet/vinculos`, **sem nenhuma chamada externa**
- [X] T016 [US2] Acrescentar o campo de vínculo ao `apps/web/components/trips/portal-assign-dialog.tsx`, um por recurso (veículo, cada carreta, cada motorista), pré-selecionado pela sugestão e **em branco para motorista** — a gerenciadora não informa vínculo de motorista, e um palpite ali seria invenção
- [X] T017 [US2] Gravar o vínculo escolhido no recurso ao confirmar a atribuição, em `packages/db/src/trips/pre-sm.ts`, registrando de onde veio a sugestão (FR-011) — sem a evidência, a próxima pessoa não tem como conferir por que aquele valor está lá
- [X] T018 [US2] Não voltar a perguntar quando o recurso já estiver classificado (FR-010), em `apps/web/components/trips/portal-assign-dialog.tsx`
- [X] T019 [P] [US2] Textos em `apps/web/messages/pt-BR.json`

**Checkpoint**: o cadastro passa a distinguir agregado de terceiro. **Entrega valor sem a
gerenciadora** — pode ser promovido sozinho.

---

## Phase 4: A correspondência rota → modelo

**Purpose**: sem isto, não há como saber qual modelo usar. Serve US1 e US3.

- [X] T020 [P] Escrever em `packages/shared/src/domain/pre-sm-modelos.ts` o casamento por nome normalizado, com as **quatro** tolerâncias: acento, conteúdo entre parênteses, sigla colada a número, e **zero à esquerda**. Sem a última, 4 rotas e 233 viagens/mês caem como "sem modelo" — medido
- [X] T021 [P] Teste em `pre-sm-modelos.test.ts` cobrindo as quatro tolerâncias, cada uma com um caso real do levantamento
- [X] T022 Acrescentar `getModelosPreSM` ao cliente em `workers/lib/integra/cliente.ts`
- [X] T023 Escrever a carga que consulta os modelos, propõe as correspondências e grava com `confirmado_em` **nulo** em `packages/db/src/trips/pre-sm-modelos.ts`
- [X] T024 Expor a lista para conferência humana em `apps/web/app/api/admin/pre-sm-modelos/route.ts` (GET lista, PATCH confirma/desfaz, auditado na mesma transação) e a tela em `apps/web/app/(shell)/admin/pre-sm-modelos/`, com item no menu sob Cadastros
- [X] T025 Garantir em `packages/db/src/trips/pre-sm-modelos.ts` que **só linha confirmada** vale para criar Pré-SM — um casamento errado do normalizador viraria escolta contratada para a rota errada, e o normalizador já errou uma vez

**Checkpoint**: a lista existe, foi conferida por gente, e já responde "quais rotas ficariam de fora".

---

## Phase 5: User Story 3 — Quando não dá, a tela diz por quê (P2)

**Goal**: nenhuma viagem fica sem Pré-SM em silêncio.

**Independent Test**: atribuir uma viagem cujo motorista não tem CPF e conferir que a viagem mostra o
que faltou, com caminho para resolver.

- [X] T026 [P] [US3] Escrever em `packages/shared/src/domain/pre-sm.ts` a decisão de **não criar**, devolvendo o motivo específico: sem CPF, sem modelo confirmado, sem vínculo de algum recurso (FR-012)
- [X] T027 [P] [US3] Teste da decisão em `pre-sm.test.ts`, um caso por motivo — inclusive o caso em que faltam dois, para o motivo mostrado ser o mais acionável
- [X] T028 [P] [US3] Escrever a montagem do corpo da Pré-SM a partir da viagem (campos, formato de data, placas), pura e testada
- [X] T029 [US3] Gravar o estado `sem_dados` com o motivo em `trip_pre_sm`, separado de `recusada` — um é problema nosso e o outro é resposta dela, e mandam a pessoa para lugares diferentes
- [X] T030 [US3] Mostrar o motivo na viagem, com o caminho para resolver (FR-013), em `apps/web/components/trips/pre-sm-status.tsx`
- [X] T031 [P] [US3] Textos dos motivos em `apps/web/messages/pt-BR.json`

**Checkpoint**: a decisão inteira é testável sem rede, e a falha nunca é silenciosa.

---

## Phase 6: User Story 1 — A Pré-SM nasce sozinha (P1)

**Goal**: a Pré-SM aparece na gerenciadora sem ninguém digitar.

**Independent Test**: atribuir uma viagem completa e conferir, na gerenciadora, que a Pré-SM existe
com motorista, placas e horário certos — e que o TMS mostra o número.

- [X] T032 [US1] Escrever `workers/lib/integra/cliente.ts` com `setPreSMdeModelo`, tratando `CodErro`/`MsgErro` e o formato de URL com o nome do método **entre aspas** (`%22`)
- [X] T033 [P] [US1] Teste do cliente em `cliente.test.ts` — só o formato da chamada e a leitura da resposta, **sem rede**
- [X] T034 [US1] Ler as credenciais do ambiente em `workers/lib/integra/cliente.ts`, **só no worker**, nunca em `NEXT_PUBLIC_*` nem em resposta de rota
- [X] T035 [US1] Implementar o interruptor em `workers/jobs/pre-sm/index.ts`: com `INTEGRA_PRE_SM_ATIVO` desligado, o trabalho roda inteiro, grava em `payload_enviado` o que **teria** mandado, e **não chama** a gerenciadora (R1)
- [X] T036 [US1] Implementar o teto diário em `workers/jobs/pre-sm/index.ts` (`INTEGRA_PRE_SM_TETO_DIARIO`, começando em zero) — torna a criação um ato deliberado enquanto ninguém confia no comportamento
- [X] T037 [US1] Criar o job em `workers/jobs/pre-sm/index.ts`: monta, decide, chama, grava o estado
- [X] T038 [US1] Registrar o job em `workers/jobs/index.ts`
- [X] T039 [US1] Enfileirar o trabalho em `apps/web/app/api/imports/portal-commands/route.ts` **apenas quando `encerrarOrdemDoPortal` devolver `true`** e a ação for `assign` — ele já é idempotente (`WHERE status = 'sent'`), então isso elimina o caso comum de duplicata
- [X] T040 [US1] Tratar a colisão do índice único parcial em `workers/jobs/pre-sm/index.ts` como garantia final: `insert` que colidir significa "já existe", e o trabalho registra isso em vez de estourar (FR-002)
- [X] T041 [US1] Guardar código, momento e origem em `trip_pre_sm`, via `packages/db/src/trips/pre-sm.ts` (FR-003)
- [X] T042 [US1] Repetir em falha de comunicação, distinguindo "ainda tentando" de "desistiu" (FR-015), em `workers/jobs/pre-sm/index.ts`
- [X] T043 [P] [US1] Teste do job em `workers/jobs/pre-sm/pre-sm.test.ts`, com o cliente dublado
- [X] T044 [US1] Registrar criação e recusa no histórico da viagem (FR-019), em `workers/jobs/pre-sm/index.ts`

**Checkpoint**: com o interruptor desligado, atribuir uma viagem grava o corpo que seria mandado —
dá para conferir tudo sem tocar no sistema deles.

---

## Phase 7: User Story 4 — Enxergar e desfazer (P3)

**Goal**: ver o estado sem abrir o sistema da gerenciadora, e desfazer o que nasceu errado.

**⚠️ Não é opcional nem adiável.** Sem ambiente de teste, o cancelamento é a única forma de desfazer
uma criação errada — por isso entra na mesma fatia da criação, não numa seguinte.

**Independent Test**: criar uma Pré-SM, ver o estado na viagem, cancelar, e conferir que o estado muda.

- [X] T045 [US4] Acrescentar `getStatusPreSM` e `setCancelaPreSM` ao cliente em `workers/lib/integra/cliente.ts` — e **NÃO** acrescentar `setEfetivaPreSM` (FR-004): o que não existe no cliente não pode ser chamado por engano
- [X] T046 [P] [US4] Teste em `workers/lib/integra/cliente.test.ts` que falha se `setEfetivaPreSM` (ou qualquer chamada a esse método) aparecer no cliente — FR-004 é requisito **negativo**, e requisito negativo sem guarda é só intenção: daqui a três meses ninguém lembra por que a efetivação ficou de fora, e ela entra "para completar a integração"
- [X] T047 [US4] Criar a rota `apps/web/app/api/trips/[id]/pre-sm/route.ts` para ler o estado e pedir o cancelamento, com a mesma permissão de atribuir
- [X] T048 [US4] Mostrar número, estado e momento da criação em `apps/web/components/trips/pre-sm-status.tsx` (FR-016)
- [X] T049 [US4] Botão de cancelar para Pré-SM ainda não efetivada (FR-017), com confirmação, em `apps/web/components/trips/pre-sm-status.tsx`
- [ ] T050 [US4] Avisar em `apps/web/components/trips/pre-sm-status.tsx` quando a atribuição mudar depois da Pré-SM criada (FR-018) — nesta fatia só avisa, alterar fica para depois
- [X] T051 [US4] Registrar o cancelamento no histórico da viagem, com o ator (FR-019), em `apps/web/app/api/trips/[id]/pre-sm/route.ts`
- [X] T052 [P] [US4] Textos em `apps/web/messages/pt-BR.json`

**Checkpoint**: dá para desfazer. Só agora a virada é segura.

---

## Phase 8: A virada e o fechamento

- [X] T053 Rodar `tsc`, `eslint`, `build` e `vitest` no monorepo inteiro; abrir o PR para `dev`
- [ ] T054 Após o merge, **reiniciar o worker** — job novo não vale sem restart, e worker velho mascara o conserto
- [ ] T055 Com o interruptor ainda desligado, conferir em produção por pelo menos um dia: quantas viagens gerariam Pré-SM, quantas cairiam em `sem_dados` e por quê. É a validação que substitui a homologação que não temos
- [ ] T056 **Com o usuário presente**, ligar o interruptor com teto `1`, atribuir **uma** viagem escolhida, e conferir a Pré-SM no sistema da gerenciadora — com o cancelamento à mão
- [ ] T057 Subir o teto conforme a confiança, e registrar em `docs/OPERACAO.md` o que fazer quando a integração falhar
- [ ] T058 [P] Acrescentar a entrada em `apps/web/lib/novidades/entradas.ts` — a operação precisa saber que isso passou a acontecer sozinho

---

## Dependências

```text
Phase 1 (Setup)
    └── Phase 2 (Migração)  ← bloqueia tudo
            ├── Phase 3 (US2 vínculo)      ← entrega valor sozinha
            ├── Phase 4 (rota → modelo)    ← independente da 3
            │       └── Phase 5 (US3 não criar)
            │               └── Phase 6 (US1 nasce sozinha)  ← precisa de 3, 4 e 5
            │                       └── Phase 7 (US4 desfazer)
            │                               └── Phase 8 (virada)
```

**As fases 3 e 4 correm em paralelo** — arquivos diferentes, sem dependência entre si.

## Paralelismo dentro das fases

- **Phase 2**: T007 e T008 juntas (tabelas diferentes)
- **Phase 3**: T012, T013 e T019 juntas
- **Phase 4**: T020 e T021 juntas
- **Phase 5**: T026, T027, T028 e T031 juntas
- **Phase 6**: T033 e T043 junto do resto
- **Phase 7**: T046 e T052 juntas

## MVP

**Fases 1 a 3** já valem promoção: o cadastro passa a distinguir agregado de terceiro, que hoje
ninguém sabe, e nada disso depende da gerenciadora.

O MVP da integração em si são as **fases 1 a 6 com o interruptor desligado** — a feature inteira
rodando e registrando o que faria, sem criar nada. É o mais perto de "provado" que se chega sem
ambiente de teste.

## O que estas tasks NÃO cobrem

Nenhuma prova que a gerenciadora **aceita** o nosso corpo. Só a T056 responde isso, e ela é manual,
com o usuário, em produção. Está assim de propósito: fingir cobertura seria pior do que admitir a
falta.

---

## Onde a fatia parou (2026-08-25)

**50 de 58 feitas.** As sete primeiras fases estão no `dev`, e **nenhuma linha chama a gerenciadora
hoje** — `INTEGRA_PRE_SM_ATIVO` ausente é desligado, e o teto diário é zero.

### O que sobra, e de quem é

| | |
|---|---|
| **T002** | pôr as credenciais no `devops/config.env` da VM — **é produção**, e a feature fica desligada sem elas de qualquer jeito |
| **T050** | avisar quando a atribuição mudar depois da Pré-SM criada. **Não foi feito**; é o único pedaço de código que falta |
| **T054–T057** | reiniciar o worker, observar um dia com o interruptor desligado, e a virada — **com o usuário** |
| **T058** | a entrada em Novidades, depois que a feature valer de verdade |
| T015 | cancelada, ver acima |

### A sequência da virada, e por que ela é assim

Não há ambiente de homologação (`CodErro 100`, medido). Então a validação é esta, nesta ordem:

1. **Reiniciar o worker** — job novo não existe sem isso, e worker velho mascara o resultado.
2. **Observar um dia com o interruptor desligado.** O job roda inteiro e grava em
   `trip_pre_sm.payload_enviado` o que teria mandado. Ler essas linhas responde, sem custo: quantas
   viagens gerariam Pré-SM, quantas cairiam em `sem_dados`, e se o corpo está certo.
3. **Ligar com teto `1`, uma viagem escolhida, com o usuário presente** — e o cancelamento à mão.
4. **Subir o teto** conforme a confiança.

O que **nada disso prova antes da hora**: que a gerenciadora aceita o nosso corpo. Só a primeira
criação real responde, e ela custa dinheiro. Foi por isso que a feature nasceu desligada.
