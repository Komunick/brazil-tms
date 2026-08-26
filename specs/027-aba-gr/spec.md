# Feature Specification: A aba GR — a Pré-SM feita por uma pessoa

**Feature Branch**: `027-aba-gr`

**Created**: 2026-08-25

**Status**: Draft

**Input**: Ver `docs/PROPOSTA-ABA-GR.md` — o desenho, as três decisões de uso e o que sobrevive da
fatia 026.

---

## Contexto

Leia antes, nesta ordem:

- **`docs/PROPOSTA-ABA-GR.md`** — o desenho e as decisões tomadas em 25/08.
- **`docs/INTEGRA-14.2-REFERENCIA.md`** — a API da gerenciadora, extraída do manual. É onde conferir
  qualquer afirmação sobre campos.
- **`docs/PROPOSTA-PRE-SM.md`** — os números medidos em produção.
- **`specs/026-pre-sm-logae/`** — a fatia anterior. **Está no `dev` e não deve ser promovida como
  está**: usa `setPreSMdeModelo`, e a gerenciadora respondeu por escrito que tem de ser `setPreSM`.

Esta fatia **substitui o miolo da 026**. Boa parte dela sobrevive intacta e não deve ser reescrita —
ver a seção "O que já existe" abaixo.

### O trabalho que existe hoje

Depois que a atribuição chega ao portal do cliente, uma pessoa abre o eTorre da gerenciadora Logae e
gera a Pré-SM à mão. Vimos a tela ao vivo em 25/08, e o que ela mostrou muda o entendimento do
problema:

**A Logae já recebe a LH do portal**, com placa, carreta e as agendas de coleta e entrega
preenchidas. Não é preciso mandar isso — já está lá.

**A única coisa que a pessoa digita é o vínculo** de cada recurso: veículo, carreta e motorista, cada
um como agregado, frota ou terceiro. Os outros campos vinham travados.

Ou seja: o retrabalho não é redigitar a viagem. É alguém precisar sair do TMS, entrar em outro
sistema, e responder três perguntas que o TMS já sabe responder.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver a fila e mandar uma Pré-SM (Priority: P1)

Quem cuida do gerenciamento de risco abre a aba **GR** e vê as viagens atribuídas que ainda não têm
Pré-SM. Cada linha mostra o que será enviado: placas, motorista, vínculos e a janela de coleta. Com
tudo em ordem, a pessoa aperta **Enviar Pré-SM** e a linha passa a mostrar o código devolvido pela
gerenciadora.

**Why this priority**: é a feature. Sem isto, a pessoa continua abrindo outro sistema.

**Independent Test**: com uma viagem atribuída e completa, abrir a aba, conferir o que a linha
mostra contra o que a gerenciadora recebeu, e ver o código aparecer.

**Acceptance Scenarios**:

1. **Given** uma viagem atribuída com motorista, placas, vínculos e janela de coleta, **When** a
   pessoa abre a aba GR, **Then** a viagem aparece na fila com todos esses dados à vista e o botão
   de enviar disponível.
2. **Given** essa viagem na fila, **When** a pessoa aperta Enviar, **Then** a Pré-SM é criada na
   gerenciadora e a linha passa a mostrar o código dela.
3. **Given** uma Pré-SM já criada, **When** a pessoa aperta Enviar de novo na mesma viagem,
   **Then** nada é criado e a tela diz que já existe uma.

---

### User Story 2 - Saber o que falta, e onde resolver (Priority: P1)

A viagem cai na fila com um dado faltando — o motorista sem CPF, a carreta sem vínculo, a rota sem
correspondência. A linha aparece com o botão travado e **diz o quê**, com caminho para resolver.
Resolvido o problema, a linha destrava.

**Why this priority**: mesma prioridade da primeira, e não é generosidade. Sem isto, 19% das viagens
(as sem CPF, medido) ficariam paradas sem ninguém saber por quê — e o desfecho seria alguém
concluindo que a aba não funciona.

**Independent Test**: pôr uma viagem com motorista sem CPF na fila e conferir que ela aparece, diz
"falta CPF", tem link para o cadastro, e destrava depois de o CPF ser preenchido.

**Acceptance Scenarios**:

1. **Given** uma viagem cujo motorista não tem CPF, **When** ela entra na fila, **Then** o botão
   fica travado e a linha diz que falta o CPF, com caminho para o cadastro do motorista.
