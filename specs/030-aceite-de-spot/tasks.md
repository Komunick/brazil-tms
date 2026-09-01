# Tasks: Aceite de oferta de spot direto no cartão

**Feature**: 030-aceite-de-spot · **Branch**: `030-aceite-de-spot` · **Date**: 2026-09-01

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/spot-offers-api.md](./contracts/spot-offers-api.md) ·
[quickstart.md](./quickstart.md)

---

## A REGRA QUE VALE PARA TODA TAREFA ABAIXO

> **ACEITAR É IRREVERSÍVEL no portal do cliente.** Nenhuma tarefa desta lista dispara um aceite real.
> O caminho de escrita se prova contra uma viagem que **não** está `Pending`, onde `impedimentoDaAcao`
> recusa antes de a ordem nascer. O desenho se prova pelo ensaio que já existe. **O primeiro aceite de
> verdade é decisão do usuário, com ele presente, e NÃO é passo de implementação.**

## AS SETE ARMADILHAS — leia antes de começar qualquer fase

1. **COPIAR O ESTADO É O ERRO.** Nenhuma coluna nossa guarda "aceita". Das 19 ofertas de dois dias,
   quase todas foram aceitas **direto no portal**; uma cópia nossa diria "esperando" para sempre.
2. **A CORTINA SAI.** `boxShadow: 0 0 0 9999px rgba(3,10,18,0.62)` apaga o TMS o dia inteiro quando o
   cartão para de sumir. **T019** a remove e **T049** impede que ela volte — e ela é fácil de
   reintroduzir sem perceber, porque "melhora o contraste".
3. **O X VIRA RECOLHER.** Fechar sem decidir é o que faz a oferta passar batido.
4. **A MEMÓRIA DE ABA CONTINUA SENDO DO SOM.** `estadoInicial`/`novasOfertas` em
   `apps/web/lib/spot/ofertas.ts` existem para apitar uma vez por oferta. **Não** podem virar a
   memória da decisão — recarregar traria tudo de volta como novidade.
5. **`drizzle-kit generate` NÃO SERVE.** Migração à mão, a partir de `0062`, renumerada só no merge, e
   **entrada no `meta/_journal.json` é obrigatória** — sem ela a migração é pulada e o deploy responde
   sucesso. Já aconteceu duas vezes nesta base.
6. **NENHUM ACEITE DE TESTE.** Ver a regra acima.
7. **A JANELA DO DIA É EXCEÇÃO DECLARADA ao FR-001.** `readSpotOffersToday` recorta pelo dia em São
   Paulo, então oferta não decidida some na virada. Está no plano de propósito (R10) — **nenhuma
   tarefa deve "consertar" isso**.

---

## Phase 1 · Setup

- [x] T001 Conferir que a branch é `030-aceite-de-spot` e que ela saiu do `dev`, e que a última migração numerada continua sendo `packages/db/migrations/0061_sm_da_programacao.sql` — se outra fatia tiver entrado no `dev` antes, a numeração desta muda e a renumeração acontece só no merge
- [x] T002 [P] Ler `apps/web/components/spot/oferta-de-spot.tsx` inteiro antes de tocá-lo: os comentários dele defendem o comportamento que esta fatia troca (sair em 30 s, cortina, um de cada vez), e cada um desses comentários precisa ser REESCRITO junto com o código, não apagado — o porquê antigo vira o porquê novo

---

## Phase 2 · Foundational — as etapas 1 a 3 do plano

**NADA MUDA PARA NENHUM USUÁRIO NESTA FASE**, e a afirmação foi conferida tarefa a tarefa: a tabela
nasce vazia e ninguém a lê; a derivação não tem chamador; a rota devolve campos que o cartão de hoje
ignora, **e a lista continua completa** — o cartão recebe exatamente as mesmas ofertas de hoje. É
isso que permite parar aqui.

A única coisa que mudaria o que o cartão recebe é excluir as ofertas já aceitas, e ela foi movida
para a Fase 3 de propósito (**T017a**). Filtrar a dispensa também não muda nada aqui, e por isso fica
na Fase 4 junto com o Ignorar: sem ninguém tendo dispensado, a tabela está vazia e o filtro não tem
o que esconder.

### A tabela da dispensa (etapa 1)

