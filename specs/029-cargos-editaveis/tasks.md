---
description: "Tasks — 029 cargos editáveis, mini perfil e selos"
---

# Tasks: Cargos editáveis, mini perfil e selos

**Input**: `specs/029-cargos-editaveis/` — plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Testes**: incluídos. Esta fatia mexe em **autorização**, e três dos defeitos que ela pode causar
(fallback silencioso, catálogo envelhecido, migração pulada) são **ausências** — ausência não tem
tipo, e a única forma de cobrá-la é um teste que conta.

## Formato: `[ID] [P?] [Story] Descrição`

- **[P]**: pode correr em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1 (cargos), US2 (mini perfil), US3 (selos)

---

## ONDE DÁ PARA PARAR SEM DEIXAR O SISTEMA PELA METADE

Isto governa a ordem inteira e é o que permite entregar por partes:

| fases | o que muda para quem usa |
|---|---|
| **1 · 2 · 3** | **NADA.** Os cargos semeados são os papéis de hoje; o comportamento fica idêntico |
| **4** (US1) | aqui a fatia passa a valer — o admin começa a editar acesso |
| **5** (US2) · **6** (US3) | acréscimos, sem tocar em autorização |

A fase 3 é a mais arriscada **e a que menos muda**. Se ela não for invisível, algo está errado.

---

## O QUE JÁ EXISTE E NÃO SE REESCREVE

| | onde | por quê |
|---|---|---|
| os **169** `requirePermission(ctx, chave)` | `apps/web/app/**` | já são o ponto de estrangulamento; a fase 3 muda o que ele consulta, não eles |
| bucket privado, histórico, link curto | fatia **025**, `resource-documents-service.ts` | é por onde a foto entra |
| `nav.ts`, 30 itens com `permission` e `grupo` | `apps/web/lib/nav.ts` | o catálogo de áreas é **derivado** dele, nunca redigitado |
| `migrations-journal.test.ts` | `packages/db/src/` | cobre os dois sentidos; **não desativar** |
| `boss.schedule` | 6 jobs no `workers/` | o de foto entra pelo mesmo mecanismo |
| `audit_logs` com `previous_value`/`new_value` | `packages/db/schema/audit-logs.ts` | já é exatamente a forma que o FR-026 pede |

---

## Fase 1: Setup

**Objetivo**: o esqueleto dos arquivos, sem comportamento. Nada muda para ninguém.

- [X] T001 [P] Criar `packages/db/schema/cargos.ts` com as quatro tabelas de `data-model.md` (`cargos`, `cargo_permissoes`, `selos`, `usuario_selos`), sem tocar em `users.ts` ainda
- [X] T002 [P] Acrescentar `cargoId` (uuid **NULL**) e `desativadoEm` (timestamptz NULL) em `packages/db/schema/users.ts` — **sem remover `role`, sem tocar no enum `appRole`, sem tocar em `users_role_idx`**
- [X] T003 Exportar as tabelas novas em `packages/db/schema/index.ts`

---

## Fase 2: Fundação — a migração e a semeadura (BLOQUEIA TUDO)

**Objetivo**: as tabelas existem e todo mundo já tem cargo equivalente ao papel de hoje. O app
**anterior** continua no ar lendo `users.role`, e continua funcionando.

