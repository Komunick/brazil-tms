# Tasks: Motoristas disponíveis

**Feature**: 031 · **Branch**: `feat/motoristas-disponiveis` · **Date**: 2026-09-03

**Input**: spec.md (FR-001..FR-024, SC-001..SC-008) · plan.md (7 armadilhas, gate 7/7) ·
research.md (R1..R10) · data-model.md (I1..I5) · contracts/motoristas-disponiveis-api.md · quickstart.md

---

## Format: `[ID] [P?] [Story] Description`

- **[P]** = pode rodar em paralelo (arquivo diferente, sem dependência pendente)
- **[US1] [US2] [US3]** = a história que a tarefa serve
- Setup, Foundational e Polish **não** levam rótulo de história

## Path Conventions

Monorepo: `packages/shared` (regra pura) · `packages/db` (leitura) · `apps/web` (rota + tela).
**Nenhum caminho em `packages/db/migrations/`** — esta fatia não migra nada.

---

## AS SETE ARMADILHAS — leia antes da primeira tarefa

1. **A FONTE.** `trip_assignments` **não** é a fonte de quem está dirigindo. Ela esconde **67
   motoristas** na janela da aba (49 de 760 viagens têm motorista só no portal; o inverso é zero) e
   aponta para a **pessoa errada em 18 de 406** pares. A fonte é
   `trips.customer_fields->>'ID do motorista (portal)'` → `drivers.portal_driver_id` (resolve 49 de
   49 órfãs), com a atribuição nossa como complemento por `coalesce`.
2. **"ÚLTIMA VIAGEM" É A QUE CHEGA POR ÚLTIMO.** 15 motoristas têm mais de uma viagem aberta ao mesmo
   tempo. Ordenar por criação, ou pegar "a única aberta", descreve a viagem errada.
3. **CANCELADA NÃO É FINALIZADA** (I4). 19 das 215 linhas. FINALIZADO numa cancelada é a tela
   afirmando que uma carga foi entregue.
4. **O FUSO.** São Paulo, sempre. Uma conclusão às 23h30 daqui é 02h30 do dia seguinte em UTC — o
   teste precisa de caso **dos dois lados da meia-noite**, senão passa e não prova nada.
5. **NÃO COPIAR O ESTADO** (I2, FR-016). Nenhuma coluna nossa guarda "disponível".
6. **UM SÓ SEPARADOR DE PLACA.** `placasDoPortal` já existe em
   `packages/shared/src/domain/portal-assignment.ts`, testada. Reusar.
7. **A VARREDURA NÃO É A JANELA.** Varre 8 dias para achar a última viagem, **depois** recorta.
   Varrer só a janela faria a "última" ser a última dentro dela.

**E três que não podem sumir**: nenhuma migração (`drizzle-kit generate` está errado duas vezes aqui)
· carreta vazia fica **vazia**, nunca a placa do cavalo repetida (FR-003) · busca e ordenação são
**estado da tela**, nunca parâmetro da consulta (SC-008).

---

## Phase 1: Setup (Shared Infrastructure)

**Nada a instalar.** A fatia não traz dependência, não cria pacote e não migra. Esta fase existe só
para registrar isso — se alguém precisar de um `pnpm add` aqui, o desenho saiu do lugar.

- [ ] T001 Confirmar que a árvore está limpa e a branch é `feat/motoristas-disponiveis`, e que
      `packages/db/migrations/` **não** ganha arquivo nesta fatia (armadilha "nenhuma migração")

---

## Phase 2: Foundational (Blocking Prerequisites)

⚠️ **Bloqueia todas as histórias.** É a regra pura e a leitura — o coração da fatia, e o lugar onde
ela se prova sem tela e sem viagem de mentira.

**Nada aqui muda o que qualquer usuário vê.**

### A derivação pura (etapa 1 do plano)

