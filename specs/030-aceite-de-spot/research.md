# Research: Aceite de oferta de spot direto no cartão

**Feature**: 030-aceite-de-spot · **Date**: 2026-09-01

Dez decisões, na ordem das perguntas do plano. Cada uma registra o que foi escolhido, por quê, e o
que foi recusado — a alternativa recusada é a parte que impede a decisão de ser refeita daqui a três
meses por alguém que só lê o resultado.

---

## R1 — O estado do cartão é DERIVADO, não guardado

**Decisão**: a máquina de estados do cartão é calculada a cada leitura, a partir de dados que já
existem. Nenhuma coluna nossa guarda "aceita", "enviada" ou "recusada".

| estado do cartão | como é derivado |
| --- | --- |
| `sem_viagem` | não há linha em `trips` com aquele `external_trip_id` |
| `esperando` | `customer_fields->>'Aceitação (portal)' = 'Pending'` e nenhuma ordem aberta |
| `enviado` | há `portal_commands` com `action='accept'` e status `pending` ou `sent` |
| `recusado` | a última ordem de aceite está `failed`; `last_error` diz o quê |
| `aceito` | `customer_fields->>'Aceitação (portal)' = 'Accepted'` — **e a oferta sai da lista** |

**Rationale**: o FR-014 diz que o cartão sai "quando a leitura trouxer a viagem como aceita, e por
nenhum outro motivo". A forma de garantir isso não é disciplina, é ausência: se não existe coluna
onde gravar "aceita", não existe segundo gatilho possível. E o caso comum já é o que quebraria uma
cópia — das 19 ofertas dos últimos dois dias, quase todas foram aceitas **direto no portal**, sem
passar pelo TMS. Uma coluna nossa continuaria dizendo "esperando" para sempre.

Medido para sustentar a escolha: 98 de 98 ofertas que casaram com viagem estão hoje `Accepted`, e as
13 ordens de aceite concluídas provam que o campo passa por `Pending` antes — é justamente a janela
de 0 a 3 minutos em que os aceites manuais aconteceram.

**Alternativas recusadas**:

- **Colunas de decisão em `spot_offers`** (`aceita_em`, `aceita_por`, `status`). Recusada: cria uma
  segunda verdade sobre um fato que é do portal. Divergiria no primeiro aceite feito fora do TMS —
  isto é, quase sempre. Violaria o FR-014 por construção.
- **Tabela de eventos da oferta**, com uma linha por transição. Recusada por YAGNI: a história de
  quem decidiu o quê já é gravada por `portal_commands` + `audit_logs`, e uma terceira cronologia da
  mesma coisa só criaria a pergunta "qual delas está certa?".

---

## R2 — A dispensa pessoal é uma linha por (pessoa, oferta)

**Decisão**: tabela `spot_offer_dispensas` com chave primária composta `(spot_offer_id, user_id)`.

**Rationale**: a consulta que a rota faz de 5 em 5 segundos é "quais ofertas esta pessoa ainda NÃO
dispensou". Com uma linha por par, é um `not exists` sobre a chave primária. A gravação é um
`insert ... on conflict do nothing` — idempotente, e duas abas clicando juntas não se atropelam.

Sobre o crescimento: o teto é 10 ofertas/dia × 34 pessoas = 340 linhas/dia no pior caso, e o caso
real é uma fração disso, porque quem dispensa uma oferta não é a equipe inteira. Não há job de
limpeza, e a ausência dele é deliberada (YAGNI): a tabela é minúscula e a dispensa antiga não
atrapalha consulta nenhuma, porque toda leitura já é recortada pelo dia.

**Alternativas recusadas**:

- **Um `jsonb` de ids dispensados no usuário.** Recusada por dois motivos concretos: não dá para
  filtrar por oferta com índice, e a escrita é ler-modificar-gravar — duas abas dispensando duas
  ofertas ao mesmo tempo fazem uma apagar a outra. É exatamente o defeito que o `dashboard-prefs`
  desta base já pagou uma vez.
- **`localStorage`.** Recusada pelo FR-018: morre ao trocar de posto e ao limpar o navegador, e a
  operação usa mais de uma máquina.

---

## R3 — A rota que existe engorda; nenhuma rota de leitura nova

**Decisão**: `GET /api/spot-offers` passa a devolver, por oferta, o que a derivação precisa
(`tripId`, aceitação do portal, ordem aberta, último erro) e **já esconde o que quem pediu
dispensou**. Nenhuma rota de leitura nova.

**Rationale**: essa rota já existe justamente porque o aviso precisa de ritmo próprio, e o
comentário dela diz isso. Criar uma segunda rota faria duas leituras do mesmo assunto com dois
ritmos — o defeito que ela nasceu para evitar.

O custo foi medido, não estimado: a consulta com o `left join` para `trips` executa em **2,5 ms**
contra a produção. O teto de linhas continua sendo o do dia (30). O `refetchInterval` de **5 s** e o
`refetchIntervalInBackground` ficam como estão: são eles que fazem o cartão sair quando o portal
confirma, e o SC-003 (sair em até um minuto) tem folga — a latência real é a leitura do plano (20 s)
mais o polling (5 s).

