# Implementation Plan: Pré-SM criada sozinha ao atribuir

**Branch**: `026-pre-sm-logae` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-pre-sm-logae/spec.md`

## Summary

Quando a ordem de atribuição volta confirmada do portal do cliente, o TMS cria sozinho a
pré-solicitação de monitoramento na gerenciadora Logae, usando `setPreSMdeModelo` — o método que
pede só o que varia por viagem, porque o modelo da rota já está cadastrado lá.

O trabalho acontece **no worker**, disparado pelo mesmo ponto que hoje encerra a ordem do portal. O
vínculo A/F/T que a gerenciadora exige vira um terceiro valor no `ownership_type` que já existe,
escolhido no diálogo de atribuição e guardado por recurso.

Três coisas moldam o desenho mais do que a funcionalidade em si, e estão resolvidas em
[research.md](./research.md): **não há ambiente de teste** (R1), **o CHECK do `ownership_type`
impede a divisão se não for reescrito** (R2), e **duplicata custa dinheiro de verdade** (R3).

## Technical Context

**Language/Version**: TypeScript strict (Node 22 no worker, Next.js 15 App Router na web)

**Primary Dependencies**: Drizzle (Postgres), pg-boss (fila), Zod (validação), Luxon (datas/fuso),
TanStack Query (polling). **Nenhuma dependência nova** — o cliente da Integra é `fetch` do runtime.

**Storage**: Postgres self-hosted (Supabase Postgres/Auth/Storage). Uma tabela nova
(`trip_pre_sm`), uma tabela de correspondência (`pre_sm_route_models`), um valor novo no enum
`ownership_type`, e três CHECKs reescritos.

**Testing**: Vitest para a lógica pura e para o mapeamento; nenhum teste automatizado chama a
gerenciadora (ver R5).

**Target Platform**: o mesmo deploy de hoje — um app Next + um worker Node na VM.

**Project Type**: monorepo web (`apps/web`, `packages/{shared,db}`, `workers/`).

**Performance Goals**: a Pré-SM existe em até 5 minutos após a atribuição chegar ao portal em 95%
dos casos (SC-005). A criação é assíncrona por definição: quem atribui não espera por ela.

**Constraints**: a chamada externa não pode bloquear a rota do BFF nem a tela; **no máximo uma
Pré-SM por viagem**, garantido em banco; credenciais só no worker; a feature nasce desligada por
variável de ambiente (R1).

**Scale/Scope**: ~150 atribuições/dia hoje. Das viagens dos últimos 30 dias, 84% rodam em rota com
modelo cadastrado e 81% dos motoristas têm CPF — os dois tetos práticos da automação.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Simplicity (I)**: sem abstração nova sem repetição real. O cliente da Integra é **um módulo,
      não uma camada** — três métodos (`setPreSMdeModelo`, `getStatusPreSM`, `setCancelaPreSM`) com
      a mesma forma de chamada. Sem pacote novo: o código de domínio vai em `packages/shared`, o
      acesso a dados em `packages/db`, o trabalho em `workers/jobs/`. Sem dependência nova.
- [x] **Scope (II)**: dentro do escopo. Efetivação, alteração e cancelamento automático ficaram
      explicitamente fora (spec, Out of Scope).
- [x] **System-of-record (III)**: o Postgres guarda o estado da Pré-SM e as transições; o histórico
      da viagem recebe cada criação, recusa e cancelamento (FR-019); nada é apagado.
- [x] **Authz & secrets (IV)**: as credenciais da Integra são lidas **só no worker**, nunca em
      `NEXT_PUBLIC_*` nem em resposta de rota. O cancelamento (FR-017) passa pelo BFF com a mesma
      permissão de atribuir, e é auditado.
- [x] **Config over code (V)**: a correspondência rota → modelo é **dado em tabela**, não código —
      é o ponto que mais mudaria por cliente, e por isso é o que não pode virar `if`.
- [x] **Tech constraints**: fila Postgres via pg-boss + o worker que já existe. Sem Realtime, sem
      Edge Function, sem broker, sem serviço novo. A tela acompanha por polling, como o resto.
- [x] **Workflow**: branch `026-pre-sm-logae` → PR para `dev`, CI verde.

**Nenhuma violação a registrar em Complexity Tracking.**

Ponto que mereceu atenção no gate da Simplicidade: a tabela de correspondência rota → modelo poderia
ser "só um mapa em código". Foi rejeitado em R4 — o casamento por nome já errou uma vez nesta
sessão, e uma regra que roda a cada criação é uma regra que ninguém revisa. Como tabela, ela é
conferível antes de valer.

**Reavaliação depois do desenho (Fase 1)**: os gates continuam passando. O desenho acrescentou duas
tabelas, dois valores de enum e um job — nenhum pacote, nenhum serviço, nenhuma dependência. O único
item que mudou de peso foi a Simplicidade, pelo mesmo motivo já registrado acima, e a justificativa
se sustenta.

## Project Structure

### Documentation (this feature)

```text
specs/026-pre-sm-logae/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # R1..R6 — as decisões difíceis
├── data-model.md
├── quickstart.md
├── contracts/
│   └── integra-pre-sm.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/shared/src/domain/
├── pre-sm.ts                    # PURO: monta o corpo, decide não criar, traduz o vínculo
├── pre-sm.test.ts
├── pre-sm-modelos.ts            # PURO: casamento rota → modelo, com as 4 tolerâncias
└── pre-sm-modelos.test.ts