2. **Given** uma viagem cuja carreta não tem vínculo classificado, **When** ela entra na fila,
   **Then** a linha diz qual recurso falta classificar.
3. **Given** uma viagem cuja rota não tem correspondência confirmada, **When** ela entra na fila,
   **Then** a linha diz que falta a rota, com caminho para a tela de conferência.
4. **Given** uma viagem com dois problemas ao mesmo tempo, **When** ela entra na fila, **Then** a
   linha mostra **todos** os motivos, não só o primeiro.

---

### User Story 3 - Desfazer o que saiu errado (Priority: P2)

A Pré-SM foi criada e alguém percebe que a atribuição estava errada. A viagem continua visível na
aba, na seção das já enviadas, com o código e um botão de cancelar. A pessoa cancela, e a viagem
volta a poder gerar outra.

**Why this priority**: é a única forma de desfazer, e não há ambiente de teste — toda criação
acontece contra o sistema real. Mas depende da primeira história existir.

**Independent Test**: criar uma Pré-SM, cancelá-la pela aba, e conferir na gerenciadora que ela
saiu.

**Acceptance Scenarios**:

1. **Given** uma Pré-SM criada, **When** a pessoa pede o cancelamento, **Then** a tela avisa que a
   solicitação já foi cobrada e que cancelar não devolve isso, antes de confirmar.
2. **Given** o cancelamento confirmado, **When** a gerenciadora responde, **Then** a viagem volta a
   aparecer na fila, podendo gerar outra.
3. **Given** uma Pré-SM que a gerenciadora recusa cancelar, **When** a resposta chega, **Then** a
   viagem continua marcada como tendo Pré-SM ativa e a mensagem dela é mostrada.

---

### User Story 4 - Conferir a ponte de cidade e de rota (Priority: P2)

Antes de a fila funcionar, alguém precisa confirmar como as nossas estações correspondem às cidades
e às rotas da gerenciadora. A carga **propõe** as correspondências; uma pessoa **confirma**; e só
correspondência confirmada permite enviar.

**Why this priority**: é pré-requisito da primeira história, mas entrega valor separado — a lista
das estações e rotas sem correspondência é a lista de trabalho de cadastro na gerenciadora.

**Independent Test**: rodar a carga, abrir a tela de conferência, confirmar algumas linhas, e ver
que só as confirmadas passam a valer.

**Acceptance Scenarios**:

1. **Given** uma estação nossa, **When** a carga roda, **Then** ela propõe a cidade correspondente
   sem confirmá-la.
2. **Given** uma correspondência proposta e não confirmada, **When** uma viagem usa aquela estação,
   **Then** a viagem aparece na fila dizendo que falta confirmar a cidade.
3. **Given** uma correspondência errada confirmada por engano, **When** alguém desfaz a
   confirmação, **Then** ela deixa de valer imediatamente.

---

### Edge Cases

- **A atribuição muda depois da Pré-SM criada.** A escolta foi contratada com os dados antigos. A
  aba avisa; alterar a Pré-SM está fora de escopo.
- **A viagem é cancelada depois da Pré-SM criada.** A Pré-SM continua ativa e cobrada. A aba precisa
  deixar isso visível — cancelar automaticamente está fora de escopo.
- **Duas pessoas apertam Enviar na mesma viagem ao mesmo tempo.** Só uma solicitação pode sair: a
  gerenciadora cobra por cada uma.
- **A gerenciadora não responde.** O pedido não pode se perder nem virar duas solicitações; e a
  pessoa precisa saber que está esperando, não que falhou.
- **A gerenciadora recusa.** A mensagem dela vai inteira para a tela, sem tradução nossa — é o que
  permite conversar com eles citando o código do erro.
- **A resposta se perde depois de a Pré-SM ter sido criada.** Uma solicitação paga fica órfã. A API
  não oferece chave de idempotência.
- **Uma estação nova aparece.** Ela não tem cidade correspondente ainda, e a viagem precisa dizer
  isso em vez de sumir da fila.
- **Origem igual ao destino.** Existem 46 viagens assim em produção. Elas não podem travar a fila
  nem gerar uma rota inexistente.

---

## Requirements *(mandatory)*

### Functional Requirements

#### A fila

- **FR-001**: O sistema MUST listar, numa aba própria, as viagens já atribuídas que ainda não têm
  Pré-SM ativa.
- **FR-002**: Cada linha MUST mostrar o que será enviado: placas do veículo e das carretas, nome do
  motorista (e do segundo, quando houver), o vínculo de cada recurso, e a janela de coleta.