- [x] T003 Escrever À MÃO `packages/db/migrations/0062_dispensa_de_oferta.sql` criando `spot_offer_dispensas` com `spot_offer_id uuid REFERENCES "spot_offers"("id") ON DELETE CASCADE`, `user_id uuid REFERENCES "users"("id")` **sem cascade**, `dispensada_em timestamptz not null default now()` e **chave primária composta `(spot_offer_id, user_id)`** — o comentário do arquivo deve explicar por que a cascata é obrigatória pela oferta e proibida pelo autor (data-model §1)
- [x] T004 Acrescentar a entrada de `0062_dispensa_de_oferta` em `packages/db/migrations/meta/_journal.json`, **no mesmo commit da T003** — sem ela a migração é pulada em silêncio e o deploy responde sucesso
- [x] T005 Declarar a tabela em `packages/db/schema/spot-offers.ts` (mesmo arquivo da oferta, porque é a mesma história), com PK composta e sem índice extra — a leitura é `not exists (… where spot_offer_id = ? and user_id = ?)`, que é o prefixo da PK; um índice por `user_id` seria especulação
- [x] T006 [P] Escrever `packages/db/src/trips/spot-dispensas.test.ts` conferindo que migração e schema concordam: toda coluna do schema aparece na migração com aspas, a PK é composta, a cascata está na oferta e **não** está no autor
- [ ] T007 Rodar `pnpm --filter @brazil-tms/db db:migrate` no dev e conferir com `grep -c "0062_dispensa_de_oferta" packages/db/migrations/meta/_journal.json` (tem de ser 1) e com a tabela existindo e vazia

### A derivação do estado (etapa 2) — o coração da fatia

- [x] T008 Criar `packages/shared/src/domain/spot-decisao.ts` com a função pura que recebe `{ tripId, aceitacaoDoPortal, ordemAberta, ultimaFalha }` e devolve um de `sem_viagem | esperando | enviado | recusado | aceito`, conforme a tabela do data-model §2. O comentário do arquivo MUST dizer, com o motivo, que **`aceito` nunca é escrito por nós** — ele é lido do que o portal disse, e é por não haver onde gravá-lo que o FR-014 fica provado por construção
- [x] T009 [P] Escrever `packages/shared/src/domain/spot-decisao.test.ts` com um caso por linha da tabela, e o caso que mais importa: **`Accepted` vence TODAS as outras entradas** — viagem aceita com ordem falhada pendurada continua sendo `aceito`, porque a verdade é do portal e a ordem é só o nosso pedido
- [x] T010 [P] Escrever em `packages/shared/src/domain/spot-decisao.test.ts` o guarda do invariante **I1**: varrer o código-fonte de `packages/db/src` e `apps/web/app/api` procurando escrita do vocabulário de `aceito` sobre a oferta, e falhar se aparecer. **Ignorar comentários antes de asseverar** — esta base já teve duas vezes um teste que pegava a frase que EXPLICA a regra, e "consertá-lo" teria apagado o porquê
- [x] T011 Exportar a função e o tipo do estado em `packages/shared/src/index.ts` (ou no barril de `domain`, seguindo o que os vizinhos fazem) — **nenhum chamador ainda**

### A leitura passa a trazer o estado (etapa 3)

- [x] T012 Estender `packages/db/src/trips/spot-offers.ts` (`readSpotOffersToday`) com `left join` para `trips` por `external_trip_id = trip_number` e um lateral para a última ordem de aceite em `portal_commands`, devolvendo as quatro entradas da derivação. Manter o teto de 30 e o recorte do dia em São Paulo
- [x] T013 Aplicar a derivação da T008 no mapeamento para `SpotOfferView`, acrescentando `estado`, `tripId`, `podeAceitar`, `decidiuUserId`, `decidiuNome` e `erroDoPortal` (contrato §1). **NESTA FASE A LISTA CONTINUA COMPLETA** — a exclusão do que já foi aceito é a T017a, na Fase 3, e a razão está lá
- [x] T014 Ajustar `apps/web/app/api/spot-offers/route.ts` para devolver os campos novos, mantendo `requirePermission(ctx, "view_all_trips")` — nenhuma permissão nova nasce nesta fatia
- [ ] T015 [P] Escrever `packages/db/src/trips/spot-offers.test.ts` afirmando que a derivação é aplicada a cada linha e que os campos novos aparecem com os nomes do contrato
- [ ] T016 Conferir que **a tela não mudou**: subir o app e olhar o cartão de hoje, que deve ignorar os campos novos e se comportar exatamente como antes. Se algo mudou visualmente nesta etapa, algo saiu do lugar
- [x] T017 Medir de novo o custo da consulta com `explain (analyze, buffers)` contra a produção e comparar com a referência de **2,5 ms** — ela roda de 5 em 5 segundos, com a aba escondida, em toda tela aberta

