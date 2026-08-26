# Implementation Plan: A aba GR — a Pré-SM feita por uma pessoa

**Branch**: `027-aba-gr` · **Spec**: [spec.md](./spec.md) · **Data**: 2026-08-25

## Summary

Uma aba nova onde a pessoa que cuida de gerenciamento de risco vê as viagens atribuídas sem Pré-SM,
confere o que será enviado, e manda — uma por vez. O que falta aparece dito, com caminho para
resolver. O que já foi enviado fica visível, com o código e o cancelamento.

**A maior parte do trabalho já está construída**, na fatia 026 que está no `dev`. Esta fatia troca o
método de criação, acrescenta uma ponte de cadastro, e põe uma tela na frente do que hoje é
automático e invisível.

---

## Technical Context

**Language/Version**: TypeScript strict, Node 22 · Next.js 15 App Router

**Primary Dependencies**: TanStack Query (polling) e Table · Drizzle · Zod · Luxon · pg-boss ·
shadcn/ui · next-intl (pt-BR)

**Storage**: Postgres 16.14 (Supabase self-hosted). Tabelas novas: uma. Reaproveitadas: três.

**Testing**: Vitest para a decisão pura e o casamento de nomes; Playwright para a aba.

**Target Platform**: navegador (operação) + um worker Node

**Project Type**: web — `apps/web` (BFF + tela), `packages/{shared,db}`, `workers/`

**Performance Goals**: a fila carrega em menos de 2s com 200 viagens; o polling não pesa mais do que
o das telas de expedição que já existem.

**Constraints**: sem Realtime (polling) · a credencial da gerenciadora **só** no worker · toda
escrita na Integra é job · **sem ambiente de homologação** e **cobrança por solicitação**.

**Scale/Scope**: ~150 viagens atribuídas por dia · 228 estações nossas · **518 rotas cadastradas na
gerenciadora, das quais 53 cobrem as nossas** (52% das viagens — medido) · uma tela nova, uma
tabela nova, um job novo.

---

## Constitution Check

*GATE: antes da Fase 0, e de novo depois da Fase 1.*

- [x] **Simplicity (I)**: nenhuma abstração nova. A ponte de cidade repete o padrão da ponte de rota
      — mas são **duas**, não três: por isso são duas tabelas irmãs com o mesmo formato, e **não**
      uma "tabela genérica de correspondências". A regra dos ≥3 diz para esperar o terceiro caso.
- [x] **Scope (II)**: execução, não otimização. Efetivar a SM continua fora.
- [x] **System-of-record (III)**: o Postgres é dono do estado. Nova tentativa **insere** linha; nunca
      atualiza uma morta. Quem enviou e quando fica registrado.
- [x] **Authz & secrets (IV)**: a credencial vive só no worker — o app web não consegue importá-la
      (o cliente mora em `workers/lib/`, fora de `packages/`). Enviar exige `assign_resources`;
      confirmar correspondência exige `manage_commercial_data`. As duas são auditadas.
- [x] **Config over code (V)**: filial e perfil de segurança são **configuração**, não constante no
      código — um segundo cliente com outros valores não exige código novo.
- [x] **Tech constraints**: polling, fila no Postgres, um worker. Nada de Realtime, Edge Functions,
      Redis ou microserviço.
- [x] **Workflow**: branch de feature → PR para `dev`, com os portões verdes.

**7/7.** Conferido contra `.specify/memory/constitution.md`, não presumido.

---

## O que NÃO se reescreve

A 026 está no `dev` e boa parte dela é exatamente o que esta fatia precisa. Tocar nisso seria
retrabalho e risco:

| O que | Onde | Por que sobrevive |
|---|---|---|
| Vínculo A/F/T e migração | `0046`, `0047`, diálogo de atribuição | o `setPreSM` pede os mesmos `Vinc*` |
| Estado da Pré-SM por viagem | `trip_pre_sm` + estados, incl. `nao_tentada` | o desfecho a registrar é o mesmo |
| Uma Pré-SM ativa por viagem | índice único parcial `trip_pre_sm_viva_uk` | a garantia continua valendo |
| Cancelamento | job `pre_sm.cancelar` + botão | `setCancelaPreSM` não muda |
| Aviso de divergência | `divergenciasDaPreSm` | calculado na leitura, independe do método |
| Tela de conferência | `admin/pre-sm-modelos` | muda a coluna, não a tela |
| Cliente da Integra | `workers/lib/integra/cliente.ts` | o tratamento de `CodErro` é o mesmo |

**Some**: `setPreSMdeModelo` e `getModelosPreSM` no cliente · o job `pre_sm.carregar_modelos` · a
coluna `cod_modelo`.

**Fica guardado, desligado**: o job `pre_sm.criar` com seu interruptor e teto diário. Ele passa a
montar o corpo novo, e continua sem rodar enquanto `INTEGRA_PRE_SM_ATIVO` não for `true`.

---

## A cobertura real, medida

O plano trazia "~80 rotas, 84% das viagens". **Aquele número era dos MODELOS**, que morreram junto
com o `setPreSMdeModelo` — foi carregado da 026 para cá sem reconferir. Medido de verdade em 25/08:

| | rotas | viagens (90 dias) |
|---|---|---|
| nossas | 134 | 4.508 |
| com IBGE nas duas pontas | 96 | — |
| **com rota cadastrada na gerenciadora** | **53** | **2.340 — 52%** |

**48% das viagens não têm rota cadastrada lá.** Não é defeito do nosso lado: é trabalho de cadastro
**na Logae**, e a lista das que faltam é o que se leva para eles.

Isso muda o que a aba promete. Ela vale desde o primeiro dia para metade das viagens **e diz quais
rotas faltam cadastrar** — o que hoje ninguém sabe. Mas metade da fila vai aparecer travada em "sem
rota", e o texto da tela precisa deixar claro que isso é cadastro pendente **lá**, não defeito daqui.

---

## As pendências, e como o plano se organiza em volta delas

São **duas**, e nenhuma foi resolvida por suposição. Uma terceira caiu ao ler o manual direito
— ver a nota abaixo.

**1. Como o `setPreSM` amarra a Pré-SM à programação** que a Logae já tem do portal. Não há campo de
código de programação em nenhum método de criação — conferido em
`docs/INTEGRA-14.2-REFERENCIA.md`.

**2. Se a nossa conta pode ESCREVER.** Toda chamada feita até hoje foi leitura — `getRotas`,
`getCidades`, `getConsultaPreSMAberta`, `getVeiculo`, `getMotorista`, todas com `CodErro 0`. Que ela
leia **não prova** que ela cria, e o `CodErro 100` em homologação mostra que a conta é restrita por
ambiente.

As duas são pergunta para a gerenciadora, e as duas bloqueiam **só a Etapa 5**.

> **Uma terceira pendência foi resolvida na documentação**, depois de um erro meu de parâmetro:
> `CodFilial` = **9332** (`getTabela(FILIAIS)`) e `CodPerfilSeguranca` = **20785 · DDR SHOPEE**
> (`getTabela(PERFIL_SEGURANCA)`). Ver R5 em `research.md`.

Isso **não bloqueia nada até a Etapa 5**. A ordem abaixo põe primeiro tudo o que independe da
resposta, e isola o formato do corpo num arquivo só:

> `packages/shared/src/domain/pre-sm-corpo.ts` — puro, testado, sem rede. Quando a resposta chegar,
> **é o único lugar que muda**.

Se a resposta exigir um campo que não temos, o estrago é um arquivo e seus testes — não a fila, não
a aba, não as pontes.

---

## Ordem de implementação

Cada etapa entrega algo verificável sozinha.

### 1. As duas pontes de cadastro

A de rota **muda de forma**; a de cidade **nasce**.

`pre_sm_route_models` guarda `cod_modelo`. As duas tabelas da 026 estão **vazias em todo lugar** —
conferido — e a migração `0046` **nunca chegou à produção**. Então a troca é de forma, sem migração
de dado: `cod_modelo` vira `cod_rota`, e `descricao` passa a receber a descrição que o `getRotas`
devolve.

A tabela de cidade é irmã: estação normalizada → código IBGE, `confirmado_em` nulo ao nascer.

O `getRotas` sem parâmetros devolve **518 rotas**, e cada uma traz `CodIBGECidadeOrigem` e
`CodIBGECidadeDestino` — as 518 têm os quatro campos. É o que permite casar o par de IBGE com
`CodRota` sem uma chamada por rota.

O catálogo de cidades sai do `getCidades` com `FiltroPais: "BR"` — **5.571 cidades**, com `CodIBGE`.
**Não** do `getTabela(CIDADES)`, que devolve código interno e leva a 0% de correspondência (R2b).

**Verificável**: rodar a carga e ver as correspondências propostas na tela, sem nenhuma confirmada.

### 2. A cidade sai do nome da estação, e o casamento é por cidade

**O casamento é por CIDADE, não por estação** (R2c). As descrições das rotas dela são por cidade —
`SHPX LOGISTICA LTDA. - SIMOES FILHO/BA/BRASIL ATE ...` — e **uma** das 518 usa o nosso padrão de
estação. Casar por nome de estação acerta **1 rota de 134**, medido.

O caminho tem três passos: estação → cidade (pelo nome da estação), cidade → IBGE (pelas 518 rotas),
par de IBGE → `CodRota`.

Medido: das 228 estações, **8 têm `city`** e 71 têm `state`. O nome carrega os dois.

`tokensDaEstacao` já faz exatamente essa separação — acha a UF e descarta tudo até ela. Ganha um
irmão que **devolve** o que hoje é descartado:

```
SOC_MG_BETIM  →  { uf: "MG", cidade: "BETIM" }
```

Mesmo arquivo, mesma tolerância a acento e pontuação. **Escrever um segundo normalizador seria o
erro**: os dois divergiriam, e a divergência não daria erro nenhum — a estação simplesmente não
casaria.

**Verificável**: teste puro com as estações reais, incluindo `SOC_PE_JABOATÃO DOS GUARARAPES` e
`FM HUB_PR_UMUARAMA_PQ_INDUST_II`.

