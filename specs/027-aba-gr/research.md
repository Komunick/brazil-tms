# Research — 027 aba GR

As decisões que não eram óbvias, com o que foi descartado junto.

---

## R1 — A tabela de rota muda de forma, não ganha coluna

**Decisão**: renomear `cod_modelo` → `cod_rota` em `pre_sm_route_models`, na mesma migração que cria
a tabela de cidade. Sem migração de dado.

**Por quê**: as duas tabelas da 026 estão **vazias em todo lugar** — conferido em 25/08 no banco de
dev (`0 correspondências, 0 pré-SMs`) — e a migração `0046` **nunca chegou à produção**. Não há dado
a preservar, então a forma limpa custa o mesmo que a suja.

**Descartado — acrescentar `cod_rota` e deixar `cod_modelo` nulo**: sobra uma coluna que ninguém
preenche e que o próximo leitor vai tentar entender. Coluna morta é dívida que não avisa.

**Descartado — tabela nova e abandonar a antiga**: dois lugares para a mesma pergunta ("qual é a
rota desta viagem?"), e a certeza de que alguém vai ler o errado.

---

## R2 — A cidade sai do nome da estação, com a função que já existe

**Decisão**: acrescentar `ufECidadeDaEstacao` ao lado de `tokensDaEstacao`, no mesmo arquivo,
usando a mesma separação.

**Por quê**: medido em produção — das 228 estações, **8 têm `city`** preenchida e 71 têm `state`.
Preencher o cadastro à mão é 228 linhas de digitação que envelhecem. O nome já carrega:

```
SOC_MG_BETIM                    → MG · BETIM
LM HUB_TO_PALMAS                → TO · PALMAS
SOC_PE_JABOATÃO DOS GUARARAPES  → PE · JABOATAO DOS GUARARAPES
FM HUB_PR_UMUARAMA_PQ_INDUST_II → PR · UMUARAMA PQ INDUST II
```

`tokensDaEstacao` **já** acha o índice da UF e descarta tudo até ela. A função nova devolve o que
aquela joga fora. É uma linha de lógica nova, não um normalizador.

**Descartado — escrever um extrator próprio**: os dois divergiriam com o tempo, e a divergência
seria **silenciosa** — a estação simplesmente não casaria, sem erro em lugar nenhum. É o mesmo
defeito que a 026 já teve entre a carga e a busca, e que só não aconteceu porque a chave foi
extraída para uma função compartilhada.

**Descartado — preencher `locations.city` na carga**: mistura duas coisas. O cadastro de locais é
nosso e serve a outras telas; a correspondência com a gerenciadora é dela e precisa de conferência
humana. Escrever no cadastro faria uma proposta não conferida virar verdade em todo o sistema.

---

## R3 — O corpo do `setPreSM` fica isolado num arquivo puro

**Decisão**: `packages/shared/src/domain/pre-sm-corpo.ts`, sem rede e sem banco, com o corpo e a
lista de motivos.

**Por quê**: é o **único** ponto que a resposta pendente da gerenciadora pode mudar. Não se sabe
como o `setPreSM` amarra a Pré-SM à programação que ela já tem do portal — não há campo de código de
programação em nenhum método de criação, conferido na referência.

Isolando, a resposta muda um arquivo e seus testes. Espalhado pelo job, mudaria o job, o que grava,
o que a tela mostra e o que os testes esperam.

**Descartado — esperar a resposta antes de começar**: a fila, a aba e as duas pontes independem
dela, e são a maior parte do trabalho. Parar tudo por uma pergunta que responde um arquivo seria
trocar semanas por nada.

---

## R4 — Todos os motivos, não o primeiro

**Decisão**: a montagem devolve **a lista** do que falta. A 026 devolvia um só, o mais acionável.

**Por quê**: mudou o consumidor. Na 026, o motivo aparecia enterrado na viagem, e mostrar um só
evitava confundir. Na aba GR o motivo **é** a fila: a pessoa está ali para resolver, e resolver o
CPF para descobrir que também falta o vínculo é duas viagens ao cadastro em vez de uma.

**Descartado — manter um motivo**: economiza uma linha de código e custa uma ida a mais ao cadastro
por viagem, todo dia.

---

## R5 — Filial e perfil de segurança são configuração

**Decisão**: `CodFilial` e `CodPerfilSeguranca` vêm de configuração por cliente, não de constante no
código.

**Por quê**: a tela mostrava `20785 - DDR SHOPEE` fixo, e hoje só existe um cliente com Pré-SM. Mas
o princípio V da constituição é explícito: variação por cliente é configuração. Um segundo cliente
com outro perfil não pode exigir código.

Os valores saem de `getCliente` e `getTabela` — leitura, e uma vez.

**Descartado — constante no código**: funcionaria hoje e viraria um `if` por cliente no primeiro
dia em que houvesse dois.

---

## R6 — Uma carga só para cidade e rota

**Decisão**: um job (`pre_sm.carregar_cadastro`) que consulta cidades e rotas e propõe as duas
correspondências.

**Por quê**: a rota **depende** da cidade — `getRotas` recebe os dois códigos IBGE. Dois jobs
separados criariam uma ordem implícita que ninguém documentou e que quebraria quando alguém
rodasse na ordem errada.

**Descartado — dois botões na tela**: a pessoa teria de saber apertar um antes do outro. A ordem é
do sistema, não dela.

---

## R7 — Validar sem gastar, em três camadas

**Decisão**: teste puro → leitura contra a produção → ensaio com o interruptor desligado.

**Por quê**: não há homologação (`CodErro 100 — USUARIO INVALIDO`, medido em 25/08) e a gerenciadora
cobra por solicitação. As duas primeiras camadas custam zero e pegam quase tudo:

| Camada | O que pega | Custo |
|---|---|---|
| teste puro | casamento de nomes, montagem do corpo, motivos | zero |
| leitura real (`getCidades`, `getRotas`) | as 228 estações e ~80 rotas, com a aba já montada | zero |
| ensaio desligado | quantas viagens sairiam limpas num dia | zero |
| criação real | **se a gerenciadora aceita o corpo** | uma solicitação |

Só a última linha custa, e é a única que as outras não respondem.

**Descartado — pedir ambiente de homologação e esperar**: já foi tentado; o login é recusado. Não é
uma espera com prazo.
