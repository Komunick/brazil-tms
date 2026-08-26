# Quickstart — 026 Pré-SM na Logae

## Antes de escrever código

Leia, nesta ordem: `docs/PROPOSTA-PRE-SM.md` (os números e o porquê), [spec.md](./spec.md) (o que
tem de acontecer), [research.md](./research.md) (as três decisões difíceis).

## As armadilhas desta fatia

**1. O CHECK recusa a migração.** Acrescentar `agregado`/`terceiro` ao enum sem reescrever os três
CHECKs de `vehicles`, `trailers` e `drivers` faz a feature quebrar no primeiro `update` — a migração
passa e o banco recusa a linha. Ver `data-model.md` §2.

**2. `subcontracted` não é erro.** Ele fica dormente e significa **"ainda não classificado"**. 1.246
veículos e 405 motoristas estão assim, e não serão migrados em massa — foi decisão. Tratar como erro
faria a tela acusar irregularidade em quase todo o cadastro.

**3. Duplicata custa dinheiro.** A gerenciadora cobra por solicitação. O índice único é **parcial**
(só `pendente` e `criada`) de propósito: se cobrisse tudo, uma Pré-SM cancelada travaria a viagem
para sempre.

**4. Não há ambiente de teste.** Homologação recusa o nosso login. A feature nasce **desligada** por
variável de ambiente; a primeira criação real é deliberada, com o usuário, e o cancelamento precisa
estar pronto antes.

**5. A credencial some no próximo deploy** se você a puser só no `.env.local`. Ela vai no
`devops/config.env`, que é a fonte do `gen-env.sh`. Essa lição já custou seis horas de alimentação
parada — está em `docs/OPERACAO.md`.

**6. Renumerar a migração no merge**, nunca antes.

## Como rodar

```bash
pnpm install
pnpm --filter @brazil-tms/db migrate      # depois de escrever a migração
pnpm vitest run packages/shared/src/domain/pre-sm.test.ts
pnpm --filter @brazil-tms/web lint && npx tsc --noEmit -p apps/web/tsconfig.json
```

O worker roda separado do app; um job novo precisa de restart dele para valer.

## Como conferir sem chamar a gerenciadora

Com o interruptor desligado, o trabalho roda inteiro e registra em `trip_pre_sm.payload_enviado` o
que **teria** mandado. Atribua uma viagem e leia essa linha: ela diz se o corpo está certo, se o
modelo casou e se o vínculo foi traduzido — tudo sem tocar no sistema deles.

É assim que se valida antes da virada.

## Variáveis novas

| variável | onde | para quê |
|---|---|---|
| `INTEGRA_LOGIN` / `INTEGRA_SENHA` | **worker apenas** | credencial de produção |
| `INTEGRA_PRE_SM_ATIVO` | worker | o interruptor; ausente ou `false` = não chama |
| `INTEGRA_PRE_SM_TETO_DIARIO` | worker | quantas por dia; começa em `0` |

Todas no `devops/config.env` **e** no `.env.local` — ver armadilha 5.

---

# O que a tela da Logae mostrou (2026-08-25) — LEIA ANTES DE LIGAR

A fatia inteira foi escrita sem ninguém ter visto a tela onde a operação gera Pré-SM hoje. Vimos
nesse dia, ao vivo, e o que apareceu **confirma uma parte do desenho e põe outra em dúvida**.

## O que confirmou

**A Logae já recebe as nossas LHs direto do portal do cliente.** A aba "Programação de Cargas"
mostrava a viagem `LT0Q8Q02EMND1` (código `606158`) com **placa, carreta, agenda de coleta e de
entrega já preenchidas**, e status `Veículo já programado`. Nada disso é digitado por nós.

**O trabalho manual que existe é o VÍNCULO, e só ele.** Na tela "Gerar Viagem Automática", os únicos
campos editáveis eram `Vínculo Placa Veículo`, `Vínculo Carreta 01` e `Vínculo Motorista 01`. Placa,
carreta, motorista e perfil de segurança vinham travados, vindos da programação.

**E o vínculo não é derivável — a Logae também pergunta.** O vínculo da CARRETA estava **em branco,
com erro obrigatório**, enquanto veículo e motorista já mostravam `AGREGADO` porque foram informados
em viagens anteriores. Ou seja: ela guarda por recurso e pergunta uma vez — exatamente o desenho de
FR-009/FR-010, descoberto por acaso depois de implementado.

**O perfil de segurança vem da programação** (`DDR SHOPEE`), não do modelo. É por isso que o
`setPreSMdeModelo` não precisa recebê-lo.

## O que pôs em dúvida — e é o que falta responder

O primeiro campo do formulário manual é **"Buscar informações a partir das demandas"**, com
`Cod: 606158 - Veiculo: PVY4J73 - Carreta: TYJ8C07 - Motorista: MARCIO DE OLIVEIRA BARBOSA`.