**Checkpoint**: dá para parar aqui. Nada mudou para ninguém.

---

## Phase 3 · US1 — Aceitar a oferta pelo cartão (P1)

**Goal**: a pessoa aceita a LH sem sair da tela, em dois gestos, e o cartão fica até o portal confirmar.

**Independent Test**: com uma oferta cujo LH está esperando decisão, apertar Aceitar, confirmar, e
verificar que nasceu uma ordem com o autor registrado, que o cartão continua na tela marcado como
enviado, e que ele sai quando a leitura seguinte trouxer a viagem como aceita.

> **US1 e US2 vão no MESMO PR.** Entregar só o aceitar deixaria os cartões parados na tela sem
> nenhuma forma de limpá-los — um sistema pior que o de hoje. As duas são P1 na spec por isso.

### A exclusão do que já foi aceito — mudou de fase, e o porquê importa

- [x] T017a [US1] Em `packages/db/src/trips/spot-offers.ts`, **excluir da lista as ofertas cujo estado é `aceito`** — é assim que o cartão sai da tela, e é a garantia por construção do FR-014. **Esta tarefa estava na Fase 2 e saiu de lá**: com o cartão de hoje, que anuncia toda oferta nova e sai em 30 s, excluir as já aceitas SUPRIMIRIA um aviso que hoje aparece — e **25 de 98 ofertas tinham a viagem no TMS antes de a oferta chegar**, então o caso não é teórico. Na Fase 2 isso quebraria a promessa de que nada muda; aqui, junto com o cartão que fica, é exatamente o comportamento pedido
- [x] T017b [US1] [P] Escrever em `packages/db/src/trips/spot-offers.test.ts` a asserção de que `estado: "aceito"` **nunca** aparece na lista devolvida, em nenhuma combinação de entradas

### O cartão, sem a cortina

- [x] T018 [US1] Extrair um cartão para `apps/web/components/spot/cartao-da-oferta.tsx`, recebendo uma oferta e os gestos — hoje o desenho está embutido em `oferta-de-spot.tsx`, e vários cartões na tela exigem que ele seja uma peça
- [x] T019 [US1] Em `apps/web/components/spot/oferta-de-spot.tsx`, **remover a cortina** (`boxShadow: 0 0 0 9999px …`) mantendo `pointer-events-none` na camada e `pointer-events-auto` só nos cartões, e reescrever o comentário que defendia a cortina para explicar por que ela saiu
- [x] T020 [US1] Remover o temporizador de `DURACAO_MS` e a barra de tempo: o cartão não sai mais sozinho (FR-001). Reescrever o comentário "SAI SOZINHO EM 30 SEGUNDOS", que passa a ser o oposto
- [x] T021 [US1] Trocar a fila de "um de cada vez" por **todos ao mesmo tempo**: um cartão sozinho ocupa o meio como hoje; dois ou mais dividem em duas colunas e descem em linhas; passando da altura, o conjunto rola dentro da própria camada, sem esconder nenhum (FR-002)
- [x] T022 [US1] **Preservar `estadoInicial`/`novasOfertas` de `apps/web/lib/spot/ofertas.ts` como memória do SOM**, e só dela: o apito continua saindo uma vez por oferta. Acrescentar comentário dizendo que ela não é, e não pode virar, a memória da decisão

### Aceitar em dois gestos