Filtrar a dispensa **no servidor** resolve o FR-018 de graça: recarregar não traz de volta o que a
pessoa escondeu, porque nunca chegou.

**Alternativa recusada**: devolver tudo e filtrar no cliente. Recusada porque a dispensa passaria a
depender de o cliente lembrar de filtrar, em três telas diferentes — e porque o payload carregaria
ofertas que ninguém vai ver.

---

## R4 — O aceite reusa a rota da viagem; a auditoria ganha a origem

**Decisão**: o botão do cartão chama `POST /api/trips/[id]/portal-action` com `action: "accept"`,
usando o `tripId` que a leitura passou a devolver. `enfileirarOrdemDoPortal` continua sendo o único
lugar que cria ordem de aceite. Para o FR-025, a rota passa a registrar **de onde** a decisão saiu
(`oferta_spot` ou `tela_da_viagem`) no `newValue` da auditoria que ela já grava.

**Rationale**: o FR-009 proíbe um segundo caminho de aceite, e a razão é concreta — o guarda
(`impedimentoDaAcao`), o índice de uma ordem aberta por viagem e a auditoria na mesma transação são
todos daquele caminho. Uma rota nova por oferta teria de recriar os três, e o dia em que um deles
mudasse, mudaria só de um lado.

A origem é um campo opcional a mais no corpo, gravado no registro de auditoria. Não muda a assinatura
de `enfileirarOrdemDoPortal` para ninguém que já a chama.

**Alternativas recusadas**:

- **`POST /api/spot-offers/[id]/aceitar`.** Recusada pelo FR-009. Mesmo delegando internamente, ela
  seria um segundo endereço para a mesma decisão, e o próximo guarda acrescentado a um deles não
  chegaria ao outro.
- **Não registrar a origem.** Recusada pelo FR-025. Sem ela, o registro não distingue a decisão
  tomada no calor do leilão da tomada na tela da viagem — e é essa distinção que dá sentido à
  revisão depois.

---

## R5 — O cartão sai porque some da lista, não porque alguém o remove

**Decisão**: a tela **não tem** um caminho de código que remova um cartão por aceite. A oferta some
porque a leitura seguinte não a traz — o servidor a exclui quando a aceitação do portal é `Accepted`.

**Rationale**: é o FR-014 provado por construção em vez de por disciplina. Se a remoção fosse uma
decisão do cliente, existiria a pergunta "quais são os gatilhos?" e a resposta envelheceria a cada
ramo novo. Não existindo o ramo, existe um gatilho só.

De quebra, o caso comum sai de graça: a viagem aceita por outra pessoa **direto no portal** some do
cartão de todo mundo sem que nada precise saber que foi assim.

**Alternativa recusada**: o cliente esconder o cartão quando o `POST` responde sucesso. Recusada
explicitamente pelo usuário — "se lá no portal tiver Aceito, ela vai sumir; é que nem a certificação
do atribuir". Ordem aceita pelo robô não é viagem aceita pelo portal, e das 17 ordens gravadas, 4
voltaram recusadas.

---

## R6 — A recusa mostra o texto do portal; a tradução é só do que já vimos

**Decisão**: a tela mostra a mensagem que o portal devolveu. Para os códigos que já foram observados
em produção, ela mostra ANTES uma frase em português que explica o que aquilo significa para quem
opera. **Código desconhecido cai no texto cru do portal, nunca em "erro desconhecido".**

Hoje há exatamente um código a traduzir, e ele responde por 4 das 4 recusas:

> `131205003` → *"A viagem não está mais esperando decisão — ela pode já ter sido aceita, aqui ou no
> portal."*

**Rationale**: a regra do passthrough é o que impede o catálogo de envelhecer. Um mapa que precisasse
cobrir tudo ficaria desatualizado no primeiro código novo e, pior, esconderia a mensagem real atrás
de uma frase genérica — que é o que faz alguém abrir o portal para descobrir o que houve.

A recusa **não** tira o cartão da tela e **volta a permitir tentar**, porque ela tem duas causas
possíveis e a tela não sabe qual: corrida perdida (a LH foi tomada) ou estado velho do nosso lado (a
aceitação que o TMS conhece tem até 20 s de idade). Nos dados: `LT0Q8S02EKYI1` deu certo às 14:57 e
falhou às 14:58 e 15:02 — reaceite do que já era nosso; `LT1Q8U02FIC71` falhou às 13:28 enquanto o
`FIC82` da mesma leva passou às 13:29 — corrida perdida.

**Alternativa recusada**: traduzir tudo, com um "não foi possível aceitar" de fallback. Recusada
porque apaga a única informação que permite entender o caso novo.

---

## R7 — A camada perde a cortina e vira grade

**Decisão**: sai o `boxShadow: 0 0 0 9999px rgba(3,10,18,0.62)`. A camada continua
`pointer-events-none`; só os cartões recebem clique. Um cartão sozinho ocupa o meio como hoje; dois
ou mais dividem em duas colunas e descem em linhas; passando da altura, o conjunto rola dentro da
própria camada, sem esconder nenhum (FR-002).