- [ ] T002 Criar `packages/shared/src/domain/disponibilidade.ts` com o tipo `SituacaoDoMotorista`
      (`"finalizado" | "cancelada" | "a_caminho"`) e a constante do corte (`DIAS_ATE_SAIR_DA_ABA = 7`),
      documentando no cabeçalho **por que** o corte existe: sem ele, 117 motoristas parados há mais de
      7 dias e 72 há mais de 30 entram na lista, e ela deixa de responder "quem está livre agora"
- [ ] T003 Em `packages/shared/src/domain/disponibilidade.ts`, implementar `situacaoDaViagem(status)`
      → `"finalizado"` para viagem concluída, `"cancelada"` para cancelada, `"a_caminho"` para o
      resto. **Cancelada nunca devolve `finalizado`** (I4, armadilha 3)
- [ ] T004 Em `packages/shared/src/domain/disponibilidade.ts`, implementar `cabeNaAba({ situacao,
      conclusao, agora })` → hoje/amanhã em **São Paulo** para quem está a caminho; até **7 dias** da
      conclusão para finalizado e cancelada; `false` no resto (FR-008, FR-009, FR-010, armadilha 4)
- [ ] T005 Criar `packages/shared/src/domain/disponibilidade.test.ts` cobrindo, no mínimo:
      **(a)** a virada do dia com caso **dos dois lados da meia-noite** — 23h30 em São Paulo é 02h30
      do dia seguinte em UTC, e o teste deve falhar se alguém trocar o fuso;
      **(b)** o sétimo dia ainda aparece e o oitavo não;
      **(c)** cancelada nunca vira `finalizado` (I4);
      **(d)** hoje e amanhã entram, depois de amanhã não
- [ ] T006 Exportar `disponibilidade` no barril `packages/shared/src/index.ts`

### A leitura (etapa 2 do plano)

- [ ] T007 Criar `packages/db/src/fleet/motoristas-disponiveis.ts` com a consulta única (R5): varredura
      de **8 dias** → `distinct on (driver_id)` pela **maior data de conclusão** → recorte final. O
      cabeçalho deve registrar as três medidas da armadilha 1 (49 órfãs, 0 no inverso, 18 apontando
      para outra pessoa), porque é o que impede a "simplificação" de voltar para `trip_assignments`
- [ ] T008 Em `motoristas-disponiveis.ts`, resolver o motorista por
      `coalesce(drivers.portal_driver_id ← 'ID do motorista (portal)', trip_assignments.driver_id)`
      (armadilha 1, R1) — o `coalesce` existe para a viagem que o TMS acabou de atribuir e o portal
      ainda não refletiu
- [ ] T009 Em `motoristas-disponiveis.ts`, ordenar por `driver_id, conclusao desc, trip_id` — o
      desempate pelo **identificador da viagem** é o que torna a lista estável entre leituras
      (FR-005, R4, I5). Nunca desempatar por data de criação nem por nome de estação
- [ ] T010 Em `motoristas-disponiveis.ts`, montar as placas com `placasDoPortal` de
      `packages/shared/src/domain/portal-assignment.ts` — **cavalo** é a primeira, **carreta** é a
      segunda ou `null`. Nunca repetir o cavalo na carreta (FR-003, armadilha 6)
- [ ] T011 Em `motoristas-disponiveis.ts`, trazer o impedimento reusando `bloqueiosPorIdDoPortal` de
      `packages/db/src/fleet/driver-block.ts`, que já cobre os **dois** casos (bloqueio nosso e
      cadastro não `active`) — não escrever uma segunda consulta de impedimento
- [ ] T012 Criar `packages/db/src/fleet/motoristas-disponiveis.test.ts` — **teste de fonte** que lê o
      próprio arquivo e afirma: contém `portal_driver_id` e `ID do motorista (portal)`; **não** parte
      de `trip_assignments` como única origem do motorista; não contém verbo de escrita (I1).
      ⚠️ **O teste MUST remover comentários antes de asseverar** — este repositório já errou isso duas
      vezes, e "consertar" o teste seria apagar a explicação da regra
- [ ] T013 Exportar `motoristasDisponiveis` no barril `packages/db/src/index.ts`

### A rota (etapa 3 do plano)