- [X] T004 Escrever À MÃO `packages/db/migrations/0060_cargos_e_perfil.sql`: cria as quatro tabelas, PK composta em `cargo_permissoes(cargo_id, permissao)`, índice em `cargo_permissoes(permissao)`, acrescenta `users.cargo_id` (NULL) e `users.desativado_em`
- [X] T005 Na MESMA migração, alargar `resource_documents_entity_type_ck` para aceitar `'user'` — **a COLUNA, não a porta** (T029 trata da porta)
- [X] T006 Na MESMA migração, semear os **7 cargos** com os nomes dos **papéis atribuíveis** e preencher `cargo_permissoes` a partir de `ROLE_PERMISSIONS`, **escrito literalmente no SQL** (não gerado em execução: a migração precisa ser lida e conferida por uma pessoa). **Sete, e não oito**: o enum `app_role` tem 8 valores, mas `ROLE_PERMISSIONS` só tem 7 — `customer_viewer` não está no catálogo, e criá-lo à mão violaria o FR-017
- [X] T007 Na MESMA migração, `update users set cargo_id = <o cargo do seu role>` para as 34 pessoas
- [X] T008 **Acrescentar a entrada da `0060` em `packages/db/migrations/meta/_journal.json`** — sem ela a migração é pulada e o deploy responde sucesso (aconteceu duas vezes)
- [X] T009 Rodar `npx vitest run migrations-journal` e confirmar verde — é o teste que cobra T008 nos dois sentidos
- [X] T010 [P] Escrever `packages/db/src/cargos/cargos-schema.test.ts` lendo o SQL da `0060` e afirmando que ela **não contém** `drop column role`, `drop type app_role` nem `alter column cargo_id set not null` — os três derrubariam a produção entre a migração e o restart (research §5)

**Ponto de parada**: aplicável em produção com o sistema em uso. Nada mudou para ninguém.

---

## Fase 3: A prova de que ninguém perde acesso (SC-003, FR-015)

**Objetivo**: transformar "ninguém perde acesso" de promessa em saída de terminal. Roda ANTES de
qualquer código novo subir.

- [X] T011 Criar `packages/db/seed/029-conferir-acesso.ts` (convenção do repositório: scripts operacionais vivem em `seed/`, rodados por `tsx`): para cada pessoa, monta o conjunto **antes** (`ROLE_PERMISSIONS[users.role]`) e o **depois** (`users.cargo_id → cargo_permissoes`), e imprime uma linha por divergência
- [X] T012 Registrar `"db:conferir-acesso": "tsx ./seed/029-conferir-acesso.ts"` em `packages/db/package.json`
- [ ] T013 Rodar contra **produção em leitura** e exigir a saída `34 pessoas · 34 idênticas · 0 divergentes`. Divergência ⇒ a semeadura está errada, e **nada precisa ser desfeito**: o app novo ainda não subiu e `users.role` ainda manda
- [ ] T013a **Conferir a conta mestre pelo nome** (FR-017a): `victorti@braziltransports.com.br` tem de cair no cargo semeado de `admin`, com as **23** capacidades. O relatório de 34 linhas idênticas esconde bem uma linha específica, e esta é a que abre a porta para consertar as outras. O e-mail NÃO entra no código de autorização — é conferência, não regra (ver FR-017a)

**Ponto de parada**: a virada está provada e ainda não aconteceu.

---

## Fase 4: A leitura passa a vir do cargo (bloqueia US1)

**Objetivo**: o BFF passa a ler o conjunto das tabelas. **Comportamento idêntico ao de hoje** —
essa invisibilidade é o critério de sucesso desta fase.

- [ ] T014 Em `packages/shared/src/auth/permissions.ts`, trocar a assinatura de `can(papel, chave)` para `can(principal, chave)`, onde `principal` é `{ permissoes: ReadonlySet<PermissionKey> }`. **Não deixar a assinatura antiga viva ao lado** — duas funções são os dois caminhos de autorização que o FR-005 proíbe
- [ ] T015 No mesmo arquivo, marcar `ROLE_PERMISSIONS` como **semente da migração**, fora do caminho de execução, com o comentário dizendo que nenhum código de runtime pode voltar a lê-la
- [ ] T016 Em `apps/web/lib/auth/session.ts`, trazer as permissões no **mesmo `select`** de `loadSession`, por `join` com `cargo_permissoes` — sem consulta adicional (a sessão já lê o banco a cada requisição, e é isso que faz FR-007 sair de graça)
- [ ] T017 **Cargo ausente ⇒ conjunto VAZIO.** Nunca `ROLE_PERMISSIONS[role]`. Um fallback esconderia o defeito mais importante: tudo continuaria funcionando e ninguém saberia que a tabela nova não está sendo lida (research §1)
- [ ] T018 Em `apps/web/lib/auth/require-auth.ts`, `AuthContext` ganha `permissoes` e `requirePermission` passa a chamar `can(ctx, chave)`. **Os 169 pontos NÃO são tocados**
- [ ] T019 Atualizar os **62** `can(role, …)` diretos que o compilador apontar — quase todos em `page.tsx`, decidindo o que a tela desenha. Conferir que o `tsc` fica limpo nos quatro pacotes: é o compilador provando que nenhum ficou para trás
- [ ] T020 [P] Escrever `apps/web/lib/auth/sem-cargo.test.ts` afirmando que um usuário sem `cargo_id` recebe conjunto **vazio** e é recusado em toda permissão — o teste que tranca T017
- [ ] T021 Fazer `GET /api/me` devolver `cargo` e `permissoes` (contracts). A tela usa **a mesma lista** que o servidor usa para decidir; duas listas seriam dois caminhos