- [x] T023 [US1] Acrescentar ao cartão o botão Aceitar, que **não envia nada**: abre uma confirmação dentro do próprio cartão, escrevendo o número da LH e avisando que o aceite não tem volta (FR-007)
- [x] T024 [US1] Acrescentar Confirmar e Voltar à confirmação; Voltar retorna ao estado de decisão sem efeito nenhum (FR-008)
- [x] T025 [US1] Aceitar `origem: "oferta_spot" | "tela_da_viagem"` (opcional, ausente = `tela_da_viagem`) no corpo de `apps/web/app/api/trips/[id]/portal-action/route.ts` e no schema Zod correspondente — **sem criar rota nova** (FR-009)
- [x] T026 [US1] Gravar a origem no `newValue` da auditoria que a rota já escreve na mesma transação (FR-025), **sem mudar a assinatura de `enfileirarOrdemDoPortal`** para nenhum chamador existente
- [x] T027 [US1] Ligar o Confirmar a `POST /api/trips/[id]/portal-action` com `action: "accept"` e `origem: "oferta_spot"`, usando o `tripId` que a leitura passou a devolver
- [x] T028 [US1] Desenhar o estado `enviado`: o cartão **fica na tela**, diz que a ordem foi enviada e mostra quem decidiu (FR-013). **Não** esconder o cartão quando o POST responde sucesso — 4 das 17 ordens gravadas voltaram recusadas
- [x] T029 [US1] Desenhar o estado `recusado`: mostra a mensagem do portal e volta a permitir tentar (FR-015). A recusa **não** tira o cartão da tela
- [x] T030 [US1] Traduzir em `apps/web/components/spot/cartao-da-oferta.tsx` (ou no arquivo de mensagens pt-BR) **apenas** o código já observado — `131205003` → "A viagem não está mais esperando decisão; ela pode já ter sido aceita, aqui ou no portal" — com a regra de que **código desconhecido mostra o texto cru do portal, nunca "erro desconhecido"** (R6)
- [x] T031 [US1] Desenhar o estado `sem_viagem`: Aceitar desligado com a razão escrita, e ligando sozinho quando a viagem chegar — em 82 de 98 casos medidos isso levou menos de dois minutos (FR-010)
- [x] T032 [US1] Esconder o Aceitar de quem não tem a permissão de aceitar viagem, mantendo a oferta visível (FR-011) — e conferir que a recusa vale no servidor, pelo `requirePermission` da rota reusada, não só no botão
- [x] T033 [US1] Mostrar "já há decisão em andamento" quando houver ordem aberta, sem permitir uma segunda (FR-012) — o índice parcial de `portal_commands` já garante, e a tela precisa dizer em vez de falhar

### Recolher

- [x] T034 [US1] Trocar o X por **Recolher**: encolhe o conjunto para uma pastilha com a contagem do que espera decisão, e volta com um clique (FR-004). O estado do recolhido vive na aba e **não** é guardado (R8)
- [x] T035 [US1] Fazer uma oferta NOVA reabrir o conjunto recolhido, e conferir que recolher **não** remove nada da lista (FR-005) — informação nova não pode ficar atrás de um gesto antigo

---

## Phase 4 · US2 — Ignorar sem decidir pela equipe (P1)

**Goal**: a pessoa limpa a própria tela sem mexer na de ninguém e sem mandar nada ao portal.

**Independent Test**: ignorar numa sessão e verificar, noutra sessão de outra pessoa, que o cartão
continua lá; e verificar que nenhuma ordem foi enviada ao portal.

- [x] T036 [US2] Criar `packages/db/src/trips/spot-dispensas.ts` com a gravação `insert … on conflict do nothing` e a leitura usada pelo filtro — **sem nenhum `delete` em lugar nenhum** (invariante I2, princípio III)
- [x] T037 [US2] Criar `apps/web/app/api/spot-offers/[id]/dispensar/route.ts`: `POST`, corpo vazio, permissão `view_all_trips`, resposta `204`, idempotente. Quem dispensa é quem está autenticado e não pode ser outro. **Não existe a rota inversa** — o caminho de volta é o Painel do dia (contrato §3)
- [x] T038 [US2] Filtrar **no servidor**, em `readSpotOffersToday`, as ofertas que quem pediu dispensou — é isso que faz a dispensa sobreviver a recarregar e a trocar de aparelho (FR-018), sem o cliente precisar lembrar de filtrar em três telas
- [x] T039 [US2] Acrescentar o botão Ignorar ao cartão, chamando a rota da T037 e tirando o cartão da tela com a animação de saída (FR-016)
- [x] T040 [US2] [P] Escrever teste afirmando que dispensar **não** cria ordem de portal nenhuma, que a oferta continua sendo devolvida ao Painel do dia (invariante I3) e que a leitura de outra pessoa continua trazendo a oferta (FR-017)

**Checkpoint**: com as fases 3 e 4, o pedido está entregue. As duas vão juntas no mesmo PR.

---