- [ ] T014 Criar `apps/web/app/api/fleet/motoristas-disponiveis/route.ts` — `GET`, `requireAuth` +
      `requirePermission(ctx, "view_all_trips")`, **sem parâmetros** (contrato), devolvendo
      `{ motoristas, contagem: { disponiveis, aCaminho } }`
- [ ] T015 Na rota, garantir que a lista vazia é **200** com `motoristas: []` e contagens em zero —
      nunca 404 (contrato, FR-024)

**Checkpoint**: `pnpm --filter @brazil-tms/shared test`, os quatro typechecks e `pnpm lint` da raiz
passam. **Nenhuma tela mudou** — dá para parar aqui.

---

## Phase 3: User Story 1 - Ver quem está livre agora (Priority: P1) 🎯 MVP

**Goal**: a lista dos motoristas que terminaram e não pegaram outra viagem, com tudo que a planilha
tem, e a palavra FINALIZADO.

**Independent Test**: abrir a aba e conferir que os FINALIZADO são exatamente os que concluíram a
última viagem e não têm viagem aberta — comparando com a planilha do dia.

### Implementation for User Story 1

- [ ] T016 [US1] Criar `apps/web/app/(shell)/motoristas-disponiveis/page.tsx` — guarda de servidor
      (`verifySession` + `can(user, "view_all_trips")`, redireciona se não), título e subtítulo
- [ ] T017 [US1] Criar `apps/web/components/fleet/motoristas-disponiveis-client.tsx` com a consulta
      TanStack Query contra a rota, `refetchInterval: 60_000` e **sem**
      `refetchIntervalInBackground` (R7) — o comentário deve dizer por que não é 5 s como o spot
- [ ] T018 [P] [US1] Adicionar os rótulos em `apps/web/messages/pt-BR.json` — título, subtítulo,
      cabeçalhos das colunas, `FINALIZADO`, `CANCELADA`, as duas contagens e a frase de lista vazia
- [ ] T019 [US1] Na tabela, as colunas na ordem da planilha: Nome · Origem · Destino · Início ·
      Conclusão · Cavalo · Carreta · Situação (FR-002)
- [ ] T020 [US1] A coluna Carreta mostra **vazio assinalado** quando não há segunda placa — nunca a
      placa do cavalo (FR-003, armadilha 6)
- [ ] T021 [US1] A coluna Situação usa `situacaoDaViagem` da etapa 1 e, para `a_caminho`, o rótulo de
      status que a Torre de Controle já tem em `pt-BR.json` — **não** criar um segundo catálogo (R9)
- [ ] T022 [US1] Datas formatadas em São Paulo com o utilitário de formatação que já existe em
      `packages/shared` (`formatDateTime`) — não escrever formatação nova
- [ ] T023 [US1] Ordem padrão: **disponível há mais tempo primeiro** (FR-006). Registrar no
      comentário que isso NÃO é a ordem da planilha, e por quê: ela ordena por início porque é
      digitada em ordem de acontecimento, o que é limitação de quem digita
- [ ] T024 [US1] Estado vazio em palavras, nunca tabela vazia (FR-024)

**Checkpoint**: a aba existe e responde, alcançável pela URL direta. Ainda não está no menu.

---

## Phase 4: User Story 2 - Ver quem fica livre hoje ou amanhã (Priority: P2)

**Goal**: na mesma lista, quem ainda está na estrada e chega hoje ou amanhã, com o status corrente.

**Independent Test**: conferir que os motoristas em viagem que chega hoje/amanhã aparecem com o
status atual, e que nenhum deles aparece como FINALIZADO.

### Implementation for User Story 2

- [ ] T025 [US2] Distinguir visualmente `a_caminho` de `finalizado` na coluna Situação — cor e
      palavra, não só cor (FR-015)
- [ ] T026 [US2] Cabeçalho com as **duas contagens** — disponíveis e a caminho —, de modo que o total
      seja conferível sem contar linha por linha (FR-023). A contagem de disponíveis soma
      `finalizado` **e** `cancelada` (contrato), mas as duas continuam distintas na linha (I4)
