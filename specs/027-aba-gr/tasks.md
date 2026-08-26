# Tasks: A aba GR — a Pré-SM feita por uma pessoa

**Feature**: `027-aba-gr` · **Plan**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md)

---

## Leia antes de começar

- **[quickstart.md](./quickstart.md)** — as sete armadilhas. Cinco delas já morderam de verdade.
- **[contracts/setpresm.md](./contracts/setpresm.md)** — o corpo campo a campo.
- **`docs/INTEGRA-14.2-REFERENCIA.md`** — a API inteira. **Confira ali antes de afirmar que um campo
  não existe.**

### A ordem contraria a prioridade da spec, de propósito

A US4 (conferir as correspondências) é **P2** e vem **primeiro**. Não é engano: sem a ponte de
cidade e a de rota, a US1 não tem o que enviar e a US2 diria "falta rota" em toda linha. A
prioridade da spec ordena **valor**; esta ordem segue **dependência**.

### O que NÃO se reescreve

Tudo isto já existe no `dev`, vindo da 026, e serve inteiro:

| O que | Onde |
|---|---|
| Vínculo A/F/T e migrações | `0046`, `0047`, diálogo de atribuição |
| `trip_pre_sm` e seus estados, incl. `nao_tentada` | `packages/db/schema/trip-pre-sm.ts` |
| Índice único parcial `trip_pre_sm_viva_uk` | migração `0046` |
| Cancelamento (job + botão) | `workers/jobs/pre-sm/cancelar.ts`, `components/trips/pre-sm-status.tsx` |
| Aviso de divergência | `divergenciasDaPreSm` |
| Tela de conferência | `app/(shell)/admin/pre-sm-modelos/` |
| Cliente da Integra e o tratamento de `CodErro` | `workers/lib/integra/cliente.ts` |

**Tocar nisso é retrabalho e risco.** Se uma task abaixo parecer pedir para refazer algo desta
tabela, ela está errada — leia o plano de novo.

---

## Phase 1 — Setup

- [X] T001 Ler `docs/INTEGRA-14.2-REFERENCIA.md` nas seções `setPreSM`, `getCidades`, `getRotas`, `getCliente` e `getTabela`, e conferir contra `specs/027-aba-gr/contracts/setpresm.md` — divergência entre os dois é defeito do contrato, e é para consertar agora
- [X] T002 Confirmar no banco de dev que `pre_sm_route_models` e `trip_pre_sm` continuam vazias (`select count(*)`) — a migração da Fase 2 assume isso e fica errada se houver dado

---

## Phase 2 — Foundational (bloqueia tudo)

**A migração.** Uma só, escrita à mão, fazendo três coisas.

- [X] T003 Conferir a versão do Postgres em produção (era 16.14) e se a migração precisa de algo fora de transação
- [X] T004 Escrever `packages/db/migrations/00NN_aba_gr.sql` **à mão**: renomear `pre_sm_route_models` → `pre_sm_route_links`, renomear `cod_modelo` → `cod_rota`, e criar `pre_sm_city_links` conforme `data-model.md`. **NÃO usar `drizzle-kit generate`** — o journal tem 49 entradas e 27 snapshots, ele diffa contra o `0024` e **recria tabelas de produção**
- [X] T005 Acrescentar a entrada no `packages/db/migrations/meta/_journal.json`
- [X] T006 [P] Escrever `packages/db/schema/pre-sm-city-links.ts` com o comentário do porquê de `uf`, `cidade_nome` e `descricao` existirem (ver `data-model.md`)
- [X] T007 Renomear `packages/db/schema/pre-sm-route-models.ts` → `pre-sm-route-links.ts` e trocar `codModelo` por `codRota`; atualizar `packages/db/schema/index.ts`
- [X] T008 Aplicar a migração no dev e conferir no banco: as duas tabelas com a forma nova, e o índice único de `trip_pre_sm` **intacto**

**Checkpoint**: o banco tem as duas pontes, e nada da 026 quebrou.

---

## Phase 3 — US4: Conferir a ponte de cidade e de rota (P2, mas vem primeiro)

**Goal**: as correspondências existem, propostas e conferíveis. Sem isto, nada mais funciona.

**Independent Test**: rodar a carga, abrir a tela, confirmar algumas linhas, e ver que só as
confirmadas passam a valer.

### A extração de cidade a partir do nome

