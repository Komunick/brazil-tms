# Implementation Plan: Motoristas disponíveis

**Branch**: `feat/motoristas-disponiveis` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-motoristas-disponiveis/spec.md`

## Summary

A planilha PROGRAMAÇÃO SHOPEE FROTA vira uma aba viva dentro da Torre de Controle. **Nenhum dado
novo, nenhuma tabela, nenhuma coluna**: a disponibilidade é conclusão tirada a cada leitura da
viagem que o portal já nos manda.

**A decisão que governa a fatia é de onde vem o motorista da viagem — e a resposta NÃO é
`trip_assignments`.** Medido em 03/09: 49 viagens de 760 têm motorista no portal e nenhuma
atribuição nossa (o inverso é zero), e em 18 de 406 pares a atribuição nossa aponta para **outra
pessoa** — em todos os 18, o `ID do motorista (portal)` resolve para o nome do portal, ou seja, a
atribuição nossa é a versão velha de uma viagem reatribuída lá depois. Construir a aba sobre a
atribuição faria motorista em viagem aparecer como livre e motorista livre não aparecer.

A consulta candidata foi medida contra a produção: **10,9 ms**, 215 linhas (116 finalizados, 19
cancelados, 80 a caminho), tudo em cache, sem índice novo.

## Technical Context

**Language/Version**: TypeScript strict (Next.js 15 App Router, React 19)
**Primary Dependencies**: Drizzle ORM · TanStack Query · TanStack Table · Tailwind + shadcn/ui · Luxon
**Storage**: Postgres (Supabase self-hosted). **Sem tabela nova nesta fatia.**
**Testing**: Vitest (derivação pura + leitura) · Playwright (a tela)
**Target Platform**: Web, navegador de mesa na operação
**Project Type**: Monorepo — `apps/web`, `packages/{shared,db}`
**Performance Goals**: consulta em **menos de 50 ms** (medida hoje: 10,9 ms); lista abre em menos de 2 s com ~215 linhas
**Constraints**: sem Realtime/Edge Functions/broker · autorização no BFF · fuso America/Sao_Paulo · pt-BR
**Scale/Scope**: ~215 motoristas na janela, ~4.000 viagens em 8 dias, 1.518 motoristas cadastrados

## Constitution Check

| # | Princípio | Situação | Como |
|---|-----------|----------|------|
| I | Simplicity First (KISS · DRY · YAGNI) | **PASSA, com uma justificativa** | Nenhuma tabela, nenhuma migração, nenhuma abstração nova. Reusa `placasDoPortal`, `bloqueiosPorIdDoPortal` e a navegação que existe. A única função nova em `packages/shared` tem **dois** consumidores — abaixo da régua de três. Registrada em Complexity Tracking. |
| II | Execution-Focused Scope | **PASSA** | É execução pura: quem está livre para receber carga. Não otimiza rota, não sugere motorista, não decide nada. |
| III | System-of-Record Integrity | **PASSA** | Só leitura. Nada é arquivado nem apagado, porque nada é escrito. O estado NÃO é copiado para coluna nossa (FR-016) — é derivado do portal a cada leitura. |
| IV | Authorization & Secrets Discipline | **PASSA** | `view_all_trips`, a mesma da Torre de Controle. Decidida no BFF, na rota e na página. Nenhuma permissão nova, nenhum segredo envolvido. |
| V | Configuration over Code | **PASSA** | Nada específico de cliente. A regra é de operação, não de contrato — e os rótulos de status já vêm do catálogo de tradução que existe. |
| VI | Spec-Driven Delivery | **PASSA** | spec 16/16 sem marcadores, este plano, e as tarefas depois. |
| — | Technology Constraints | **PASSA** | Sem Realtime, sem Edge Functions, sem broker, sem microserviço. Frescor por polling do TanStack Query. |

**Gate: 7/7.**

## Project Structure

### Documentation (this feature)

```text
specs/031-motoristas-disponiveis/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # R1..R10 — as dez decisões, cada uma com a alternativa recusada
├── data-model.md        # a derivação, os invariantes I1..I4
├── contracts/
│   └── motoristas-disponiveis-api.md
├── quickstart.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
packages/shared/src/domain/
└── disponibilidade.ts            # NOVO — a derivação pura: rótulo do estado + o corte de 7 dias
└── disponibilidade.test.ts       # NOVO

packages/db/src/fleet/
└── motoristas-disponiveis.ts     # NOVO — a consulta única
└── motoristas-disponiveis.test.ts# NOVO — teste de fonte: a consulta NÃO parte da atribuição

apps/web/app/api/fleet/motoristas-disponiveis/
└── route.ts                      # NOVO — GET, view_all_trips

apps/web/app/(shell)/motoristas-disponiveis/
└── page.tsx                      # NOVO — guarda de servidor

