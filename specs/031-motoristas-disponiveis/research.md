# Research: Motoristas disponíveis

**Feature**: 031 · **Date**: 2026-09-03 · Tudo medido contra a produção, não estimado.

---

## R1 — De onde vem o motorista da viagem

**Decisão**: do **portal**. `trips.customer_fields->>'ID do motorista (portal)'` casado com
`drivers.portal_driver_id`. A atribuição nossa (`trip_assignments`) entra apenas como **complemento**,
por `coalesce`, para a viagem que o TMS acabou de atribuir e o portal ainda não refletiu.

**Rationale**: três medidas, todas em 03/09 sobre 7 dias de produção:

- **49 viagens de 760** têm motorista no portal e **nenhuma** atribuição nossa. O inverso é **zero**.
  Na janela da aba são 837 viagens, 771 com motorista no portal e 704 com atribuição — **67
  motoristas invisíveis** para uma aba construída sobre a atribuição.
- O `ID do motorista (portal)` resolve para um cadastro nosso em **49 de 49** órfãs. Cobertura total.
  1.492 dos 1.518 motoristas têm `portal_driver_id`.
- **Em 18 de 406 pares a atribuição aponta para outra pessoa** — não grafia diferente, gente
  diferente: "VANDRE PESSOA NOGUEIRA" vs "RAPHAEL MARTINS RABELO", "PAULO ROBERTO SILVA TEIXEIRA" vs
  "DARLA BEZERRA DOS SANTOS". Em **todos os 18**, o id do portal resolve para o nome do portal: a
  atribuição nossa é a versão velha de uma viagem reatribuída lá depois.

O sintoma de errar isto seria duplo e silencioso: motorista **em viagem** aparecendo como livre, e
motorista livre **não aparecendo**. É o mesmo erro que `packages/db/src/trips/placas-do-motorista.ts`
documenta no próprio cabeçalho — a primeira versão lia só a nossa caixa de saída e não enxergava
quem foi escalado direto no portal.

**Alternativas recusadas**:
- *Só `trip_assignments`*: perde 67 e erra 18. Recusada pela medida.
- *Só o portal, sem complemento*: a viagem recém-atribuída pelo TMS ficaria sem motorista até o robô
  ler de novo (20 s a 1 min). O `coalesce` custa nada e fecha essa ponta.
- *Casar por NOME*: o nome do portal é texto livre e já apareceu com grafias diferentes
  ("Sanderson Reis Rodrigues" em caixa mista no meio de nomes em caixa alta). Id é id.

---

## R2 — Qual é "a última viagem" do motorista

**Decisão**: a viagem com a **maior data de conclusão planejada** entre as viagens daquele motorista
na varredura. Desempate por identificador da viagem (R4).

**Rationale**: **15 motoristas têm mais de uma viagem aberta ao mesmo tempo** — nove com duas, três
com três, três com quatro. Qualquer outro critério descreve a viagem errada. E é este critério que
faz o FR-011 ("sai quando entra em viagem") acontecer **sozinho**: a viagem nova chega depois, vira a
última, cai fora da janela de hoje/amanhã, e o motorista some sem ninguém remover nada.

**Alternativas recusadas**:
- *A mais recentemente criada*: uma viagem cadastrada hoje para semana que vem passaria à frente da
  que está rodando agora.
- *A única aberta*: não existe "a única" para 15 motoristas.
- *A de maior data de início*: falha no caso comum de duas cargas saindo no mesmo dia com chegadas
  distantes.

---

## R3 — Onde mora a derivação, e onde mora o SQL

**Decisão**: fronteira em **"precisa do banco?"**.

- **SQL** (`packages/db`): quem é o motorista de cada viagem, qual é a última de cada um, e o recorte
  grosso da varredura. São perguntas sobre um conjunto grande, e trazer 4.000 viagens para memória
  para escolher uma por motorista seria trocar 10 ms por um problema.
- **Função pura** (`packages/shared`): dado o estado da viagem e a data de conclusão, **qual rótulo** e
  **ainda cabe na aba?**. É a regra que a operação lê, e é a que muda.

**Rationale**: a virada do dia em São Paulo e o corte de sete dias são exatamente o que um teste de
unidade pega e um teste de integração não — provar isso em SQL exigiria subir Postgres com dados dos
dois lados da meia-noite, em duas datas, todas as vezes.

**Alternativas recusadas**: tudo em SQL (a regra vira inconferível sem banco); tudo em memória
(traria 4.056 viagens por leitura, com polling, em toda tela aberta).

**Nota de conformidade**: são **dois** consumidores, abaixo da régua de três do princípio I.
Registrado em Complexity Tracking no plano.

---

## R4 — O desempate estável

**Decisão**: `order by driver_id, conclusao desc, trip_id`. O segundo critério é o **identificador da
viagem**, que nunca muda.

**Rationale**: o FR-005 exige que leituras repetidas descrevam sempre a mesma viagem. Sem desempate,
o Postgres pode devolver qualquer uma das empatadas, e a linha alternaria entre duas rotas a cada
polling — um piscar que ninguém consegue explicar e que nenhum teste pega de forma confiável.

**Alternativas recusadas**: desempatar por data de criação (muda se a viagem for reimportada); por
nome da estação (muda quando o portal renomeia — já aconteceu, e está registrado como armadilha
conhecida deste projeto).

---

## R5 — Uma consulta ou duas

**Decisão**: **uma**. Uma varredura, um `distinct on` por motorista, e o recorte final com as duas
condições em `or`.

**Rationale**: os dois grupos ("a caminho" e "disponível") partem do **mesmo** cálculo — a última
viagem do motorista. Duas consultas fariam esse cálculo duas vezes e abririam a porta para as duas
discordarem: um motorista poderia aparecer nas duas listas, ou em nenhuma, na janela em que a viagem
muda de estado entre uma consulta e a outra.