**Ponto de parada**: comportamento idêntico ao de antes, lido de outro lugar. Se alguém notar
diferença, é defeito.

---

## Fase 5 (US1 · P1): A tela de cargos — **aqui a fatia passa a valer**

**Objetivo**: o admin cria "Despachante", marca Torre de Controle e Expedição, põe alguém, e a
pessoa passa a ver exatamente isso — sem deploy nenhum.

**Teste independente**: criar cargo, pôr uma pessoa, entrar como ela, conferir menu e rotas.

### O catálogo que a tela mostra

- [ ] T022 [P] [US1] Criar `packages/shared/src/auth/catalogo-de-acesso.ts`: **áreas e páginas derivadas do `nav.ts`** (agrupadas pelo `grupo` que ele já declara), mais as **ações** que nenhum item de menu reivindica (`cancel_trip`, `delete_archive`, `export_billing`, `resolve_dispute`), estas com rótulo próprio em pt-BR
- [ ] T023 [US1] Escrever `packages/shared/src/auth/catalogo-de-acesso.test.ts` afirmando que **toda `PermissionKey` aparece em exatamente um lugar** — página ou ação, nunca nos dois, nunca em nenhum. Uma permissão nova **derruba a CI** até alguém a colocar; sem isto ela fica inalcançável para quem não é admin, sem erro nenhum

### A trava do último admin — UMA vez

- [ ] T024 [P] [US1] Criar `packages/shared/src/auth/cargo-invariantes.ts` com a função **pura** que decide se um estado é admissível, no espírito do `pre-sm-corpo.ts` da 027, devolvendo **todos** os motivos e não o primeiro
- [ ] T025 [US1] Criar `packages/db/src/cargos/ainda-tem-admin.ts`: a consulta `count(*)` de pessoas **ativas** cujo cargo alcança `manage_users`, chamada **dentro da transação e DEPOIS da escrita**. Verificar antes perde a corrida de duas abas rebaixando um administrador cada (research §3)
- [ ] T026 [US1] Escrever `packages/shared/src/auth/cargo-invariantes.test.ts` cobrindo os **quatro** caminhos do FR-010: desativar o cargo, tirar a permissão, mover a última pessoa, desativá-la. Um caso a mais afirma que um cargo SEMEADO é editável e renomeável como qualquer outro (FR-016) — eles são ponto de partida, não estrutura

### Dados e rotas

- [ ] T027 [P] [US1] `packages/db/src/cargos/cargos-read.ts` — listar cargos com a **contagem de pessoas** em cada (FR-008)
- [ ] T028 [US1] `packages/db/src/cargos/cargos-write.ts` — criar, renomear, gravar permissões (estado final, sem `add`/`remove`), desativar. **Único lugar que chama T025.** Auditoria com a **lista inteira** antes e depois, nunca a diferença (FR-026)
- [ ] T029 [US1] Rotas de `contracts/cargos-api.md`: `GET/POST /api/cargos`, `PUT/DELETE /api/cargos/[id]`, `PUT /api/users/[id]/cargo`. Recusas `422` com `ULTIMO_ADMIN`, `CARGO_COM_PESSOAS`, `ALEM_DO_PROPRIO_ACESSO`, `PERMISSAO_DESCONHECIDA`
- [ ] T030 [US1] A resposta devolve **o que ficou guardado**, não o que foi mandado — a tela não pode seguir achando que gravou outra coisa (foi o defeito de `programacao_prefs`, invertido)
- [ ] T031 [US1] Impedir que alguém conceda o que ele mesmo não alcança (FR-012), no servidor

