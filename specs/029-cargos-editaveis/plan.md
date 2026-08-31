# Implementation Plan: Cargos editáveis, mini perfil e selos

**Branch**: `029-cargos-editaveis` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

## Summary

O acesso ao TMS deixa de ser um catálogo em código e passa a ser dado editável. O que **não** muda é
quem decide: a autorização continua sendo resolvida no BFF, nos mesmos pontos de hoje.

**Para que isto serve, além de hoje** (usuário, 31/08): vão entrar sistemas de outros setores no TMS,
e o cargo editável é o que vai separar quem pode ver de quem pode mexer, sem deploy. Os 20
administradores atuais são o sintoma; a fatia é o alicerce.

A descoberta que define o desenho: **`requirePermission(ctx, chave)` já é um ponto de estrangulamento
único**. Dos 231 usos de permissão no `apps/web`, **169 passam por ele** e 62 chamam `can(papel, chave)`
direto, quase todos em `page.tsx` para decidir o que a tela mostra. E `loadSession` **lê a linha do
usuário no Postgres a cada requisição** — não de um token assinado.

Duas consequências que economizam a fatia inteira:

1. Nenhum dos 169 pontos precisa ser tocado. Basta o contexto carregar o CONJUNTO de permissões.
2. **FR-007 sai de graça**: mudar o cargo vale na requisição seguinte, sem ninguém sair e entrar.

Os 62 restantes **precisam** ser tocados, e isso é proposital: trocar a assinatura de `can` faz o
compilador encontrar cada um. Deixar `can(papel, …)` viva ao lado seria criar o segundo caminho de
autorização que a spec proíbe (FR-005).

## Technical Context

**Language/Version**: TypeScript strict, Node 22 · Next.js App Router

**Primary Dependencies**: nenhuma nova. Drizzle, Zod, TanStack Query, shadcn/ui e pg-boss já estão.

**Storage**: Postgres (Supabase auto-hospedado) · Supabase Storage, bucket privado da fatia 025

**Testing**: Vitest (unidade + leitura de migração), Playwright

**Target Platform**: navegador em desktop; servidor Linux na VM Oracle

**Project Type**: web (monorepo `apps/web`, `packages/{shared,db}`, `workers/`)

**Performance Goals**: a sessão já faz 1 consulta por requisição (`cache()` do React). O cargo entra
**na mesma consulta**, por `join` — nenhuma ida a mais ao banco.

**Constraints**: migração **aditiva**, porque o deploy migra ANTES do build e o app anterior continua
servindo durante ele (medido em 31/08 — ver research §5, corrigido)

**Scale/Scope**: 34 usuários, 7 cargos semeados, 23 permissões, 30 itens de menu, 231 pontos de
verificação

## Constitution Check

*GATE antes da Fase 0, reavaliado depois da Fase 1.*

- [x] **Simplicity (I)**: nenhum pacote novo, nenhum serviço novo. **Quatro tabelas e duas colunas** —
  e as quatro se justificam separadamente: `cargos` + `cargo_permissoes` são o par mínimo que responde
  em SQL a pergunta da trava do último admin (research §2); `selos` + `usuario_selos` são uma HISTÓRIA
  inteira à parte (US3, P3) e podem ser cortadas sem tocar nas outras duas. Não é abstração
  antecipada — é escopo pedido. Nenhuma abstração nova sem 3 repetições.
- [x] **Scope (II)**: dentro do escopo — §18 do PRD (permissões) é requisito de MVP, e esta fatia o
  torna operável. Nada dependente da §29 é marcado como pronto.
- [x] **System-of-record (III)**: Postgres é dono do cargo. Nada é apagado de verdade: cargo se
  **desativa**, usuário já se desativa. A foto é a exceção deliberada e declarada (FR-024, 90 dias),
  porque é dado pessoal com prazo — e o descarte é registrado em auditoria.
- [x] **Authz & secrets (IV)** — **e este é o princípio que a fatia mais toca, por isso a
  justificativa longa**: o princípio exige que *"o BFF seja a única fonte de autorização; todo acesso
  a dado passa por ele"*. Continua verdade sem uma vírgula de exceção. O que muda é **de onde o BFF
  lê** o conjunto de permissões: de um `Record` em código para duas tabelas. O ponto de decisão
  (`requirePermission`) é o mesmo, no mesmo lugar, e passa a ser o ÚNICO — a assinatura de `can`
  muda para forçar isso. RLS segue diferida; a chave de serviço segue no servidor; o gateway segue
  fechado. E o princípio exige auditar mudança de permissão: FR-025/026 fazem isso com antes e
  depois.
  O *"no DB permissions table"* que se opõe a isto é o **FR-008 da fatia 001**, não a constituição —
  decisão de feature, superada explicitamente por esta spec.
- [x] **Config over code (V)**: não se aplica a variação de cliente. Nenhum caminho por cliente.
- [x] **Tech constraints**: sem Realtime, sem Edge Functions, sem Redis/broker, sem microserviço. O
  descarte da foto entra como job do worker pg-boss que já existe, com `boss.schedule`, o mesmo
  mecanismo de outros seis jobs.
- [x] **Workflow**: branch de feature → PR para `dev`; portões de CI verdes.

**Nenhuma violação a registrar.**

## Project Structure

### Documentação (esta fatia)

