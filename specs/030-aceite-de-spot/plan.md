# Implementation Plan: Aceite de oferta de spot direto no cartão

**Branch**: `030-aceite-de-spot` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/030-aceite-de-spot/spec.md`

## Summary

O cartão de oferta de spot deixa de ser só aviso e passa a ser o lugar onde a decisão acontece:
aceitar (em dois gestos) ou ignorar (só para quem clicou). Ele para de sair sozinho em trinta
segundos e só some, para todos, quando o portal confirmar o aceite.

**A descoberta que governa este plano: quase nada de estado novo é preciso.** As três situações que
o cartão precisa distinguir já estão gravadas em produção, em tabelas que esta fatia não cria:

| o cartão precisa saber | de onde já vem hoje |
| --- | --- |
| esperando decisão | `trips.customer_fields->>'Aceitação (portal)' = 'Pending'` |
| aceite enviado, esperando o portal | `portal_commands` com `action='accept'` e status `pending`/`sent` |
| o portal recusou, e o quê | `portal_commands.status='failed'` + `last_error` |
| **aceito — e é isto que tira o cartão** | `customer_fields->>'Aceitação (portal)' = 'Accepted'` |
| não há viagem no TMS ainda | nenhuma linha em `trips` com aquele `external_trip_id` |

Sobra **uma** coisa que não existe em lugar nenhum: quem ignorou o quê. É a única tabela nova, e é
a única migração desta fatia.

O aceite reusa `POST /api/trips/[id]/portal-action` e `enfileirarOrdemDoPortal` — mesma verificação
de cabimento, mesma auditoria, mesma fila para o robô. **Nenhum segundo caminho de aceite nasce.**

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 20, Next.js 15 App Router

**Primary Dependencies**: Drizzle ORM · TanStack Query (polling) · shadcn/ui + Tailwind · Zod · Luxon

**Storage**: Postgres (Supabase self-hosted). Uma tabela nova; nenhuma coluna nova em tabela existente.

**Testing**: Vitest (unidade e guardas) · Playwright (a prova de que a camada não bloqueia a tela)

**Target Platform**: navegador (todas as telas do TMS, inclusive o painel de parede) + BFF Next.js

**Project Type**: web — monorepo `apps/web`, `packages/{shared,db}`

**Performance Goals**: a rota do cartão é consultada de **5 em 5 segundos, com a aba escondida, em
toda tela aberta**. A consulta que ela passa a fazer foi medida contra produção: **2,5 ms de
execução**. O teto de linhas continua sendo o do dia (30).

**Constraints**: aceitar é IRREVERSÍVEL no portal do cliente — nenhum passo de implementação pode
disparar um aceite real. Migração à mão, aditiva, com entrada obrigatória no `meta/_journal.json`.

**Scale/Scope**: 5 a 10 ofertas por dia · 34 pessoas · 3 telas afetadas (camada do cartão, Painel do
dia, painel de parede) · 1 rota estendida · 1 rota reusada · 1 tabela nova.

## Constitution Check

*GATE: avaliado antes da Fase 0 e reavaliado depois da Fase 1. Resultado: **7 de 7**.*

- [x] **Simplicity (I)**: uma tabela nova, zero coluna nova em tabela existente, zero rota de escrita
      nova. A alternativa "copiar o estado da decisão para `spot_offers`" foi recusada — ver R1. A
      única função extraída para lugar comum é a derivação do estado, e ela não é abstração para
      reúso: é fonte única de uma regra de correção, com DOIS consumidores que precisam concordar por
      exigência do FR-022 (mesmo padrão do `onTimeExpr` já no repositório). Registrado em
      Complexity Tracking.
- [x] **Scope (II)**: dentro do escopo de execução — decidir sobre viagem que o cliente ofereceu. Não
      entra rejeição, atribuição, aceite automático nem mudança na detecção da oferta.
- [x] **System-of-record (III)**: o Postgres continua dono. **Nada é apagado**: ignorar grava uma
      linha de dispensa, não remove oferta; a oferta segue no registro do dia (FR-019/FR-026). O
      estado da decisão não é copiado — é lido de onde ele já mora, o que impede a divergência que
      uma cópia criaria.
- [x] **Authz & secrets (IV)**: decidido no BFF. A permissão é a que a tela de viagem já exige para
      aceitar; nenhuma nova. A recusa vale no servidor (o `requirePermission` da rota reusada), não
      só no botão. Toda decisão é auditada — `enfileirarOrdemDoPortal` já grava na mesma transação, e
      esta fatia acrescenta ao registro **de onde** a decisão saiu (FR-025).
- [x] **Config over code (V)**: não toca importação nem variação por cliente.
- [x] **Tech constraints**: frescor por polling TanStack Query, como hoje. Sem Realtime, sem Edge
      Functions, sem broker, sem serviço novo. Nenhum job de worker nasce aqui.
- [x] **Workflow**: branch `030-aceite-de-spot` a partir do `dev`, PR para `dev`, `pnpm lint` da RAIZ.

## As seis etapas, e onde dá para parar

A ordem existe para que **parar entre duas etapas nunca deixe o sistema pela metade**. As etapas 1 a
3 não mudam nada para ninguém: são leitura e tabela vazia.

### 1 · A tabela da dispensa pessoal — bloqueia tudo

Migração `0062`, aditiva: uma tabela nova, vazia, que ninguém lê ainda. Roda com o app ANTERIOR no
ar sem incomodá-lo, porque ele não a conhece. Entrada no `meta/_journal.json` no mesmo commit.

### 2 · A derivação do estado, sob teste, longe da tela

Uma função pura em `packages/shared` que recebe o que se sabe da oferta (tem viagem? qual a
aceitação? há ordem aberta? a última falhou?) e devolve UM estado. Nada a chama ainda. É o coração
da fatia e o lugar onde ela é provada sem tocar em portal nenhum.

### 3 · A leitura passa a trazer o estado

`GET /api/spot-offers` ganha, por oferta, o que a derivação precisa. **Nesta etapa o cartão ainda é o
de hoje** e ignora os campos novos: comportamento idêntico ao atual, e é isso que se quer. A consulta
foi medida: 2,5 ms.

**Duas coisas que a rota fará no fim NÃO entram aqui**, e a razão é a mesma nos dois casos — elas
mudariam o que o cartão de hoje recebe, e a promessa desta etapa é que nada muda:

- **Excluir da lista as ofertas já aceitas** vai para a etapa 4. Com o cartão de hoje, que anuncia
  toda oferta nova e sai em 30 s, excluí-las suprimiria um aviso que hoje aparece — e **25 de 98
  ofertas tinham a viagem no TMS antes de a oferta chegar**, então o caso não é teórico.
- **Esconder o que a pessoa dispensou** vai para a etapa 4 também, junto com o Ignorar que gera a
  dispensa. Aqui ela não teria efeito (a tabela está vazia), e separá-la do gesto que a alimenta só
  criaria uma etapa que não dá para conferir.

### 4 · O cartão (US1 + US2) — é aqui que passa a valer

A camada perde a cortina, os cartões param na tela e dividem o espaço, e ganham Aceitar (dois
gestos), Ignorar e Recolher. O aceite chama a rota que já existe.

### 5 · O Painel do dia (US3)

O `CardsDeSpot` ganha o terceiro estado do pontinho e a ação na linha, lendo a MESMA derivação da
etapa 2. **Corrige de passagem um defeito medido**: hoje o painel conta como "aceita" toda oferta
cuja viagem simplesmente existe no TMS (`t.id is not null`) — inclusive durante os minutos em que
ela está esperando decisão, que é exatamente a janela desta fatia.

### 6 · As provas que não são teste de unidade

O Playwright que digita num campo com os cartões na tela (FR-003), e o guarda que impede a cortina
de voltar.

## As sete armadilhas desta fatia

1. **COPIAR O ESTADO É O ERRO.** Gravar "aceita" numa coluna nossa cria uma segunda verdade que
   diverge da do portal no primeiro caso de aceite feito fora do TMS — que é o caso COMUM (das 19
   ofertas de dois dias, quase todas foram aceitas direto no portal). O FR-014 proíbe segundo
   gatilho, e a forma de garantir isso é não ter onde guardá-lo.
2. **A CORTINA.** `boxShadow: 0 0 0 9999px rgba(3,10,18,0.62)` pinta a tela inteira. Com o cartão
   parado, isso apaga o TMS o dia todo. Sai, e um teste impede que volte.
3. **O X QUE FECHA SEM DECIDIR** é o que hoje faz a oferta passar batido. Vira Recolher, que encolhe
   sem remover e mantém a contagem à vista.
4. **A MEMÓRIA DE ABA.** `estadoInicial`/`novasOfertas` guardam "já vi" num `useRef`. Isso continua
   servindo ao SOM (apitar uma vez por oferta) e **não pode** virar a memória da decisão: recarregar
   a página traria tudo de volta como novidade.
5. **`drizzle-kit generate` NÃO SERVE.** Migração à mão, numerada a partir de `0062`, renumerada só
   no merge, e **entrada no `meta/_journal.json` é obrigatória** — sem ela a migração é pulada e o
   deploy responde sucesso.
6. **NENHUM ACEITE DE TESTE.** Aceitar não tem volta. O caminho de escrita é exercitado contra uma
   viagem que NÃO está pendente, onde `impedimentoDaAcao` recusa antes de qualquer coisa sair — o
   que prova o guarda sem gastar. O desenho é exercitado pelo ensaio que já existe.
7. **A JANELA DO DIA É UM LIMITE REAL, e precisa ser declarado.** `readSpotOffersToday` recorta pelo
   dia em São Paulo. Uma oferta não decidida some na virada do dia — o que é uma exceção ao FR-001.
   É deliberado (leilão de ontem é leilão morto) e está escrito, não escondido.

## Project Structure

### Documentation (this feature)

```text
specs/030-aceite-de-spot/
├── spec.md
├── plan.md               # este arquivo
├── research.md           # R1..R10 — as decisões, cada uma com a alternativa recusada
├── data-model.md         # a tabela nova e a máquina de estados DERIVADA
├── contracts/
│   └── spot-offers-api.md
├── quickstart.md
└── checklists/requirements.md
```

### Source (repository root)

```text
packages/db/
├── migrations/0062_dispensa_de_oferta.sql        # NOVO — a única migração
├── migrations/meta/_journal.json                 # entrada obrigatória
├── schema/spot-offers.ts                         # + tabela spot_offer_dispensas
└── src/trips/
    ├── spot-offers.ts                            # readSpotOffersToday ganha o estado
    ├── spot-dispensas.ts                         # NOVO — gravar e ler a dispensa
    └── programacao.ts                            # readSpotPorRegiao usa a derivação