apps/web/components/fleet/
└── motoristas-disponiveis-client.tsx  # NOVO — a tabela

apps/web/lib/
└── nav.ts                        # ALTERADO — a aba, com pai: "trips"

apps/web/messages/pt-BR.json      # ALTERADO — os rótulos
```

**Nenhum arquivo em `packages/db/migrations/`** — a fatia não migra nada.

---

## As seis etapas, na ordem

### 1. A derivação pura (`packages/shared`)

A função que, dado o estado de uma viagem e a data de conclusão, devolve o rótulo (`finalizado`,
`cancelado`, `a_caminho`) e diz se a linha ainda cabe na aba. Sem chamador nenhum, sob teste. É onde
a regra do corte de 7 dias e a distinção "cancelada não é finalizada" se provam sem banco.

**Não muda nada para ninguém.**

### 2. A leitura (`packages/db`)

A consulta única. É aqui que mora a decisão da fonte, e onde o teste de fonte tranca que ela não
volte a partir da atribuição.

**Não muda nada para ninguém** — nenhuma tela a chama ainda.

### 3. A rota

`GET /api/fleet/motoristas-disponiveis`, com `view_all_trips`. Devolve a lista pronta e as duas
contagens.

**Não muda nada para ninguém** — nenhuma tela a chama ainda.

### 4. A tela

Página, tabela, busca, ordenação, as duas contagens, o selo do impedimento. É aqui que passa a valer.

### 5. A navegação

A aba aparece no menu, filha da Torre de Controle. Fica por último de propósito: até ela, a tela
existe mas ninguém tropeça nela.

### 6. As provas que não são teste de unidade

O Playwright da tela e a conferência à mão contra a produção.

**As etapas 1 a 3 não mudam nada para nenhum usuário** — é o que permite parar entre elas sem deixar
o sistema meio feito.

---

## AS SETE ARMADILHAS

1. **A FONTE.** Partir de `trip_assignments` esconde 67 motoristas na janela da aba e aponta para a
   pessoa errada em 18 casos. A fonte é o portal (`ID do motorista (portal)` → `portal_driver_id`),
   com a atribuição como complemento para o que o portal ainda não refletiu. Há teste de fonte.

2. **"ÚLTIMA VIAGEM" É A QUE CHEGA POR ÚLTIMO.** 15 motoristas têm mais de uma viagem aberta ao mesmo
   tempo. Ordenar por criação, ou pegar "a única aberta", descreve a viagem errada e chama de livre
   quem já tem a próxima carga. É também o que faz o "sai quando entra em viagem" acontecer sozinho.

3. **CANCELADA NÃO É FINALIZADA.** 19 das 215 linhas de hoje são canceladas. O motorista está livre,
   mas escrever FINALIZADO nele seria a tela afirmando que uma carga foi entregue.

4. **O FUSO.** "Hoje", "amanhã" e o corte de 7 dias são em São Paulo. Em UTC a lista troca de conteúdo
   às 21h — passa em qualquer teste feito de manhã e quebra no turno da noite.

5. **NÃO COPIAR O ESTADO.** Nenhuma coluna nossa guarda "disponível". É o erro que a 030 documentou:
   a cópia diverge do portal em silêncio, e o silêncio é o problema.

6. **O SEGUNDO SEPARADOR DE PLACA.** `Placa (portal)` vem `CAVALO,CARRETA`. `placasDoPortal` já existe
   em `packages/shared` e já trata vírgula, ponto-e-vírgula, placa única e vírgula sobrando. Escrever
   outro faz os dois divergirem sem erro nenhum.

7. **A JANELA DE VARREDURA NÃO É A JANELA DA ABA.** A consulta varre 8 dias para achar a última viagem
   de cada motorista, e só então aplica o recorte. Varrer só a janela da aba faria a "última viagem"
   ser a última *dentro da janela* — e um motorista com viagem futura apareceria como livre.

---

## Complexity Tracking

| Desvio | Por que é preciso | O que foi recusado |
|--------|-------------------|--------------------|
| Função de derivação em `packages/shared` com **dois** consumidores (a leitura do `packages/db` e a tabela do `apps/web`), abaixo da régua de três do princípio I | A regra decide o que a operação lê como "livre". Deixá-la só no SQL a torna inconferível sem banco — e o caso que mais importa (o corte de 7 dias na virada do dia em São Paulo) é exatamente o que um teste de unidade pega e um teste de integração não. Os dois consumidores são reais e independentes: um decide quem entra na lista, o outro escreve a palavra na tela. | Duplicar a regra nos dois lados: divergiria no primeiro ajuste do corte. Deixar só no SQL: a virada do dia deixaria de ser testável sem subir Postgres com dados nos dois lados da meia-noite. |

Nenhum outro desvio. A fatia não cria tabela, migração, permissão, job, rota de escrita nem
dependência.
