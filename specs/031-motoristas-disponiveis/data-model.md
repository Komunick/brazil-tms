# Data Model: Motoristas disponíveis

**Feature**: 031 · **Date**: 2026-09-03

## A frase mais importante deste arquivo

**Não há entidade nova. Não há tabela, coluna, enum ou migração.**

"Motorista disponível" não é um registro — é uma **conclusão tirada a cada leitura**. O que existe no
banco já existe: a viagem, o motorista, o veículo, a carreta, e os campos que o portal do cliente
manda dentro de `trips.customer_fields`.

---

## De onde sai cada coluna da tela

| Coluna da tela | Fonte | Observação |
|---|---|---|
| Nome | `drivers.name` | achado pelo id do portal (R1) |
| Origem | `locations.name` da origem da viagem | |
| Destino | `locations.name` do destino da viagem | |
| Cavalo | 1ª placa de `customer_fields->>'Placa (portal)'` | via `placasDoPortal`, que já existe |
| Carreta | 2ª placa do mesmo campo | vazia quando não há segunda — nunca repete o cavalo |
| Data de início | `trips.planned_pickup_window_start` | 772/772 preenchidas |
| Data de conclusão | `trips.planned_delivery_window_start` | 772/772 preenchidas |
| Situação | derivada de `trips.current_status` | R9 |
| Impedimento | `drivers.blocked_at` e `drivers.status` | via `bloqueiosPorIdDoPortal`, que já existe |

---

## A derivação, em três passos

```text
1. VIAGENS COM MOTORISTA           (SQL)
   toda viagem com conclusão planejada nos últimos 8 dias ou no futuro,
   com o motorista resolvido: id do portal → drivers, e a atribuição nossa como complemento

2. A ÚLTIMA DE CADA UM             (SQL)
   por motorista, a de MAIOR data de conclusão planejada
   desempate: identificador da viagem (estável)

3. CABE NA ABA?                    (função pura)
   a caminho ...... conclusão cai HOJE ou AMANHÃ (São Paulo)  → mostra o status corrente
   disponível ..... viagem concluída ou cancelada, conclusão nos últimos 7 dias
   fora .......... qualquer outro caso
```

O passo 3 é o único que muda com frequência, e é o único que é função pura — é onde a virada do dia
e o corte de sete dias se provam sem banco (R3).

---

## Máquina de estados — DERIVADA, nunca guardada

```text
                    ┌──────────────────────────────────────────┐
                    │  a última viagem do motorista chega       │
                    │  HOJE ou AMANHÃ, e ainda não terminou     │
                    └────────────────────┬─────────────────────┘
                                         │  o portal diz que concluiu
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │  FINALIZADO  =  disponível                │
                    └────────────────────┬─────────────────────┘
                                         │
                    ┌────────────────────┴─────────────────────┐
                    ▼                                          ▼
        recebe viagem nova                          completa 7 dias parado
        (ela vira a última e chega depois)          (o corte de ruído)
                    │                                          │
                    └──────────────► SAI DA ABA ◄──────────────┘
```

Nenhuma seta desse desenho é uma escrita nossa. Todas são consequência de ler o estado da viagem.

---

## Invariantes

**I1 — Nenhuma escrita.** A fatia não tem caminho de escrita. Nenhum `insert`, `update` ou `delete`,
nenhuma migração, nenhuma fila. Provado por construção: um teste varre o módulo de leitura e a rota
procurando vocabulário de escrita.

**I2 — "Disponível" não existe como dado.** As palavras `disponivel`/`finalizado` não aparecem como
coluna, campo de tabela ou chave persistida em lugar nenhum. Se aparecerem, a cópia começou a
divergir do portal — o erro que a 030 documentou.

**I3 — A última viagem é a que chega por último.** Para todo motorista da lista, não existe outra
viagem dele, na varredura, com data de conclusão maior. Vale mesmo para os 15 que têm mais de uma
viagem aberta ao mesmo tempo.

**I4 — Cancelada nunca é FINALIZADO.** Nenhuma linha com viagem cancelada recebe o rótulo de
concluída. As duas contagens do cabeçalho também as separam.

**I5 — Estabilidade.** Duas leituras seguidas, sem mudança no banco, produzem exatamente a mesma
lista, na mesma ordem, descrevendo as mesmas viagens.

---

## O que a fatia lê, e não escreve

```text
LÊ:      trips · trips.customer_fields · trip_assignments · drivers · vehicles · trailers · locations
ESCREVE: nada
```