- [ ] T027 [P] [US2] Busca por nome, estação e placa (FR-007), **como estado da tela** — nunca
      parâmetro da consulta; a atualização de 60 s não pode apagar o que a pessoa digitou (SC-008)
- [ ] T028 [P] [US2] Ordenação por coluna, também como estado da tela (FR-006)

**Checkpoint**: a aba responde as duas perguntas — quem está livre e quem fica livre.

---

## Phase 5: User Story 3 - Enxergar quem a atribuição vai recusar (Priority: P3)

**Goal**: o motorista livre que não pode receber carga aparece **marcado**, com o motivo.

**Independent Test**: um motorista inativo ou bloqueado aparece com a marca e o motivo; a marca some
quando o impedimento é resolvido, sem nenhuma ação nesta aba.

### Implementation for User Story 3

- [ ] T029 [US3] Selo de impedido na linha, ao lado do nome, com o motivo no `title` — a marca não
      pode ocupar a linha inteira nem empurrar as colunas (FR-017)
- [ ] T030 [P] [US3] Rótulos dos dois motivos em `apps/web/messages/pt-BR.json` — bloqueado por nós e
      cadastro não ativo (FR-018)
- [ ] T031 [US3] Confirmar que o motorista impedido **continua aparecendo** — esconder é a decisão
      recusada pelo usuário (decisão 2 da spec); são 4 dos 36 finalizados de hoje e ontem

---

## Phase 6: A navegação (etapa 6 do plano)

⚠️ **Por último de propósito**: até aqui a aba existe mas ninguém tropeça nela. Esta é a fase que a
torna alcançável — e a única que muda o que todo mundo vê.

- [ ] T032 Adicionar a entrada em `apps/web/lib/nav.ts` com `pai: "trips"`, `grupo: "operacao"`,
      `permission: "view_all_trips"` e um ícone — irmã de Minha Programação, como a spec decidiu
- [ ] T033 [P] Rótulo do menu em `apps/web/messages/pt-BR.json`

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T034 [P] Playwright em `apps/web/e2e/` — abrir a aba, conferir que as colunas existem, que a
      busca filtra sem recarregar e que o estado vazio aparece em palavras
- [ ] T035 [P] Teste de invariante I1 (nenhuma escrita): varrer o módulo de leitura **e** a rota
      procurando verbo de escrita, ignorando comentário antes de asseverar
- [ ] T036 Medir a consulta contra a produção com `explain (analyze, buffers)` em **modo leitura** e
      conferir contra o medido em 03/09: **abaixo de 50 ms** (medido: 10,9 ms), buffers em
      `shared hit`, ~215 linhas (116 finalizados, 19 cancelados, 80 a caminho)
- [ ] T037 Conferir contra a produção, em consulta de leitura, os três invariantes do quickstart:
      **(a)** nenhum motorista com viagem aberta aparece como disponível — alvo certo são os **15**
      com mais de uma viagem aberta (SC-004);
      **(b)** todo motorista da lista é a **maior conclusão** dele (I3);
      **(c)** duas execuções seguidas devolvem a mesma lista, na mesma ordem (I5)
- [ ] T038 Rodar `pnpm lint` da **raiz** (`eslint .`), os quatro typechecks e `pnpm vitest run`
- [ ] T039 **[USUÁRIO]** Conferência à mão na tela, com a planilha PROGRAMAÇÃO SHOPEE FROTA do dia ao
      lado: mesmas colunas, quem está FINALIZADO na planilha está FINALIZADO na aba, motorista com
      carreta mostra as duas placas, sem carreta mostra vazio, e as contagens batem

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 (Setup)
   ↓
Phase 2 (Foundational) ─── BLOQUEIA TUDO
   ↓
Phase 3 (US1) ── MVP
   ↓
Phase 4 (US2)          Phase 5 (US3)   ← independentes entre si
   ↓                        ↓
Phase 6 (Navegação) ← só depois de a tela existir
   ↓