## Phase 5 · US3 — Decidir a partir do Painel do dia (P2)

**Goal**: quem olha o registro do dia decide dali, com a mesma confirmação e o mesmo estado.

**Independent Test**: aceitar por uma linha do painel e verificar que o cartão correspondente, noutra
aba, passa ao estado enviado — provando que é o mesmo estado, e não uma segunda decisão.

- [ ] T041 [US3] **A CORREÇÃO DE PASSAGEM**: em `packages/db/src/trips/programacao.ts`, trocar a decisão de `aceito` de `t.id is not null` (a viagem existe no TMS) pela derivação da T008. O atalho de hoje erra exatamente na janela desta fatia — os minutos em que a viagem chegou e ainda está `Pending` — e por ser passageiro nunca foi notado
- [ ] T042 [US3] [P] Escrever teste provando a correção: oferta cuja viagem está `Pending` **não** é contada como aceita, e passa a ser contada quando a aceitação virar `Accepted`. Sem este teste a correção vira efeito colateral que ninguém confere
- [ ] T043 [US3] Acrescentar `estado`, `dispensadaPorMim` e `tripId` a cada linha de `SpotDaRegiao["rotas"]` (contrato §4), mantendo as linhas dentro do payload do painel, sem busca própria — são até 20 por frente e o painel recarrega de minuto em minuto. **O painel MANTÉM as ofertas com estado `aceito`**, ao contrário da rota do cartão, que as exclui (T017a) — e a assimetria é o ponto: uma leitura é a fila do que falta decidir, a outra é a história do que aconteceu. Escrever isso no comentário, senão "uniformizar" depois vai parecer faxina e quebrar o FR-014
- [ ] T043a [US3] [P] Escrever teste afirmando que a leitura do painel **devolve** a oferta aceita e que a leitura do cartão **não** devolve — as duas asserções no mesmo arquivo, para que quem mexer numa veja a outra
- [ ] T044 [US3] Em `apps/web/components/trips/dashboard/frente.tsx`, dar ao pontinho um **terceiro estado** (esperando decisão), distinto de aceita e de não aceita, com título e rótulo próprios — a cor sozinha não basta, como o comentário que já está lá explica
- [ ] T045 [US3] Acrescentar Aceitar e Ignorar à linha que espera decisão, com a MESMA confirmação de dois gestos, reusando a rota da T025 e a da T037 (FR-021)
- [ ] T046 [US3] Assinalar a linha dispensada como "ignorado por você", **mantendo-a listada e ainda aceitável** (FR-019) — ignorar não apaga a prova de que a oferta chegou
- [ ] T047 [US3] Fazer o resumo do cabeçalho do card dizer quantas ainda esperam decisão (FR-023)
- [ ] T048 [US3] Conferir o FR-022 com as duas telas abertas: aceitar por um lado muda o outro sem ação adicional — as duas leem a MESMA derivação, e é essa fonte única que a garante

---

## Phase 6 · As provas que não são teste de unidade, e o polimento

- [ ] T049 [P] Escrever o guarda que **impede a cortina de voltar**, em `apps/web/lib/ui/` (junto dos guardas que já moram lá): falha se `9999px` ou um fundo opaco de tela cheia reaparecerem em `oferta-de-spot.tsx`. Ignorar comentários antes de asseverar
- [ ] T050 Escrever o Playwright que prova o **FR-003**: com cartões na tela, **preencher e enviar** um campo do diálogo de atribuição. A asserção MUST começar conferindo que há cartão — passar por não haver cartão nenhum não prova coisa alguma
- [x] T051 [P] Escrever o teste que prova o **FR-005**: não existe caminho que remova um cartão sem aceitar, ignorar ou recolher — e que recolher não tira nada da lista
- [ ] T052 [P] Conferir que `apps/web/components/spot/cartao-da-oferta.tsx` tem dono: alguma tela o importa. `apps/web/lib/ui/componentes-tem-dono.test.ts` cai se ele ficar órfão — foi o quinto caso de "dado capturado e nunca mostrado" nesta base
- [x] T053 [P] Traduzir todos os rótulos novos para pt-BR nos arquivos de mensagens, sem texto solto no componente
- [ ] T054 Estender `apps/web/lib/spot/ensaio.ts` para o ensaio poder subir uma oferta de mentira em **cada** estado (`sem_viagem`, `esperando`, `enviado`, `recusado`), pela MESMA porta da oferta real — um ensaio que desenhasse por outro caminho provaria o outro caminho
- [ ] T055 Percorrer a lista de conferência da etapa 4 do `quickstart.md` inteira, com o ensaio, **sem aceitar nada de verdade**
- [ ] T056 Rodar `pnpm lint` da RAIZ (`eslint .`), `pnpm typecheck`, `pnpm test` e o e2e do spot — `pnpm -r lint` não cobre `scripts/` e já deixou a CI vermelha nesta base
- [ ] T057 Abrir o PR para `dev` (nunca para `main`), citando no corpo os princípios aplicados e a troca explícita: uma tabela nova contra a alternativa recusada de copiar o estado (princípio I + FR-014)