```text
specs/029-cargos-editaveis/
├── spec.md
├── plan.md               ← este arquivo
├── research.md           ← as 8 decisões, com a alternativa recusada
├── data-model.md
├── quickstart.md
├── contracts/
│   └── cargos-api.md
└── checklists/requirements.md
```

### Código

```text
packages/db/
├── migrations/0060_cargos_e_perfil.sql        ← à mão; renumerar só no merge
├── schema/cargos.ts                           ← cargos, cargo_permissoes, selos, usuario_selos
├── schema/users.ts                            ← + cargo_id, + desativado_em (role INTACTO)
└── src/cargos/
    ├── cargos-read.ts
    ├── cargos-write.ts                        ← único lugar que chama a trava
    └── ainda-tem-admin.ts

packages/shared/src/auth/
├── permissions.ts                             ← `can` muda de assinatura; ROLE_PERMISSIONS vira semente
├── cargo-invariantes.ts                       ← função PURA da trava do último admin
└── catalogo-de-acesso.ts                      ← permissão → área/página, em pt-BR

apps/web/
├── lib/auth/session.ts                        ← carrega as permissões no MESMO join
├── lib/auth/require-auth.ts                   ← requirePermission passa a ler o conjunto
├── app/(shell)/admin/cargos/                  ← a tela
├── components/usuarios/mini-perfil.tsx
└── components/usuarios/nome-clicavel.tsx

workers/jobs/perfil/
└── limpar-fotos.ts                            ← descarte aos 90 dias

packages/db/seed/
└── 029-conferir-acesso.ts                     ← a prova de FR-015, leitura pura
```

## As seis etapas

Cada uma é entregável e verificável sozinha. As três primeiras não mudam nada para ninguém.

### 1. As tabelas e a semeadura (bloqueia tudo)

Migração `0060` **aditiva**: cria `cargos`, `cargo_permissoes`, `selos`, `usuario_selos`; acrescenta
`users.cargo_id` (NULO por enquanto) e `users.desativado_em`; **semeia os 7 cargos a partir de
`ROLE_PERMISSIONS`** (sete, e não oito: `customer_viewer` está no enum do banco e não no catálogo) e aponta cada uma das 34 pessoas para o seu.

`users.role` **NÃO é removido**, e o enum `app_role` **NÃO é tocado**. Ver research §5: a migração
roda com o app ANTERIOR no ar, e ele lê `role`.

### 2. A prova de que ninguém perde acesso

`packages/db/seed/029-conferir-acesso.ts`, leitura pura contra produção. Para cada pessoa, compara o conjunto
vindo de `ROLE_PERMISSIONS[role]` com o vindo das tabelas novas. **Roda antes de qualquer código
novo subir**, e a saída esperada é "34 de 34 idênticos". É o critério SC-003, executável.

### 3. A leitura passa a vir do cargo

`loadSession` traz as permissões no mesmo `join`. `can` muda de assinatura e o compilador aponta os
62 lugares. `requirePermission` passa a consultar o conjunto. **`ROLE_PERMISSIONS` sai do caminho de
execução** e fica só como semente — sem fallback (research §1).

Neste ponto o comportamento é **idêntico** ao de hoje para todo mundo, porque os cargos semeados são
os papéis. É a etapa mais arriscada e a que menos muda: exatamente o que se quer.

### 4. A tela de cargos (US1)

Criar, renomear, marcar áreas e ações, ver quantos estão em cada um, mover pessoas. A trava do último
admin num lugar só. Auditoria com antes e depois. Aqui a fatia começa a valer.

### 5. O mini perfil e a foto (US2)

Nome clicável, cartão, foto por `resource_documents` com `entityType='user'` (research §6), iniciais
quando não há foto. Job de descarte aos 90 dias (research §7).

### 6. Os selos (US3)

Criar, aplicar, exibir. Nenhuma linha deles toca autorização.

## Complexity Tracking

Nada a registrar. Nenhum desvio da constituição.

## As armadilhas desta fatia — as cinco que quebram de verdade

1. **Fallback silencioso para o papel antigo.** Se o cargo não for encontrado e o código cair em
   `ROLE_PERMISSIONS[role]`, o defeito fica invisível: tudo funciona, e ninguém descobre que a tabela
   nova não está sendo lida. Sem cargo, o conjunto é **vazio**, e a tela diz isso.
2. **Migração sem entrada no `meta/_journal.json`.** Ela é pulada e o deploy responde sucesso.
   Aconteceu duas vezes. O teste `migrations-journal.test.ts` já cobre isso — não desativar.
3. **Remover `users.role` na mesma leva.** Entre a migração à mão e o restart, quem está no ar é o
   app ANTERIOR, e ele lê `role`. Derrubar a coluna derruba a produção.
4. **Trava do último admin em quatro lugares.** Quatro validações divergem em silêncio. Uma função
   pura, chamada de um ponto só, dentro da transação, DEPOIS da escrita (research §3).
5. **Alargar a PORTA junto com a COLUNA.** O comentário em `resource-documents.ts` avisa: aceitar
   `user` no CHECK é uma coisa; deixá-lo entrar por `RESOURCE_DOCUMENT_ENTITY_TYPES` faria a rota de
   frota procurar o pai em `drivers`/`vehicles` e não achar. A foto tem rota própria (research §6).