**Esse campo não existe na API.** Conferido campo a campo no manual `Integra_14.2`: nem
`setPreSMdeModelo` (§a, pág. 119) nem `setPreSM` (§17067 do texto extraído) têm qualquer campo que
aponte para a programação. Procurado por `programação`, `demanda` e `carga` nas duas listas.

Então a Pré-SM criada pela API **pode nascer solta**, paralela à programação — que continuaria com o
botão "Gerar Pré-SM" por apertar, e a solicitação sairia cobrada sem resolver nada.

Há indício de que a Logae SABE amarrar: ao tentar gerar numa viagem que já tinha uma, ela avisou
*"Esta programação já possui uma Pré-Solicitação em aberto, deseja alterá-la?"*. O que não se sabe é
se ela consegue fazer esse amarre quando a Pré-SM chega pela API, sem referência nenhuma.

## Duas coisas mais que apareceram

**A tela "automática" não usa modelo.** Ela descobre a rota a partir da origem e do destino da
programação. O `setPreSMdeModelo` EXIGE `CodModelo`. São caminhos diferentes, e o que a API produz
pode não ser o que a tela produz.

**Existe uma família de métodos que a fatia ignorou**: `getListaProgramacaoCargas`,
`getProgramacaoCargas`, `setProgramacaoCargas`, `setAceitarProgramacaoCargas`,
`setRejeitarProgramacaoCargas`, `setCancelamentoProgramacaoCargas`, `setEngate`. O
`getListaProgramacaoCargas` devolve o **status de cada programação** — e a lista de valores inclui
`VP - Veículo programado`, que é o que a tela mostrava. É leitura, não custa nada, e é o instrumento
do roteiro abaixo.

---

# Roteiro do primeiro teste real (substitui a T056)

Antes, a T056 era "ligar e ver se funciona". Isso gastaria uma solicitação sem uma pergunta clara.
Agora a pergunta é uma só:

> **A Pré-SM criada por `setPreSMdeModelo` se amarra à programação que já está no eTorre?**

Custa **uma** solicitação — o mesmo que a T056 custaria — mas com resposta legível no fim.

### Antes de começar

- [ ] Escolher **uma** viagem atribuída, cuja rota tenha correspondência **confirmada** na tela de
      modelos. Sem isso a decisão devolve `sem_modelo` e nada acontece.
- [ ] Ter o `setCancelaPreSM` à mão (já implementado, botão na viagem). A Pré-SM criada é cobrada
      mesmo cancelada — o cancelamento evita a escolta, não a cobrança.
- [ ] **Com o usuário presente.** Não é um teste para rodar sozinho.

### Passo 1 — o retrato de antes

```
getListaProgramacaoCargas   → guardar o STATUS da programação da viagem escolhida (esperado: VP)
getConsultaPreSMAberta      → guardar a lista inteira (eram 95 em 25/08)
```

Anotar os dois. Sem o retrato de antes, o depois não prova nada.

### Passo 2 — a criação

```
INTEGRA_PRE_SM_ATIVO=true
INTEGRA_PRE_SM_TETO_DIARIO=1
```

Reiniciar o worker e atribuir a viagem escolhida. O teto em `1` é o que impede um erro de virar
dez.

### Passo 3 — o retrato de depois, e a leitura

| O que olhar | O que significa |
|---|---|
| `getConsultaPreSMAberta` tem **uma nova** | a criação funcionou — a Pré-SM existe |
| A programação **mudou de status** | **amarrou**. A integração serve. Seguir para o teto maior |
| A programação **continua `VP`** | **nasceu solta.** Ver abaixo |
| Na tela, a programação passa a avisar "já possui Pré-Solicitação em aberto" | amarrou |
| Na tela, o botão "Gerar Pré-SM" ainda gera sem avisar | nasceu solta |

### Passo 4 — desligar

Independentemente do resultado: `INTEGRA_PRE_SM_TETO_DIARIO=0`. Só voltar a subir depois de decidir
o que fazer com a resposta.

### Se nasceu solta

A fatia **não resolve o problema** como está. O caminho provável passa a ser o `setPreSM` completo —
com o custo que a especificação evitou: espelhar cidades com código IBGE, cliente, filial e agência.
Isso é fatia nova, não ajuste.

Antes de partir para isso, perguntar à Logae. É de graça e pode encurtar tudo:

1. O `setPreSMdeModelo` amarra a Pré-SM à programação/demanda que já está no eTorre, ou cria solta?
2. Se cria solta, existe algum campo — em qualquer método — para informar o código da programação?
3. A tela "Gerar viagem automaticamente" descobre a rota sem modelo. Isso está exposto na API?

**A terceira é a mais valiosa.** Se existir, o trabalho de casar rota com modelo — a tela de
conferência inteira, 80 rotas para alguém aprovar — deixa de ser necessário.