### Tela

- [ ] T032 [US1] `apps/web/app/(shell)/admin/cargos/page.tsx` + cliente: lista com contagem, criar, renomear, e o painel de marcação em áreas/ações vindo de T022
- [ ] T033 [US1] Avisar, antes de salvar, quando um cargo fica **sem nada marcado** — é permitido (todo cargo nasce assim) e parece defeito
- [ ] T034 [US1] Apagar cargo com gente dentro **exige destino** (`moverPara`); sem destino, recusa
- [ ] T035 [US1] Acrescentar o item "Cargos" ao `nav.ts`, grupo `sistema`, permissão `manage_users`
- [ ] T035a [US1] **A metade SERVIDOR do FR-006**: escrever teste de rota afirmando que abrir o ENDEREÇO de uma página fora do cargo devolve 403, com o menu já a escondendo. Esconder no menu nunca é a única defesa, e é o cenário 2 da US1 (*"inclusive se digitar o endereço direto"*) — sem este teste, a única prova é o menu encolher, que não prova nada sobre quem digita a URL
- [ ] T035b [US1] **Usuário NOVO nasce com cargo** (FR-011): a criação de usuário passa a exigir `cargoId`, recusado no servidor. `cargo_id` é NULL na coluna de propósito (research §5, por causa do app anterior), então é a aplicação que sustenta o invariante I2 até o `NOT NULL` de uma fatia futura — sem isto, FR-011 é falso para todo cadastro feito a partir de agora
- [ ] T036 [US1] Conferir a mão pelo `quickstart.md` §4 e §5: mover alguém de cargo e ver o menu encolher **sem sair e entrar**; e os quatro caminhos do último admin recusados com motivo em português

**Ponto de parada**: US1 completa. Os 20 admins já podem virar 3.

---

## Fase 6 (US2 · P2): O mini perfil e a foto

**Teste independente**: clicar num nome em qualquer lista, ver o cartão certo; trocar a própria foto.

- [ ] T037 [P] [US2] `apps/web/components/usuarios/mini-perfil.tsx` — cartão com foto, nome, cargo e selos. **Não** mostra e-mail nem a lista de permissões: responde "quem é", não "o que alcança"
- [ ] T038 [P] [US2] `apps/web/components/usuarios/nome-clicavel.tsx` — o nome vira botão onde ele aparece
- [ ] T039 [US2] `GET /api/users/[id]/perfil` (contracts). Conta desativada volta `ativo: false`, e o cartão diz isso em vez de abrir vazio
- [ ] T040 [US2] Iniciais quando não há foto, distinguíveis entre pessoas — **nunca** um mesmo ícone genérico para todos (FR-020)
- [ ] T041 [US2] Acrescentar o ramo `user` em `assertResourceDocumentParent` (`apps/web/lib/master-data/resource-documents-service.ts`), procurando em `users`; o equivalente a `archivedAt` aqui é `status = 'disabled'` — desativado não recebe foto nova
- [ ] T042 [US2] **NÃO alargar `RESOURCE_DOCUMENT_ENTITY_TYPES`.** Ele é a PORTA das rotas de frota e continua `driver|vehicle`; alargá-lo faria a rota de frota procurar o pai em `drivers`/`vehicles` e não achar (research §6, e o comentário no schema avisa)
- [ ] T043 [US2] Rotas próprias da foto: `PUT /api/me/foto`, `PUT /api/users/[id]/foto` (`manage_users`), `GET /api/users/[id]/foto` com link de curta duração — **nunca** endereço público permanente
- [ ] T044 [US2] Recusar `413` acima do teto e `415` fora dos formatos, **sem guardar nada** (FR-021)
- [ ] T045 [US2] Preencher `users.desativado_em` ao desativar e **zerá-lo ao reativar** — é assim que a reativação para o relógio dos 90 dias, sem código especial
- [ ] T046 [US2] `workers/jobs/perfil/limpar-fotos.ts` com `boss.schedule`, **uma vez por dia**, cron configurável: apaga o objeto no bucket **e** a linha em `resource_documents` de quem está `disabled` há mais de 90 dias. Objeto sem linha vira lixo invisível; linha sem objeto vira cartão quebrado
- [ ] T047 [US2] Registrar o descarte em auditoria — é a única exclusão real desta fatia (princípio III)
- [ ] T048 [P] [US2] Teste do alvo do job: só `disabled` **e** `desativado_em` além de 90 dias; quem foi reativado não entra