- [X] T009 [US4] Acrescentar `ufECidadeDaEstacao` em `packages/shared/src/domain/pre-sm-modelos.ts`, **ao lado** de `tokensDaEstacao` e usando a MESMA separação por `_` e o mesmo índice de UF. **Não escrever um segundo normalizador** — dois divergem em silêncio e a estação simplesmente não casa, sem erro nenhum
- [X] T010 [P] [US4] Teste em `pre-sm-modelos.test.ts` com estações reais: `SOC_MG_BETIM`, `LM HUB_TO_PALMAS`, `SOC_PE_JABOATÃO DOS GUARARAPES`, `FM HUB_PR_UMUARAMA_PQ_INDUST_II`, e o caso sem UF no nome
- [X] T011 [P] [US4] Teste que amarra as duas funções: para a mesma estação, o que `tokensDaEstacao` descarta é exatamente o que `ufECidadeDaEstacao` devolve. É o teste que impede a divergência silenciosa

### O casamento com o cadastro da gerenciadora

- [X] T012 [US4] Acrescentar `getRotas`, `getCidades` e `getTabela` a `workers/lib/integra/cliente.ts`. **Remover** `setPreSMdeModelo` e `getModelosPreSM`. **Atenção aos nomes dos parâmetros**: `getTabela` usa `NomeTabela` (não `Tabela`) e `getCidades` usa `FiltroCidade`/`FiltroEstado`/`FiltroPais` (não `Cidade`/`UF`) — errar o nome devolve `CodErro 105` e **parece** que o recurso não existe (R2b, R5)
- [ ] T013 [P] [US4] Teste do cliente em `cliente.test.ts` — só o formato da chamada e a leitura da resposta, **sem rede**
- [X] T014 [US4] Escrever em `packages/shared/src/domain/pre-sm-cadastro.ts` o casamento de cidade (estação → cidade da gerenciadora) e o de rota (par origem–destino → `CodRota`), puros
- [X] T015 [P] [US4] Testes do casamento com as cidades e rotas reais medidas em 25/08
- [X] T015b [US4] Acrescentar a tolerância do **sufixo de bairro ou distrito** ao casamento de cidade: quando o nome inteiro não achar, cair para o primeiro termo. Medido em 25/08: **27 cidades não resolvem** por isso — `RECIFE MURIBECA`, `SANTANA`, `CAMPINAS PQ CIDADE`, `UMUARAMA PQ INDUST II` —, e elas valem **38 dos 134 pares de rota**
- [X] T015c [P] [US4] Teste da tolerância com as quatro estações acima, e o caso que ela **não** pode quebrar: `SIMOES FILHO` continua casando com `SIMOES FILHO`, não virando `SIMOES`
- [X] T016 [US4] Escrever `packages/db/src/trips/pre-sm-cidades.ts`: gravar propostas com `confirmado_em` **nulo**, listar, confirmar/desfazer (auditado na mesma transação), e a leitura que **só** devolve confirmada
- [X] T017 [US4] Adaptar `packages/db/src/trips/pre-sm-modelos.ts` → `pre-sm-rotas.ts`, trocando modelo por rota. A trava de "só confirmada vale" continua **dentro** da função, não no chamador
- [X] T018 [US4] Acrescentar as ações de auditoria (`pre_sm.cidade.confirmar` / `.desconfirmar`) em `packages/shared/src/audit/actions.ts`, no tipo **e** no catálogo, com os rótulos pt-BR — há teste-guarda que exige rótulo para cada ação

### A carga, e a tela

- [X] T019 [US4] Escrever o job `pre_sm.carregar_cadastro` em `workers/jobs/pre-sm/carregar-cadastro.ts`: consulta cidades e rotas e propõe as duas correspondências. **Uma carga só** — a rota depende do IBGE da cidade, e dois jobs criariam uma ordem implícita (R6)
- [X] T019b [US4] Gravar as propostas com `ON CONFLICT DO NOTHING`, **nunca `DO UPDATE`** (FR-021). Se a correspondência já existe, ou alguém a confirmou — e sobrescrever apagaria a conferência dela — ou está esperando conferência, e a proposta nova é a mesma. Em nenhum dos dois casos o certo é mexer. A exceção legítima (o cadastro mudou na gerenciadora) é trabalho de tela, com a pessoa vendo o que troca
- [X] T020 [US4] Registrar o job em `workers/jobs/index.ts` e **remover** o `pre_sm.carregar_modelos`
- [ ] T021 [US4] Acrescentar a tela de conferência de cidades em `apps/web/app/(shell)/admin/pre-sm-cidades/` e a rota `app/api/admin/pre-sm-cidades/route.ts` (GET lista, PATCH confirma/desfaz), espelhando a de rotas que já existe. Permissão **`manage_commercial_data`**, e **não** `assign_resources` (FR-024): quem escala **usa** esta decisão, não a toma — senão a pessoa impedida de escalar alguém poderia se autoliberar confirmando uma correspondência
- [ ] T022 [US4] Adaptar a tela de rotas existente para mostrar `CodRota` e a descrição da rota; renomear a rota de API e o item de menu. Mesma permissão `manage_commercial_data`
- [ ] T023 [P] [US4] Textos das duas telas em `apps/web/messages/pt-BR.json`
- [ ] T024 [US4] **Rodar a carga contra a produção** e conferir contra o já medido em 25/08: 518 rotas dela, **96** das nossas com IBGE nas duas pontas, **53 com rota cadastrada** (52% das viagens). Número muito diferente disso é defeito do casamento, não do cadastro — investigar antes de seguir