- **FR-003**: A fila MUST se atualizar sozinha enquanto estiver aberta, sem a pessoa recarregar.
- **FR-004**: O sistema MUST ordenar a fila pela urgência da coleta — o que sai primeiro aparece
  primeiro.

#### O envio

- **FR-005**: Uma pessoa MUST poder enviar a Pré-SM de **uma** viagem por vez. Seleção múltipla e
  envio em lote estão fora de escopo.
- **FR-006**: O sistema MUST impedir o envio quando faltar qualquer dado obrigatório, e MUST dizer
  **todos** os dados que faltam — não apenas o primeiro.
- **FR-007**: Cada motivo de bloqueio MUST oferecer o caminho para resolvê-lo.
- **FR-008**: O sistema MUST garantir **no máximo uma** Pré-SM ativa por viagem, mesmo com pedidos
  simultâneos ou reprocessamento.
- **FR-009**: O sistema MUST registrar quem enviou cada Pré-SM e quando.
- **FR-010**: Enquanto a gerenciadora não responder, o sistema MUST mostrar que o pedido está em
  andamento — distinguindo isso de ter falhado.

#### O que a gerenciadora responde

- **FR-011**: O sistema MUST guardar o código da Pré-SM devolvido, junto da viagem.
- **FR-012**: Quando a gerenciadora recusar, o sistema MUST mostrar a mensagem dela **inteira**, sem
  tradução nossa.
- **FR-013**: O sistema MUST distinguir três desfechos que mandam a pessoa a lugares diferentes:
  falta dado nosso · a gerenciadora recusou · a comunicação falhou.

#### Depois de enviada

- **FR-014**: A viagem MUST continuar visível na aba depois de a Pré-SM ser criada, numa seção
  separada das que ainda faltam.
- **FR-015**: Uma pessoa MUST poder cancelar uma Pré-SM criada, e o sistema MUST avisar antes que a
  solicitação já foi cobrada e que cancelar não devolve isso.
- **FR-016**: Quando a atribuição mudar depois de a Pré-SM ter sido criada, o sistema MUST avisar —
  a escolta foi contratada com os dados antigos.

#### As pontes de cadastro

- **FR-017**: O sistema MUST propor, para cada estação nossa, a cidade correspondente na
  gerenciadora, **sem confirmá-la**.
- **FR-018**: O sistema MUST propor, para cada rota nossa, a rota correspondente na gerenciadora,
  **sem confirmá-la**.
- **FR-019**: Só correspondência **confirmada por uma pessoa** MUST valer para enviar uma Pré-SM.
- **FR-020**: O sistema MUST permitir desfazer uma confirmação, e MUST registrar quem confirmou ou
  desfez.
- **FR-021**: Repetir a carga MUST ser seguro: não pode desfazer confirmação de ninguém nem duplicar
  correspondências.

#### Segurança e custo

- **FR-022**: A credencial da gerenciadora MUST viver apenas onde o trabalho de fundo roda, nunca no
  aplicativo web nem em resposta de rota.
- **FR-023**: Toda escrita na gerenciadora MUST acontecer como trabalho de fundo, nunca no caminho
  de uma requisição da tela.
- **FR-024**: Quem pode enviar Pré-SM MUST ser a mesma chave de quem atribui recursos. Confirmar
  correspondências de cidade e rota MUST exigir a chave de dados comerciais — é decisão de cadastro,
  não de escala.

### Key Entities

- **Pré-SM da viagem**: o vínculo entre uma viagem nossa e a solicitação na gerenciadora. Guarda o
  desfecho (pendente, criada, recusada, sem dados, cancelada, não tentada), o código devolvido, o
  que foi enviado, quem pediu e quando. **Já existe** — ver `trip_pre_sm` na 026.
- **Correspondência de estação → cidade**: a ponte entre uma estação nossa e a cidade no cadastro da
  gerenciadora. Nasce proposta, vira válida quando alguém confirma. **Nova.**
- **Correspondência de rota**: a ponte entre um par origem–destino nosso e a rota no cadastro da
  gerenciadora. **Já existe** na 026 apontando para modelo; passa a apontar para rota.
- **Vínculo do recurso**: se um veículo, carreta ou motorista é frota própria, agregado ou terceiro.
  **Já existe** — ver a migração 0046.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Quem cuida do gerenciamento de risco deixa de abrir o sistema da gerenciadora para
  criar Pré-SM. O trabalho passa a acontecer inteiro numa tela só.