---

## Fase 7 (US3 · P3): Os selos

**Teste independente**: criar selo, aplicar a duas pessoas, ver nos dois perfis — e confirmar que o
que elas conseguem fazer **não mudou**.

- [ ] T049 [P] [US3] `packages/db/src/cargos/selos.ts` — criar, renomear, aplicar, retirar
- [ ] T050 [US3] Rotas de selo (contracts). **Nenhuma escreve em `cargo_permissoes` nem em `users.cargo_id`** — é por construção que o FR-013 vale. Registrar em auditoria aplicar e tirar selo, com a lista antes e depois, como o `data-model.md` já previa
- [ ] T051 [US3] Exibir os selos no mini perfil e ao lado do nome, com o **cargo ainda distinguível deles** (FR-013 é sobre acesso; este item é sobre não confundir quem lê)
- [ ] T052 [US3] Tela de selos em `apps/web/app/(shell)/admin/cargos/` (mesma área, aba separada) — não é assunto que mereça item próprio no menu
- [ ] T053 [P] [US3] Teste afirmando que aplicar ou retirar selo **não muda** o conjunto de permissões da pessoa

---

## Fase 8: Fechamento

- [ ] T054 Rodar os quatro `tsc`, `npx vitest run` e **`npx eslint .` da RAIZ** — `pnpm -r lint` não cobre `scripts/` e já deixou a CI vermelha
- [ ] T055 Rodar `db:conferir-acesso` **de novo**, agora com o app novo no ar, e confirmar que continua 34 de 34
- [ ] T056 Renumerar a migração se `0060` tiver sido tomada no `dev` — **só no merge**, nunca antes
- [ ] T057 Registrar em `docs/OPERACAO.md` que a `0060` é aditiva e roda com o app anterior no ar, e que `users.role` segue vivo à espera de uma fatia futura

---

## Dependências

```
Fase 1 (esqueleto)
   └─> Fase 2 (migração + semeadura)      ← BLOQUEIA TUDO
          └─> Fase 3 (a prova)             ← roda ANTES de código novo subir
                 └─> Fase 4 (leitura vem do cargo)
                        └─> Fase 5 = US1   ← aqui passa a valer
                               ├─> Fase 6 = US2 (só precisa do cargo para exibi-lo)
                               └─> Fase 7 = US3 (independente)
```

- **US2 depende de US1** apenas para mostrar o cargo no cartão; nome clicável e foto funcionam antes.
- **US3 é independente** das duas.
- **T019 depende de T014**: é a troca de assinatura que produz a lista dos 62.

## O que dá para fazer em paralelo

- T001, T002 (arquivos diferentes)
- T022 e T024 (catálogo e invariante não se tocam)
- T027 com T032 (leitura e tela)
- T037, T038 (dois componentes)
- Dentro da US3, quase tudo

## Escopo do MVP

**Fases 1 a 5** (T001–T036). Entrega a US1 inteira: o admin edita acesso sem deploy, e os 20
administradores podem virar 3 — que é o SC-001. US2 e US3 são acréscimos sobre um sistema já correto.

## As armadilhas, uma última vez

1. **Fallback silencioso** (T017, T020) — cargo ausente é conjunto vazio, e a tela diz.
2. **`users.role` fica** (T002, T010) — a migração roda com o app anterior no ar.
3. **Trava num lugar só** (T024–T026) — dentro da transação, depois da escrita.
4. **Coluna sim, porta não** (T005, T042).
5. **Journal obrigatório** (T008, T009).
6. **`can` muda de assinatura** (T014) — é o compilador que protege a fatia.
7. **O teste do catálogo** (T023) — permissão nova derruba a CI em vez de sumir em silêncio.