**Checkpoint**: as duas telas mostram propostas reais, nenhuma confirmada, e o número de acerto está
medido.

---

## Phase 4 — O corpo do `setPreSM`, puro e isolado

**Goal**: montar o corpo e dizer o que falta, sem rede e sem banco. É o **único** arquivo que a
resposta pendente da gerenciadora pode mudar.

- [ ] T025 Escrever `packages/shared/src/domain/pre-sm-corpo.ts`: recebe o que a viagem tem, devolve o corpo do `setPreSM` **ou a lista dos motivos** de não dar
- [ ] T026 [P] Implementar a lista de **todos** os motivos, não só o primeiro — mudou em relação à 026 (R4): na aba GR o motivo **é** a fila, e resolver o CPF para descobrir que falta o vínculo é duas idas ao cadastro
- [ ] T027 [P] Implementar a conversão de data e hora para **horário de São Paulo**, no formato `"2015-07-17 16:00"` do manual — sem `T`, sem segundos
- [ ] T028 [P] Teste em `pre-sm-corpo.test.ts` com um caso por motivo, **e** o caso em que faltam três ao mesmo tempo
- [ ] T029 [P] Teste do fuso: `12:00Z` vira `09:00`. **Este erro passa em teste ingênuo e só aparece na estrada** — a escolta espera três horas fora
- [ ] T030 [P] Teste do vínculo: `owned`→`F`, `agregado`→`A`, `terceiro`→`T`, e **`subcontracted` vira motivo de bloqueio**, nunca uma letra. Chutar mandaria informação errada para quem faz escolta, e o erro seria invisível
- [ ] T031 [P] Teste que o corpo **não** é montado pela metade: faltando algo, devolve os motivos e nenhum corpo

**Checkpoint**: `pnpm vitest run packages/shared/src/domain/pre-sm-corpo.test.ts` verde. Nada tocou a
gerenciadora.

---

## Phase 5 — US2: A fila que diz o que falta (P1)

**Goal**: a aba existe, mostra a fila certa e diz o que falta em cada linha — **sem botão de envio
funcionando ainda**.

**Independent Test**: pôr uma viagem com motorista sem CPF na fila e conferir que ela aparece, diz
"falta CPF", tem link para o cadastro, e destrava depois de o CPF ser preenchido.

- [ ] T032 [US2] Escrever `packages/db/src/trips/gr-fila.ts`: a consulta que cruza viagens atribuídas, ordem do portal, vínculos, correspondências confirmadas e o estado da Pré-SM. **Sem coluna guardada de "está pronta"** — ela ficaria velha no instante seguinte (ver `data-model.md`)
- [ ] T033 [US2] Qualificar as colunas ambíguas na consulta (`updated_at` existe em `trips` e em `drivers`) — sem o prefixo o Postgres recusa a consulta inteira, e nenhum teste unitário pega isso
- [ ] T034 [US2] Expor a fila em `apps/web/app/api/gr/route.ts`, permissão `assign_resources`
- [ ] T035 [US2] Escrever a tela em `apps/web/app/(shell)/gr/page.tsx` e `apps/web/components/gr/`, com polling via TanStack Query (**sem Realtime** — restrição da constituição)
- [ ] T036 [US2] Cada linha mostra o que será enviado: placas, motorista (e o segundo), o vínculo de cada recurso, e a janela de coleta (FR-002)
- [ ] T037 [US2] Cada linha mostra **todos** os motivos que faltam, cada um com o caminho para resolver — cadastro do motorista, diálogo de atribuição, tela de conferência (FR-006, FR-007)
- [ ] T038 [US2] Ordenar a fila pela urgência da coleta: o que sai primeiro aparece primeiro (FR-004)
- [ ] T039 [US2] Seção separada para as já enviadas, com o código da Pré-SM (FR-014)
- [ ] T040 [P] [US2] Textos da aba em `apps/web/messages/pt-BR.json`
- [ ] T041 [US2] Item de menu para a aba GR, perto da expedição — é tela de operação, não de administração
- [ ] T042 [US2] **Abrir a aba com dados reais de produção** e conferir a fila contra o que se sabe: quantas viagens prontas, quantas com cada motivo. Ainda sem botão que gaste