---

## Dependências

```text
Phase 1 (T001–T002)
   └─▶ Phase 2 (T003–T017)  ── etapas 1 a 3; NADA muda para o usuário (conferido tarefa a tarefa)
          ├─▶ Phase 3 (T017a–T035)  US1 ─┐
          │                              ├── MESMO PR: uma sem a outra piora o sistema
          ├─▶ Phase 4 (T036–T040)  US2 ─┘
          └─▶ Phase 5 (T041–T048)  US3 — depende da T008 (a derivação), não das fases 3/4
                 └─▶ Phase 6 (T049–T057)
```

Dentro da Phase 2, a ordem é rígida: **T003 → T004 → T005 → T007** (a migração antes de tudo), e
**T008 → T011 → T012** (a derivação antes de quem a chama). A T004 vai no mesmo commit da T003.

## O que dá para fazer em paralelo

- **Phase 2**: T006, T009, T010 e T015 são testes em arquivos distintos, e T008 não depende da tabela
- **Phase 3**: T030 (a tradução) e T034–T035 (o recolher) não tocam os mesmos arquivos que T023–T029
- **Phase 5**: T042 e T043a são testes próprios, independentes de T043–T047
- **Phase 6**: T049, T051, T052 e T053 são arquivos distintos

## Estratégia de entrega

| entrega | fases | o que o usuário vê |
| --- | --- | --- |
| 1 | 1 + 2 | **nada** — e é o ponto: dá para parar aqui com o sistema inteiro |
| 2 (**MVP**) | 3 + 4 | o pedido, entregue: aceitar em dois gestos e ignorar, no cartão do meio |
| 3 | 5 | decidir também pelo Painel do dia, mais a correção da contagem de aceitas |
| 4 | 6 | as provas, o ensaio completo e o PR |

**MVP = fases 3 e 4 juntas.** A spec marca as duas histórias como P1 pelo mesmo motivo: cartões que
param na tela sem forma de limpá-los seriam pior que o comportamento de hoje.

## Rastreio: requisito → tarefa

| FR | tarefas | | FR | tarefas |
| --- | --- | --- | --- | --- |
| FR-001 | T020 | | FR-014 | T017a, T017b |
| FR-002 | T021 | | FR-015 | T029, T030 |
| FR-003 | T019, T050 | | FR-016 | T037, T039 |
| FR-004 | T034 | | FR-017 | T040 |
| FR-005 | T035, T051 | | FR-018 | T038 |
| FR-006 | T023 | | FR-019 | T046 |
| FR-007 | T023, T024 | | FR-020 | T044 |
| FR-008 | T024 | | FR-021 | T045 |
| FR-009 | T025, T027 | | FR-022 | T041, T048 |
| FR-010 | T031 | | FR-023 | T047 |
| FR-011 | T032 | | FR-024 | T003–T005, T036 |
| FR-012 | T033 | | FR-025 | T025, T026 |
| FR-013 | T028 | | FR-026 | T036, T040 |

| SC | como se prova | tarefa |
| --- | --- | --- |
| SC-001 | dois gestos a partir do cartão, sem sair da tela | T023, T024, T027 |
| SC-002 | nenhuma saída sem decisão | T051 |
| SC-003 | sai em até um minuto depois do portal confirmar | T017a, T017b |
| SC-004 | ignorada continua visível para os demais | T040 |
| SC-005 | nenhum aceite com um gesto só | T023, T024 |
| SC-006 | cinco cartões e a tela ainda operável | T021, T050 |
| SC-007 | toda recusa visível, com o código | T029, T030 |
| SC-008 | o registro do dia lista 100% | T046, T042 |