packages/db/
├── schema/
│   ├── enums.ts                 # ownership_type ganha `agregado` e `terceiro`
│   ├── trip-pre-sm.ts           # NOVA: o estado da Pré-SM por viagem
│   ├── pre-sm-route-models.ts   # NOVA: rota → código do modelo
│   ├── vehicles.ts              # CHECK reescrito
│   ├── trailers.ts              # CHECK reescrito
│   └── drivers.ts               # CHECK reescrito
├── migrations/
│   └── 00NN_*.sql               # --custom: enum + 3 CHECKs + 2 tabelas + índice único parcial
└── src/trips/
    ├── pre-sm.ts                # leitura/escrita do estado
    └── portal-commands.ts       # o encerramento passa a dizer se enfileirou

workers/
├── lib/integra/
│   ├── cliente.ts               # os 3 métodos; lê as credenciais do ambiente
│   └── cliente.test.ts          # só o formato da chamada, sem rede
└── jobs/
    ├── index.ts                 # + registerPreSm
    └── pre-sm/
        ├── index.ts             # o trabalho: monta, decide, chama, grava
        └── pre-sm.test.ts

apps/web/
├── app/api/trips/[id]/pre-sm/route.ts   # ver estado; cancelar (FR-016, FR-017)
└── components/trips/
    ├── portal-assign-dialog.tsx          # + o campo de vínculo por recurso
    └── pre-sm-status.tsx                 # NOVO: estado + motivo + cancelar, na viagem
```

**Structure Decision**: nada de novo na topologia. A lógica pura em `packages/shared/src/domain/`
(onde já vivem `portal-assignment.ts` e `assignment-eligibility.ts` — mesma família de problema), o
acesso a dados em `packages/db`, o trabalho em `workers/jobs/`, e a tela em `apps/web`. O cliente da
Integra fica **dentro do worker** (`workers/lib/integra/`) e não em `packages/`, porque ninguém mais
deve poder chamá-lo — quem precisar do estado lê o banco.

## Ordem de implementação

Cada etapa fecha sozinha e pode ser conferida antes da seguinte.

**1. O vínculo (US2)** — enum, CHECKs, migração, o campo no diálogo. Entrega valor sem depender da
gerenciadora: o cadastro passa a distinguir agregado de terceiro, o que hoje ninguém sabe. É também
a etapa de maior risco de banco, e vai primeiro por isso.

**2. A correspondência rota → modelo (R4)** — tabela, carga, conferência. Também independente: o
resultado é uma lista que uma pessoa revisa, e ela já responde "quais rotas ficariam de fora".

**3. A decisão, pura (US3)** — montar o corpo e decidir não criar. Testável inteira sem rede, e é o
que garante que a falha nunca é silenciosa.

**4. O trabalho e o cliente (US1)** — a fila, a chamada, o estado gravado. Nasce com o interruptor
desligado: roda tudo, registra o que mandaria, não chama.

**5. A tela (US1, US4)** — estado na viagem e o cancelamento. O cancelamento entra **junto** da
criação, não depois: sem ambiente de teste, ele é a única forma de desfazer.

**6. A virada** — ligar o interruptor com o usuário, numa viagem escolhida, com o cancelamento à mão.

## Riscos e o que os contém

| Risco | O que contém |
|---|---|
| Não há ambiente de teste; escrita só em produção, e ela custa | Interruptor desligado por padrão; teto diário começando em zero; cancelamento pronto no dia 1 (R1) |
| A migração do vínculo é recusada pelo CHECK atual | CHECK reescrito na mesma migração, em forma que não enumera valores (R2) |
| Pré-SM duplicada = escolta cobrada em dobro | Índice único parcial no banco + enfileiramento só quando o encerramento da ordem devolve `true` (R3) |
| O casamento rota → modelo erra e a viagem fica sem Pré-SM em silêncio | A correspondência é tabela conferível, e "sem modelo" é motivo visível na viagem (R4, FR-013) |
| A credencial se perde no próximo deploy | Vai no `config.env`, não só no `.env.local` — a lição já está em `docs/OPERACAO.md` (R6) |
| A gerenciadora fica fora do ar | Tentativas repetidas; a viagem distingue "ainda tentando" de "desistiu" (FR-015) |

## O que este plano NÃO resolve, e é honesto dizer

Nenhum teste automatizado prova que **a gerenciadora aceita o nosso corpo**. Sem homologação, isso
só a primeira criação real responde. O plano compensa com o que dá para controlar — a feature nasce
desligada, a primeira criação é deliberada, e o desfazer existe desde o começo — mas não substitui a
prova que não temos.