**Checkpoint**: a aba serve como painel de trabalho mesmo sem enviar nada — já diz o que precisa ser
resolvido no cadastro.

---

## Phase 6 — US1: O envio (P1)

**Goal**: a pessoa aperta e a Pré-SM nasce.

**Independent Test**: com uma viagem completa, apertar Enviar e conferir na gerenciadora que a Pré-SM
existe com motorista, placas e horário certos — e que o TMS mostra o número.

> **ESTA FASE PODE SER FEITA INTEIRA.** Nada aqui depende da pendência, e nada aqui gasta.
>
> O T050 é o ensaio **com o interruptor desligado**: o job monta o corpo e grava o que *teria*
> mandado, sem chamar a gerenciadora. É de graça e é o que substitui a homologação que não temos.
>
> Quem espera a resposta é a **Fase 9** — a criação de verdade. Se a Pré-SM nascer solta da
> programação, é o corpo que muda, e ele mora num arquivo só.

- [ ] T043 [US1] Acrescentar `setPreSM` a `workers/lib/integra/cliente.ts`, tratando `CodErro`/`MsgErro` e o formato de URL com o nome do método **entre aspas** (`%22`)
- [ ] T044 [P] [US1] Teste do cliente — só o formato da chamada e a leitura da resposta, **sem rede**
- [ ] T045 [US1] Pôr `CodFilial` (**9332**) e `CodPerfilSeguranca` (**20785 · DDR SHOPEE**) em **configuração**, não constante no código (R5, princípio V). Os valores já foram achados: `getTabela(FILIAIS)` e `getTabela(PERFIL_SEGURANCA)`
- [ ] T046 [US1] Adaptar `workers/jobs/pre-sm/criar.ts` e `index.ts` para montar o corpo novo. O interruptor e o teto diário **continuam**, desligados
- [ ] T047 [US1] Escrever `apps/web/app/api/gr/[tripId]/enviar/route.ts`: enfileira o job, devolve 202. **Nunca chamar a Integra da rota** — a credencial vive só no worker
- [ ] T048 [US1] Tratar a colisão do índice único parcial como "já existe", não como erro — é a garantia contra dois cliques simultâneos (FR-008)
- [ ] T048b [US1] Registrar **quem apertou Enviar e quando** (FR-009), na rota e não no worker: o worker sabe o que aconteceu, não quem quis. A 026 já guarda `requested_by`, mas ali o autor era o sistema — aqui é uma pessoa, e é a informação que alguém vai procurar quando a gerenciadora cobrar por uma solicitação de que ninguém se lembra
- [ ] T049 [US1] Mostrar na linha que o pedido está **em andamento** enquanto a gerenciadora não responde, distinguindo isso de ter falhado (FR-010, FR-013)
- [ ] T050 [US1] **Ensaio com o interruptor desligado, um dia inteiro**: o job grava em `trip_pre_sm.payload_enviado` o que *teria* mandado. Ler essas linhas responde quantas viagens sairiam limpas — **sem custo**. É a validação que substitui a homologação que não temos

**Checkpoint**: tudo pronto para a primeira criação real, e ela ainda não aconteceu.

---

## Phase 7 — US3: Desfazer (P2)

**Goal**: a Pré-SM criada por engano pode ser cancelada da própria aba.

**Independent Test**: criar uma Pré-SM, cancelá-la pela aba, e conferir na gerenciadora que ela saiu.

> A maior parte **já existe** na 026: o job `pre_sm.cancelar`, o `setCancelaPreSM` no cliente, e o
> diálogo que avisa que a solicitação já foi cobrada. Aqui é só trazer para a aba.