Phase 7 (Polish)
```

### User Story Dependencies

- **US1** depende só da Fase 2.
- **US2** e **US3** são independentes entre si; as duas escrevem no mesmo componente, então não são
  paralelas na prática.
- **A navegação é a última** porque é o único gesto que expõe a aba a todo mundo.

### Within Each User Story

Rota pronta → página → componente → colunas → estados. Os rótulos em `pt-BR.json` são [P] porque são
arquivo diferente.

### Parallel Opportunities

- T003 e T004 depois de T002 (mesma unidade, mas funções distintas — na prática, sequenciais)
- T018, T027, T028, T030, T033 são [P]: arquivo diferente do componente
- T034 e T035 são [P] entre si

---

## Implementation Strategy

### MVP First (User Story 1 Only)

Fases 1 → 2 → 3, e a aba já substitui a planilha para a pergunta que mais importa: **quem está livre
agora**. Sem menu ainda — alcançável pela URL, o que permite conferir com o usuário antes de expor.

### Incremental Delivery

1. Fases 1–2: nada muda para ninguém. Dá para parar.
2. Fase 3: a aba existe, pela URL. Dá para conferir com uma pessoa.
3. Fases 4–5: a aba fica completa.
4. Fase 6: entra no menu — é aqui que a operação inteira passa a vê-la.
5. Fase 7: as provas e a conferência do usuário.

---

## Notes

- **Nada nesta fatia é irreversível.** Não gasta com a gerenciadora, não escreve no portal, não
  escreve no nosso banco. O pior caso de um erro é uma lista errada, corrigida na leitura seguinte.
- **O tmsdev não tem viagem do dia** (o banco parou de ser alimentado em 29/08; os robôs escrevem em
  produção). **Lista vazia lá é falta de dado, não regressão.** Por isso a prova está repartida: a
  regra em teste de unidade (T005), a consulta medida contra a produção em leitura (T036, T037), e a
  tela na conferência do usuário (T039).
- **Se alguma tarefa levar a criar migração, índice ou coluna**, pare: a consulta foi medida em
  10,9 ms sem nada disso, e a fatia inteira foi desenhada para não guardar estado (I2, FR-016).

---

## Rastreio

| Requisito | Tarefas |
|---|---|
| FR-001 (a aba na Torre) | T016, T032 |
| FR-002 (as colunas) | T019 |
| FR-003 (duas placas, carreta vazia) | T010, T020 |
| FR-004 (última = chega por último) | T007, T009 |
| FR-005 (desempate estável) | T009, T037c |
| FR-006 (ordem padrão + ordenar) | T023, T028 |
| FR-007 (busca) | T027 |
| FR-008..FR-010 (entra, fica, corte de 7 dias) | T004, T005 |
| FR-011, FR-012 (sai sozinho, sem gesto) | T007, T009 |
| FR-013..FR-015 (FINALIZADO, cancelada, a caminho) | T003, T021, T025 |
| FR-016 (não guardar estado) | T012, T035 |
| FR-017..FR-019 (impedimento) | T011, T029, T030, T031 |
| FR-020 (frescor) | T017 |
| FR-021 (permissão) | T014, T016 |
| FR-022 (não atribui, não escreve) | T012, T035 |
| FR-023 (as duas contagens) | T026 |
| FR-024 (vazio em palavras) | T015, T024 |
| SC-001, SC-002 (substituir a planilha) | T039 |
| SC-003 (concorda com o portal) | T039 |
| SC-004 (ninguém em viagem como livre) | T037a |
| SC-005, SC-006 (sai/vira sozinho) | T005, T037 |
| SC-007 (impedido sempre marcado) | T031 |
| SC-008 (abre rápido, não interrompe) | T027, T036 |
| I1 (nenhuma escrita) | T012, T035 |
| I2 (estado não copiado) | T012, T035 |
| I3 (maior conclusão) | T037b |
| I4 (cancelada ≠ finalizada) | T003, T005, T026 |
| I5 (estabilidade) | T009, T037c |

**39 tarefas** — 1 setup · 14 fundação · 9 US1 · 4 US2 · 3 US3 · 2 navegação · 6 polimento.