packages/shared/src/domain/
└── spot-decisao.ts                               # NOVO — a derivação pura (fonte única)

apps/web/
├── app/api/spot-offers/route.ts                  # devolve o estado; esconde o dispensado
├── app/api/spot-offers/[id]/dispensar/route.ts   # NOVO — a única escrita nova
├── app/api/trips/[id]/portal-action/route.ts     # + a origem da decisão, na auditoria
├── components/spot/oferta-de-spot.tsx            # a camada, sem cortina, com os botões
├── components/spot/cartao-da-oferta.tsx          # NOVO — um cartão
└── components/trips/dashboard/frente.tsx         # CardsDeSpot: 3º estado + ação na linha
```

## Complexity Tracking

| Desvio | Por que é preciso | A alternativa mais simples, e por que foi recusada |
| --- | --- | --- |
| Uma função de derivação em `packages/shared`, com dois consumidores — abaixo da régua de 3 do princípio I | O FR-022 exige que a decisão vista no cartão e a vista no Painel do dia sejam a MESMA. Duas derivações independentes divergiriam em silêncio, e o sintoma seria a pior espécie: as duas telas mostrando coisas diferentes sobre a mesma oferta, sem erro nenhum | Escrever a regra duas vezes, uma em cada consulta. Recusada porque não é abstração para REÚSO — é fonte única de regra de correção, o mesmo caso do `onTimeExpr` que já existe no repositório pelo mesmo motivo. A régua de 3 protege contra abstração especulativa, não contra fonte única de verdade |
| Uma tabela nova para a dispensa pessoal | Não existe hoje nenhum lugar onde caiba "esta pessoa não quer ver esta oferta". Precisa sobreviver a recarregar e trocar de aparelho (FR-018) | Guardar no `localStorage`. Recusada pelo FR-018: morre ao trocar de máquina e ao limpar o navegador, e a operação usa mais de um posto. Guardar num campo de preferências do usuário (jsonb) também foi recusado — ver R2 |