- **SC-002**: Uma viagem completa vai da fila à Pré-SM criada em menos de um minuto de trabalho
  humano, contando desde abrir a aba.
- **SC-003**: **Nenhuma** viagem some em silêncio: toda viagem atribuída ou está na fila pronta,
  ou está na fila dizendo o que falta, ou está na seção das já enviadas.
- **SC-004**: Nenhuma viagem gera mais de uma Pré-SM cobrada, mesmo sob cliques repetidos ou
  reprocessamento.
- **SC-005**: Das viagens atribuídas num dia comum, pelo menos 80% chegam à fila sem nada faltando —
  o resto é trabalho de cadastro conhecido, e a fila diz qual.
- **SC-006**: Quando a criação falha, a pessoa consegue dizer, sem pedir ajuda, se o problema é
  nosso cadastro ou uma recusa da gerenciadora.

---

## Assumptions

- **A aba é para quem cuida de risco, e mora perto da expedição.** Não é uma tela de administração:
  é operação diária.
- **A janela de coleta da viagem é a janela que a gerenciadora espera.** É o que a tela dela mostrava
  vindo da programação.
- **A cidade da estação sai do nome dela.** Medido: das 228 estações, 8 têm cidade preenchida e 71
  têm UF — mas o nome carrega os dois (`SOC_MG_BETIM` → MG · Betim). É o mesmo padrão que o
  casamento de rotas já separa hoje.
- **Uma pessoa confere as correspondências antes de a fila valer.** São 228 estações e 134 rotas,
  uma vez. O casamento por nome erra apontando para OUTRA cidade, não em branco — por isso a
  conferência não é burocracia.
- **Metade das viagens não terá rota cadastrada na gerenciadora, no começo.** Medido em 25/08: das
  134 rotas nossas, **53 existem lá** — 52% das viagens. O resto é trabalho de cadastro **na
  Logae**, e a fila diz exatamente quais faltam. A tela precisa deixar claro que isso é pendência
  deles, não defeito daqui.
- **O perfil de segurança e a filial são constantes por cliente**, e os valores já são conhecidos:
  filial `9332` e perfil `20785 · DDR SHOPEE`, ambos vindos do cadastro da gerenciadora. Se um
  segundo cliente exigir valores diferentes, vira configuração — não código.
- **A criação automática continua existindo, desligada.** O trabalho de fundo da 026 fica no código
  com o interruptor ausente, para ser ligado depois que a aba tiver rodado e houver confiança.

---

## O que já existe, e não deve ser reescrito

Da fatia 026, no `dev`:

| O que | Onde |
|---|---|
| O vínculo A/F/T e sua migração | `0046`, `0047`, diálogo de atribuição |
| O estado da Pré-SM por viagem | `trip_pre_sm`, incluindo `nao_tentada` |
| A garantia de uma Pré-SM ativa por viagem | índice único parcial |
| O cancelamento | trabalho de fundo + botão na viagem |
| O aviso de divergência | cálculo na leitura, não guardado |
| A tela de conferência de rotas | passa a mostrar rota em vez de modelo |
| O cliente da gerenciadora | tratamento de `CodErro`, tempo limite, erros |

**Some**: a criação a partir de modelo e o catálogo de modelos.

---

## Fora de escopo

- Efetivar a Pré-SM (converter em SM de verdade) — continua sendo decisão humana no sistema da
  gerenciadora.
- Envio em lote ou seleção múltipla.
- Alterar uma Pré-SM já criada quando a atribuição muda — o sistema **avisa**, não corrige.
- Cancelar a Pré-SM automaticamente quando a viagem é cancelada.
- Documentos, ajudante e faixa de temperatura na solicitação.
- Criar ou alterar a programação de carga na gerenciadora.
- Ligar a criação automática.

---

## Incerteza conhecida

**Não se sabe como a solicitação criada pela API se amarra à programação que a gerenciadora já tem
do portal.** Não há campo de código de programação em nenhum dos métodos de criação — conferido na
referência extraída do manual. Ou a amarração é por placa e data, ou existe algo que não
reconhecemos. Pergunta pendente com a gerenciadora.

Isto **não bloqueia a aba**, que é necessária de qualquer forma: a fila, a lista do que falta e a
conferência das correspondências valem independentemente. Bloqueia apenas o formato exato do corpo
enviado, e o plano deve tratar isso como pendência com dono, não como suposição resolvida.
