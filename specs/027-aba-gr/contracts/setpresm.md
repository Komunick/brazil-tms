# Contrato — `setPreSM`, campo a campo, e de onde cada um sai

A referência completa da API está em **`docs/INTEGRA-14.2-REFERENCIA.md`**, extraída do manual. Este
arquivo é o recorte que esta fatia usa, com a origem de cada campo no nosso lado.

> **Confira ali antes de afirmar que um campo não existe.** A fatia 026 foi construída sobre três
> suposições sobre esta API, e as três estavam erradas.

---

## Por que `setPreSM` e não `setPreSMdeModelo`

A gerenciadora respondeu por escrito em 25/08, à pergunta sobre o vínculo com a programação do
eTorre: **"Tem que ser pelo setPreSM"**.

A 026 tinha escolhido o outro, para evitar mandar rota e cidades. Ver a proposta em
`docs/PROPOSTA-ABA-GR.md`.

---

## O corpo

Endereço: `POST .../TWebService/"setPreSM"` — o nome do método vai **entre aspas** na URL. Todo corpo
leva `Ambiente`, `Login`, `Senha`, `TipoRetorno`. A resposta é sempre **HTTP 200**; quem diz se deu
certo é `CodErro` dentro de `result[0]` — **zero é sucesso**.

### `PreSM`

| campo | de onde sai | obr. |
|---|---|---|
| `Codigo` | `0` ao incluir — só se informa para **alterar** | sim |

### `PreSM.Engate`

| campo | de onde sai | obr. |
|---|---|---|
| `CodFilial` | **configuração** por cliente (`getCliente`) | sim |
| `CodPerfilSeguranca` | **configuração** por cliente (`getTabela`) — é o `DDR SHOPEE` da tela | sim |
| `PlacaVeiculo` | `portal_commands.plates[0]` | sim |
| `VincVeiculo` | `vehicles.ownership_type` → `F` / `A` / `T` | sim |
| `CPFMotorista1` | `drivers.cpf`, pelo id do portal | sim |
| `VincMotorista1` | `drivers.ownership_type` | sim |
| `CPFMotorista2` | segundo motorista da atribuição | não |
| `VincMotorista2` | idem | não |
| `PlacaCarreta1..3` | demais placas da atribuição | não |
| `VincCarreta1..3` | `trailers.ownership_type` | não |
| `CNPJEmbarcador` | **pendente** — a tela pedia; ver a incerteza abaixo | não |

Vínculo: `A` agregado · `F` frota · `T` terceiro. **`subcontracted` não tem letra** — significa
"ainda não classificado", e vira motivo de bloqueio, nunca um chute.

### `PreSM.Detalhamento.ColetasEntregas[]`

Dois registros por viagem: a coleta e a entrega.

| campo | de onde sai | obr. |
|---|---|---|
| `Tipo` | `COLETA` / `ENTREGA` | sim |
| `CodIBGECidade` | **`pre_sm_city_links.cod_ibge`** da origem / do destino, **confirmada** | sim |
| `DataHoraChegada` | janela de coleta (início) / de entrega | sim |
| `DataHoraSaida` | janela de coleta (fim) / de entrega | sim |

### `PreSM.Rota`

| campo | de onde sai | obr. |
|---|---|---|
| `CodRota` | **`pre_sm_route_links.cod_rota`**, confirmada | sim |

**A rota não é montada por nós.** A seção pede só o código — `LocaisParada`, `Polyline` e
`PontosPassagem` são opcionais. Isso derruba a objeção da 026 ("exigiria espelhar cidades com
IBGE"): o IBGE é preciso só nas **duas** cidades da coleta e da entrega.

---

## Data e hora

Formato do exemplo do próprio manual: `"2015-07-17 16:00"` — sem `T`, sem segundos.

**Horário de São Paulo, nunca UTC.** A gerenciadora agenda escolta em hora local: mandar UTC
deslocaria toda coleta em três horas, e um caminhão marcado para as 9h teria escolta esperando às
12h. Este erro **passa em teste** e só aparece na estrada — por isso tem teste próprio.

---

## O que a resposta traz

`CodErro` zero e o código da Pré-SM criada, que é guardado junto da viagem. Sem ele não há como
consultar, alterar ou cancelar depois.

`CodErro` diferente de zero é recusa **dela**: a `MsgErro` vai inteira para a tela, sem tradução
nossa. É o que permite conversar com a gerenciadora citando o código.

---

## Métodos de leitura que esta fatia usa

| método | para quê | custa? |
|---|---|---|
| `getCidades` | propor `cod_ibge` de cada estação | não |
| `getRotas` | propor `cod_rota` de cada par origem–destino | não |
| `getCliente` | `CodFilial` | não |
| `getTabela` | `CodPerfilSeguranca` | não |
| `getConsultaPreSMAberta` | conferir o antes e o depois de um envio | não |
| `setCancelaPreSM` | desfazer — já implementado na 026 | a criação já foi cobrada |

`getRotas` chamado **sem** origem e destino lista todas as rotas do cliente. É o atalho para propor
em lote.

---

## Sem chave de idempotência

A API não oferece campo para isso. O `Codigo` serve para **alterar** uma Pré-SM existente, não para
evitar duplicata.

A garantia é nossa, no banco: o índice único parcial em `trip_pre_sm`. E há um risco que não se
resolve daqui — se a gerenciadora criar e a resposta se perder, a tentativa seguinte cria a segunda
e a primeira fica órfã, paga e invisível. O envio uma-por-uma limita o estrago a uma.

---

## A incerteza que continua

**Não se sabe como o `setPreSM` amarra a Pré-SM à programação que a gerenciadora já tem do portal.**

Procurado na referência por `programação`, `demanda` e `carga` nas listas de campos dos dois métodos
de criação: **não há campo de código de programação**. Mas a amarração existe do lado dela — a
descrição do cancelamento de programação diz *"que está em aberto (sem viagem lançada)"*, e a tela
avisa *"esta programação já possui uma Pré-Solicitação em aberto"*.

Ou é por placa e data, ou é algo que não reconhecemos. **Pergunta pendente com a gerenciadora.**

Também pendente e da mesma família: se o `CNPJEmbarcador` é exigido na prática — a tela o marcava
como obrigatório, o manual não.

Quando as respostas chegarem, **muda um arquivo**: `packages/shared/src/domain/pre-sm-corpo.ts`.
