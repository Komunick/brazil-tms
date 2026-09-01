# Data Model: Aceite de oferta de spot direto no cartão

**Feature**: 030-aceite-de-spot · **Date**: 2026-09-01

A fatia acrescenta **uma** tabela e **nenhuma** coluna a tabela existente. O resto do modelo é
derivação — ver R1.

---

## 1 · A única tabela nova: `spot_offer_dispensas`

"Esta pessoa tirou esta oferta da própria tela." Não é decisão sobre o frete; é decisão sobre a
tela de quem clicou.

| coluna | tipo | regra |
| --- | --- | --- |
| `spot_offer_id` | `uuid` | → `spot_offers.id`, `ON DELETE CASCADE` |
| `user_id` | `uuid` | → `users.id`, **sem** cascade |
| `dispensada_em` | `timestamptz` | `not null default now()` |

**Chave primária composta `(spot_offer_id, user_id)`.** Ela é a regra de negócio, não otimização:
dispensar duas vezes é a mesma dispensa. A gravação é `insert ... on conflict do nothing`, o que
torna o gesto idempotente e imune a duas abas clicando junto.

**A cascata pela OFERTA é obrigatória; pelo AUTOR, proibida.** Se um dia uma oferta for removida, a
dispensa dela não pode travar a remoção. Já a dispensa de alguém que saiu da empresa não deve
desaparecer sozinha — ela explica por que aquela oferta não estava na tela daquela pessoa.

**Nenhum índice além da chave primária.** A consulta é `not exists (… where spot_offer_id = ? and
user_id = ?)`, que é exatamente o prefixo da PK. Um índice por `user_id` sozinho seria especulação:
não há leitura que peça "tudo o que fulano dispensou".

**Crescimento**: teto de 10 ofertas/dia × 34 pessoas = 340 linhas/dia no pior caso; o real é uma
fração. Sem job de limpeza, deliberadamente — ver R2.

---

## 2 · A máquina de estados, que é DERIVADA

Um estado por oferta, calculado a cada leitura. **Não existe coluna que o guarde** — é isso que
impede uma segunda verdade (R1, FR-014).

### As entradas

| entrada | de onde vem |
| --- | --- |
| `tripId` | `trips.id` onde `external_trip_id = spot_offers.trip_number` |
| `aceitacaoDoPortal` | `trips.customer_fields->>'Aceitação (portal)'` |
| `ordemAberta` | há `portal_commands` com `action='accept'` e status `pending`/`sent` |
| `ultimaFalha` | a última ordem de aceite com `status='failed'` — e o `last_error` dela |

### Os estados

| estado | quando | o cartão mostra |
| --- | --- | --- |
| `sem_viagem` | não há `tripId` | Aceitar desligado, com a razão. Ignorar disponível |
| `esperando` | aceitação = `Pending`, sem ordem aberta | Aceitar e Ignorar |
| `enviado` | há ordem aberta de aceite | "esperando o portal", com quem decidiu |
| `recusado` | a última ordem de aceite falhou e não há ordem aberta | a recusa, e Tentar de novo |
| `aceito` | aceitação = `Accepted` | **nada — a oferta sai da lista** |

### As transições legais

```text
sem_viagem ──(a viagem chega)──▶ esperando
esperando  ──(confirma aceite)─▶ enviado
enviado    ──(portal recusa)───▶ recusado
enviado    ──(portal confirma)─▶ aceito     ⇒ sai da lista de todos
recusado   ──(tenta de novo)───▶ enviado
recusado   ──(outro aceitou)───▶ aceito     ⇒ sai da lista de todos
esperando  ──(outro aceitou)───▶ aceito     ⇒ sai da lista de todos
```

**Nenhuma transição sai de `aceito`.** É o estado final, e é do portal.

A dispensa pessoal é **ortogonal** a tudo isto: ela não é um estado da oferta, é um filtro da tela de
uma pessoa. Uma oferta dispensada continua em `esperando` para os demais, e continua no registro do
dia para todos (FR-019).

### A regra de ouro

> `aceito` NUNCA é escrito por nós. Ele é lido do que o portal disse, pela leitura do plano que já
> roda. Se houvesse onde escrevê-lo, haveria um segundo jeito de o cartão sumir — e o FR-014 diz que
> não há.

---

## 3 · O que NÃO muda

- **`spot_offers`** não ganha coluna nenhuma. Continua sendo o retrato da oferta como o monitor a
  formatou, com o único em `portal_trip_id` que protege do reenvio.
- **`portal_commands`** não ganha coluna nenhuma. Ela já registra a ordem, quem pediu, o que o portal
  respondeu e quando. A origem da decisão entra no `newValue` da auditoria, não aqui.
- **`trips`** não é tocada. A aceitação do portal continua vindo em `customer_fields`, escrita pelo
  robô de leitura.
- **`audit_logs`** continua com a mesma forma; o que muda é o conteúdo do `newValue`, que passa a
  incluir de onde a decisão saiu.

---

## 4 · O vínculo entre oferta e viagem

`spot_offers.trip_number` = `trips.external_trip_id`. Medido: casa em **98 de 132** ofertas.

O vínculo é por número da LH e **não** por `portal_trip_id`, porque `trips` não tem coluna de id do
portal — ele mora em `customer_fields->>'ID (portal)'`, que não é indexável de forma barata. O índice
`trips_customer_external_id_uq` cobre o caminho, e a consulta inteira foi medida em **2,5 ms** contra
a produção.

**O vínculo pode não existir, e isso é normal**: 34 ofertas nunca viraram viagem. Ver R10.

**O vínculo pode chegar depois**: em 57 dos 98 casos a viagem apareceu em até 2 minutos, e em 25 ela
já estava lá antes da oferta. É por isso que o estado `sem_viagem` existe e que o botão liga sozinho.

---

## 5 · Invariantes

- **I1** — Não existe caminho de escrita que grave "aceita" do nosso lado. Verificável por busca: o
  vocabulário do estado `aceito` só aparece em leitura.
- **I2** — Dispensar nunca remove linha. Verificável: a única escrita de `spot_offer_dispensas` é
  `insert`, e não há `delete` em lugar nenhum do código da fatia.
- **I3** — Uma oferta dispensada por alguém continua sendo devolvida ao Painel do dia. Verificável:
  a leitura do painel não filtra por dispensa; só a do cartão filtra.
- **I4** — Duas ordens de aceite abertas para a mesma viagem são impossíveis. Já garantido pelo
  índice parcial que `portal_commands` tem, e a fatia não abre um segundo caminho que o contorne.