- [ ] T051 [US3] Pôr o botão de cancelar na seção das já enviadas, reusando o diálogo de confirmação da 026 — o texto que diz que a cobrança não volta é o que faz alguém parar e pensar
- [ ] T052 [US3] Depois de cancelada, a viagem volta a aparecer na fila podendo gerar outra — o índice único parcial já permite isso
- [ ] T053 [US3] Quando a gerenciadora **recusa** cancelar (tipicamente porque a Pré-SM já foi efetivada), a viagem continua marcada como ativa e a mensagem dela aparece inteira
- [ ] T053b [US3] Mostrar o **aviso de divergência** na seção das já enviadas (FR-016), reusando `divergenciasDaPreSm` da 026. É o requisito que a aba existe para tornar visível: a escolta foi contratada com o motorista ou a placa antigos, e hoje isso só aparece se alguém abrir a viagem. Calculado na leitura, **nunca guardado** — muda a cada reatribuição e uma coluna ficaria velha no instante seguinte

---

## Phase 8 — Fechamento

- [ ] T054 [P] Remover o que morreu: `getModelosPreSM` e `setPreSMdeModelo` do cliente, o job `pre_sm.carregar_modelos`, e os testes deles
- [ ] T055 [P] Atualizar `docs/OPERACAO.md` com o job novo e o que fazer quando a integração falhar
- [ ] T056 [P] Acrescentar a entrada em `apps/web/lib/novidades/entradas.ts` — a operação precisa saber que a aba existe
- [ ] T057 Renumerar a migração para o próximo número livre **no momento do merge**, nunca antes
- [ ] T058 Rodar `pnpm lint` **da raiz** (`eslint .`), `pnpm -r typecheck` e `pnpm test`. O `pnpm -r lint` **não** cobre `scripts/` e já deixou a CI vermelha
- [ ] T059 Reiniciar o worker depois do merge — job novo não vale sem restart, e worker velho mascara o conserto

---

## Phase 9 — A virada (com o usuário)

- [ ] T060 As credenciais da Logae no `devops/config.env` da VM **e** no `.env.local`. Só no segundo não segura: o próximo deploy regenera esse arquivo a partir do primeiro (`docs/OPERACAO.md`)
- [ ] T061 Confirmar na tela a rota e as duas cidades da viagem escolhida — sem isso a linha fica travada
- [ ] T062 Guardar o retrato de antes: `getConsultaPreSMAberta` e o status da programação em `getListaProgramacaoCargas`
- [ ] T063 **Com o usuário presente**, enviar **uma** viagem escolhida, com o cancelamento à mão
- [ ] T064 Ler o retrato de depois e responder a pergunta do roteiro: **a programação passou a avisar "já possui Pré-Solicitação em aberto"?** Se sim, amarrou. Se continuar igual, nasceu solta — falar com a gerenciadora antes de seguir (ver `quickstart.md`)

---

## Dependências

```
Fase 1 (setup)
  └─ Fase 2 (migração) ── bloqueia tudo
       └─ Fase 3 (US4: as pontes) ── bloqueia a fila e o envio
            ├─ Fase 4 (o corpo puro) ── independente da fase 5
            └─ Fase 5 (US2: a aba) ── entrega valor SOZINHA
                 └─ Fase 6 (US1: o envio) ── depende da resposta pendente
                      └─ Fase 7 (US3: desfazer)
                           └─ Fases 8 e 9
```

**A Fase 5 é o MVP.** Uma aba que diz o que falta resolver, sem enviar nada, já substitui a
planilha mental de quem hoje descobre o problema abrindo o sistema da gerenciadora.

**As Fases 4 e 5 podem andar em paralelo** — arquivos diferentes, sem dependência entre si.

---

## O que pode rodar em paralelo

| Fase | Tasks paralelas |
|---|---|
| 2 | T006 e T007 |
| 3 | T010, T011, T013, T015, T023 |
| 4 | T026 a T031 — todas no mesmo arquivo de teste, mas casos independentes |
| 5 | T040 |
| 8 | T054, T055, T056 |

---

## Custo, por fase

| Fase | Toca a gerenciadora? | Custa? |
|---|---|---|
| 1 a 2 | não | — |
| 3 | sim — `getRotas` | **não**, é leitura |
| 4 | não | — |
| 5 | não | — |
| 6 | só no ensaio desligado, que não chama | **não** |
| 9 | **sim, cria de verdade** | **uma solicitação** |

Só a Fase 9 gasta. Tudo antes dela pode ser exercitado contra a produção à vontade.