**Alternativas recusadas**: duas consultas com `union` (mesmo cálculo repetido); duas rotas separadas
(dobra o custo do polling e cria a discordância acima).

---

## R6 — O custo, medido

**Decisão**: **nenhum índice novo, nenhuma migração.**

**Rationale**: medido com `explain (analyze, buffers)` contra a produção em 03/09.

| varredura | Planning | Execution | linhas |
|-----------|----------|-----------|--------|
| 45 dias | 5,45 ms | 18,3 ms | — |
| **8 dias** | 6,44 ms | **10,9 ms** | **215** |

Todos os buffers vieram de `shared hit` — nada de disco. O plano usa `hash join` sobre varredura
sequencial de tabelas pequenas (1.518 motoristas, 4.056 viagens em 8 dias); índice em
`drivers.portal_driver_id` não mudaria isso neste tamanho, e criar um índice que o planejador não vai
usar é custo de escrita sem retorno.

**A varredura é de 8 dias porque 8 dias bastam**: o corte da aba é de sete, e viagem futura entra por
não ter limite superior. Uma varredura maior lê mais linhas para chegar ao mesmo resultado — 45 dias
custaram 68% a mais.

**Alternativas recusadas**: criar índice preventivo (o planejador não usaria); materializar a lista
numa tabela (viola FR-016 e o princípio III).

**Quando revisitar**: se `trips` passar de ~50 mil linhas na varredura, ou se a execução passar de
50 ms.

---

## R7 — O ritmo do polling

**Decisão**: **60 segundos**, e **sem** `refetchIntervalInBackground`.

**Rationale**: esta aba não é leilão. A oferta de spot usa 5 s porque lá se disputa uma carga contra
outra transportadora; aqui o dado de fundo — o plano do portal — é lido de 20 em 20 segundos pelo
robô, e um motorista não fica livre entre um segundo e outro. Sessenta segundos é mais rápido que a
planilha em qualquer cenário e é uma consulta de 11 ms por minuto, por aba aberta.

Sem atualização em segundo plano porque, ao contrário do cartão de spot, **não há nada a avisar**:
ninguém precisa ser interrompido porque um motorista chegou.

**Alternativas recusadas**: 5 s (custo sem ganho — 12x mais consulta para um dado que muda em minutos);
só ao abrir a tela (a tela fica aberta o turno inteiro e envelheceria em silêncio).

**Sobre não interromper quem está lendo** (SC-008): a busca e a ordenação são estado da tela, não da
consulta — a atualização troca os dados debaixo da tabela sem mexer no que a pessoa digitou.

---

## R8 — A forma da tela

**Decisão**: **uma tabela só**, com a situação numa coluna, ordenada por padrão de modo que o
**disponível há mais tempo apareça primeiro**. As duas contagens no cabeçalho.

**Rationale**: é a forma da planilha que ela substitui — mesmas colunas, mesma leitura de cima para
baixo — e é o que permite comparar as duas lado a lado no dia da virada. Separar em dois blocos
("disponíveis" e "a caminho") pareceria mais organizado e obrigaria a pessoa a procurar um nome em
dois lugares; a coluna de situação já separa visualmente, e a busca atravessa tudo.

A ordem padrão é a do FR-006 e não é a da planilha: quem está parado há mais tempo é quem precisa de
carga primeiro. A planilha ordena por data de início porque é digitada em ordem de acontecimento —
uma limitação de quem digita, não uma decisão.

**Alternativas recusadas**: cartões (ocupam mais e não comparam); dois blocos separados (o mesmo nome
em dois lugares); agrupar por região (a região não entrou na spec, e é fatia futura).

---

## R9 — Os rótulos, e onde eles moram

**Decisão**: **três palavras na coluna de situação** — `FINALIZADO`, `CANCELADA` e o status corrente
para o resto — reusando a tradução de status que a Torre de Controle já tem em `pt-BR.json`.

**Rationale**: quem lê a aba precisa de uma decisão, não de um relatório: *posso dar carga?*.
FINALIZADO é a palavra que a operação já usa e significa "livre". CANCELADA precisa ser distinta
porque o motorista está livre mas a carga **não foi entregue** (R10). O resto — `assigned`,
`at_origin`, `loading`, `in_transit`, `at_destination`, `unloading` — já tem tradução no catálogo
existente, e criar um segundo catálogo aqui faria os dois divergirem no primeiro status novo.

**Alternativas recusadas**: só "FINALIZADO vs o resto" (perde a distinção da cancelada e some com a
informação de *onde* o caminhão está); catálogo próprio da aba (segunda fonte de tradução).

---

## R10 — Cancelada, e o motorista que fica sem viagem nenhuma

**Decisão**: viagem **cancelada** conta para o motorista **entrar** na aba (ele está livre de fato),
mas com rótulo **próprio**, nunca FINALIZADO.

**Rationale**: são 19 das 215 linhas de hoje — 8 chegando amanhã e 3 hoje entre as canceladas
recentes. Escrever FINALIZADO numa viagem cancelada seria a tela afirmando que uma carga foi
entregue, e é o tipo de afirmação que só é descoberta quando alguém cobra o frete.

**Sobre as ofertas que nunca viram viagem e os motoristas sem viagem nenhuma**: um motorista que nunca
teve viagem na varredura simplesmente não aparece. Não é ausência silenciosa — é a definição da aba,
que é sobre quem **terminou** algo, não sobre o cadastro inteiro. O corte de sete dias tem o mesmo
papel: sem ele, 117 motoristas parados há mais de 7 dias e 72 parados há mais de 30 entrariam na
lista, e ela deixaria de responder "quem está livre agora" para responder "quem existe".