**Rationale**: a cortina existia porque o cartão durava trinta segundos. Parando na tela, ela apagaria
o TMS o dia inteiro — e o pedido do usuário foi explícito: "que não atrapalhe se alguém tiver
atribuindo".

**Como o FR-003 vira verificável, e não afirmação**: dois testes.

1. Um guarda de código que falha se a cortina voltar — procura o `9999px` e qualquer `inset-0` com
   fundo opaco no arquivo da camada.
2. Um Playwright que abre a tela com cartões, **digita num campo atrás deles e envia**, provando que
   o foco do teclado e o clique chegam ao que está embaixo.

**Alternativa recusada**: manter a cortina só no primeiro cartão. Recusada porque o primeiro cartão é
justamente o que fica mais tempo na tela.

---

## R8 — Recolher é estado de tela, e oferta nova reabre

**Decisão**: o recolhido vive na aba e não é guardado. Recarregar reabre. **Uma oferta nova reabre o
conjunto**, e a contagem fica visível o tempo todo enquanto recolhido.

**Rationale**: recolher é "me dá a tela por um minuto", não uma preferência. Guardado, ele vira o
próprio defeito que o X causava: alguém esconde, esquece, e as ofertas passam sem ninguém ver — com
o agravante de que nem reiniciar traria de volta.

Oferta nova reabrir é o ponto da fatia: informação nova não pode ficar atrás de um gesto antigo. O
custo é conhecido e aceito — quem recolheu para atribuir pode ser reaberto no meio; e é por isso que
a camada não rouba foco nem bloqueia clique, o que torna a reabertura um incômodo visual, não uma
interrupção.

**Alternativa recusada**: guardar o recolhido por pessoa. Recusada pelo motivo acima. Também foi
recusado **recolher com prazo** (reabrir sozinho em N minutos): é um número inventado, e o pedido não
tem nada que o sustente.

---

## R9 — O Painel do dia lê a mesma derivação — e ganha uma correção de passagem

**Decisão**: `readSpotPorRegiao` passa a classificar cada linha pela derivação do R1, e o pontinho
ganha o terceiro estado. As linhas continuam vindo no payload do painel, sem busca própria.

**A correção**: hoje o painel decide "aceita" com `t.id is not null` — *a viagem existe no TMS*. É um
atalho, e ele **erra exatamente na janela desta fatia**: durante os minutos em que a viagem já chegou
e ainda está `Pending`, a oferta é contada como aceita. Verificado em produção: das 98 ofertas com
viagem, 98 estão `Accepted` hoje — o atalho coincide com a verdade *depois*, e não *durante*, que é
por isso que ninguém notou. Com o terceiro estado, "aceita" passa a significar aceita.

**Custo**: até 20 linhas por frente, três frentes, e o painel recarrega de minuto em minuto. São dois
campos a mais por linha.

**Como o FR-022 fica garantido**: as duas telas chamam a MESMA função de derivação, em
`packages/shared`. Não é abstração para reúso — é fonte única de uma regra de correção, e está
registrada em Complexity Tracking do plano.

**Alternativa recusada**: dar busca própria às linhas do painel, como a lista de LH tem. Recusada
porque seria uma segunda ida ao servidor para trazer o que já cabe no payload, e porque duas
leituras do mesmo estado com dois ritmos é o começo da divergência.

---

## R10 — Oferta sem viagem: sem aceite, e o fim de vida já existe

**Decisão**: a oferta sem viagem correspondente mostra o cartão com o aceite indisponível e a razão
escrita. Ignorar continua disponível. **Não nasce nenhum prazo novo**: a janela do dia que
`readSpotOffersToday` já impõe é o fim de vida, e ela passa a ser declarada.

**Rationale**: 34 das 132 ofertas nunca viraram viagem — são rotas que não pegamos, ou que o leilão
fechou antes. Um prazo próprio ("some em 2 horas") seria número inventado, e faria a oferta sumir sem
decisão, que é o defeito que esta fatia veio consertar.

A janela do dia é **uma exceção real ao FR-001**, e está escrita no plano em vez de descoberta depois:
uma oferta não decidida some na virada do dia em São Paulo. É deliberado — leilão de ontem é leilão
morto — e o registro do dia continua tendo a oferta.

Para as 82 de 98 em que a viagem chega em até dois minutos, o botão liga sozinho: o polling de 5 s
já traz a viagem assim que ela existe, sem nada a fazer.

**Alternativas recusadas**:

- **Criar a viagem a partir da oferta para poder aceitar.** Recusada com força: inventaria viagem que
  o cliente não deu, e o comentário do schema de `spot_offers` já explica por que oferta não mora em
  `trips` — criaria viagem fantasma que nunca aconteceu.
- **Esconder a oferta sem viagem.** Recusada: é justamente a oferta que alguém pode querer correr
  atrás no portal, e escondê-la apagaria a informação de que ela chegou.