### 3. O corpo do `setPreSM`, puro

O arquivo isolado. Recebe o que a viagem tem e devolve o corpo, ou o motivo de não dar. É onde vive
a lista de **todos** os motivos (FR-006) — não só o primeiro, que é o que a 026 fazia.

Testável sem rede e sem banco.

**Verificável**: `vitest`. Nada toca a gerenciadora.

### 4. A aba GR

A tela e a rota que a alimenta. Lista as viagens atribuídas sem Pré-SM ativa, mostra o que vai ser
enviado e o que falta, com o botão travado enquanto faltar. Seção separada para as já enviadas, com
código e cancelamento.

Polling pela mesma via das telas de expedição — o estado muda por fora, porque quem cria é o worker.

**Verificável**: a aba abre com dados reais e mostra a fila certa, **sem nenhum botão de envio
funcionando ainda**.

### 5. O envio

O botão enfileira; o worker chama. Aqui entra a resposta da gerenciadora — e é a primeira etapa que
gasta.

**Verificável**: com o interruptor desligado, o job grava o que **teria** mandado. Ler essas linhas
responde quantas viagens sairiam e quantas cairiam em falta de dado, **sem custo**.

### 6. A virada

Com o usuário presente, uma viagem escolhida, e o cancelamento à mão.

---

## Como validar sem gastar

Não há homologação (`CodErro 100`, medido em 25/08) e a gerenciadora cobra por solicitação. Três
camadas, nesta ordem:

**Teste puro** (etapas 2 e 3): o casamento de nomes e a montagem do corpo são funções sem rede. A
maior parte do que pode dar errado dá errado aqui.

**Leitura contra a produção** (etapas 1 e 4): `getRotas` é consulta — não cria nada e não custa. Dá
para carregar as 518 rotas dela, conferir contra as nossas 134, e olhar a aba com dados reais,
**antes de existir botão que gaste**.

**Ensaio com o interruptor desligado** (etapa 5): o job monta o corpo e grava o que teria mandado.
Um dia disso responde quantas viagens sairiam limpas.

E o `setCancelaPreSM` é a saída — já implementado na 026. A Pré-SM criada por engano é cancelável;
a cobrança dela, não.

---

## Project Structure

### Documentation (this feature)

```
specs/027-aba-gr/
├── spec.md
├── plan.md              ← este arquivo
├── research.md          ← as decisões difíceis
├── data-model.md        ← a tabela nova e a que muda de forma
├── contracts/
│   └── setpresm.md      ← o corpo, campo a campo, e de onde cada um sai
├── quickstart.md
└── checklists/
    └── requirements.md
```

### Source Code

```
packages/shared/src/domain/
├── pre-sm-corpo.ts          NOVO — o corpo do setPreSM e os motivos de não dar
├── pre-sm-corpo.test.ts     NOVO
├── pre-sm-modelos.ts        MUDA — ganha `ufECidadeDaEstacao`; deixa de falar em modelo
└── pre-sm-modelos.test.ts   MUDA

packages/db/
├── migrations/00NN_aba_gr.sql   NOVO — cod_modelo → cod_rota, tabela de cidade
├── schema/pre-sm-route-links.ts    MUDA (era pre-sm-route-models.ts)
├── schema/pre-sm-city-links.ts     NOVO
└── src/trips/
    ├── pre-sm-rotas.ts       MUDA (era pre-sm-modelos.ts)
    ├── pre-sm-cidades.ts     NOVO
    └── gr-fila.ts            NOVO — a consulta da aba

packages/shared/src/domain/
└── pre-sm-cadastro.ts        NOVO — o casamento de cidade e de rota, puro

apps/web/
├── app/(shell)/gr/page.tsx                      NOVO — a aba
├── app/api/gr/route.ts                          NOVO — a fila
├── app/api/gr/[tripId]/enviar/route.ts          NOVO — enfileira o envio
├── app/api/admin/pre-sm-cidades/route.ts        NOVO — conferência de cidade
├── components/gr/                               NOVO — a tela
└── messages/pt-BR.json                          MUDA

workers/
├── lib/integra/cliente.ts       MUDA — setPreSM e getRotas entram;
│                                       setPreSMdeModelo e getModelosPreSM saem
└── jobs/pre-sm/
    ├── criar.ts                 MUDA — decide com o corpo novo
    ├── index.ts                 MUDA
    ├── carregar-modelos.ts      SAI
    └── carregar-cadastro.ts     NOVO — cidades e rotas, uma carga só
```

---

## Complexity Tracking

Nenhuma violação da constituição a justificar.

Uma decisão que **parece** violação e não é: a ponte de cidade e a de rota são duas tabelas com o
mesmo formato. A regra dos ≥3 (princípio I) diz para **não** generalizar antes do terceiro caso — a
"tabela genérica de correspondências" que economizaria dez linhas custaria uma coluna de tipo, um
`where` em toda consulta, e uma tela que precisa saber qual tipo está mostrando. Fica repetido, de
propósito, até um terceiro caso aparecer.
