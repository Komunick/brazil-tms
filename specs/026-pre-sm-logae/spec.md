# Feature Specification: Pré-SM criada sozinha ao atribuir

**Feature Branch**: `026-pre-sm-logae`

**Created**: 2026-08-25

**Status**: Draft

**Input**: Criar a Pré-SM na gerenciadora Logae automaticamente quando a atribuição chega ao portal do cliente, via `setPreSMdeModelo`. Levantamento completo, com os números medidos em produção e as decisões de negócio, em **`docs/PROPOSTA-PRE-SM.md`** — esta especificação o referencia e não o repete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Pré-SM nasce sozinha (Priority: P1)

Quem escala abre a viagem, escolhe motorista e placas, e confirma. A atribuição chega ao portal do
cliente como já chega hoje. **A diferença é o que acontece depois**: a solicitação de monitoramento
aparece no sistema da gerenciadora sem ninguém digitar nada, e a viagem no TMS passa a mostrar o
número dela.

Hoje esse passo é feito à mão: alguém abre o sistema da Logae e redigita motorista, placas e horário
de coleta que já foram digitados no TMS. É retrabalho, e é onde entra erro de digitação num dado que
a escolta usa.

**Why this priority**: é a feature. Sem ela, nada mais aqui tem motivo para existir.

**Independent Test**: atribuir uma viagem de rota conhecida e conferir, no sistema da gerenciadora,
que a Pré-SM apareceu com o motorista, as placas e o horário certos — e que o TMS mostra o número.

**Acceptance Scenarios**:

1. **Given** uma viagem de rota com modelo cadastrado, motorista com CPF e vínculo definidos, e
   placas preenchidas, **When** a ordem de atribuição volta confirmada do portal, **Then** a Pré-SM é
   criada na gerenciadora e o seu código fica guardado na viagem.
2. **Given** a mesma viagem, **When** alguém abre a viagem no TMS depois disso, **Then** o número da
   Pré-SM e o momento da criação aparecem na tela.
3. **Given** uma viagem cuja Pré-SM já foi criada, **When** a atribuição é enviada de novo (troca de
   motorista, por exemplo), **Then** o sistema **não** cria uma segunda Pré-SM para a mesma viagem.

---

### User Story 2 - O vínculo é escolhido por quem sabe (Priority: P1)

A gerenciadora exige, para cada veículo, cada carreta e cada motorista, dizer o que ele é: **frota
própria**, **agregado** ou **terceiro**. Hoje o TMS distingue só "nosso" de "de fora".

Quem atribui vê o campo já preenchido com um palpite e corrige se estiver errado. Da segunda vez que
aquele veículo ou motorista aparecer, a resposta já vem do que foi escolhido antes — a pergunta some.

**Why this priority**: sem o vínculo a gerenciadora recusa a criação. É pré-requisito da história 1,
mas entrega valor sozinha: o cadastro passa a distinguir agregado de terceiro, o que hoje ninguém
sabe.

**Independent Test**: atribuir um veículo novo, ver o campo pré-selecionado, trocar o valor, salvar,
e atribuir de novo — na segunda vez o valor escolhido volta sem perguntar.

**Acceptance Scenarios**:

1. **Given** um veículo que nunca foi classificado, **When** o diálogo de atribuição abre, **Then** o
   vínculo aparece pré-selecionado a partir de quem é o dono do veículo na gerenciadora.
2. **Given** um motorista que nunca foi classificado, **When** o diálogo abre, **Then** o vínculo
   dele aparece **em branco** — a gerenciadora não informa vínculo de motorista, e um palpite aqui
   seria invenção.
3. **Given** um recurso já classificado antes, **When** ele volta a ser atribuído, **Then** o valor
   guardado aparece sem perguntar de novo.
4. **Given** que a pessoa trocou o vínculo sugerido, **When** ela confirma a atribuição, **Then** o
   valor escolhido é guardado no recurso e passa a valer para as próximas.

---

### User Story 3 - Quando não dá, a tela diz por quê (Priority: P2)

Nem toda viagem pode gerar Pré-SM. Falta o CPF de 19% dos motoristas; 16% das viagens rodam em rotas
que ainda não têm modelo cadastrado na gerenciadora; e o vínculo pode não ter sido definido.

Nesses casos o sistema **não cria** e **diz o que falta**, na própria viagem, com o caminho para
resolver.

**Why this priority**: sem isso a feature falha em silêncio — e a operação passa a achar que a Pré-SM
foi criada quando não foi. É pior do que não ter a feature, porque troca um trabalho conhecido por
uma confiança errada.

**Independent Test**: atribuir uma viagem cujo motorista não tem CPF e conferir que a viagem mostra
o que faltou, com link para o cadastro do motorista.

**Acceptance Scenarios**:

1. **Given** um motorista sem CPF no cadastro, **When** a atribuição é confirmada, **Then** a Pré-SM
   não é criada e a viagem mostra que faltou o CPF, com o caminho para o cadastro.
2. **Given** uma rota sem modelo cadastrado na gerenciadora, **When** a atribuição é confirmada,
   **Then** a Pré-SM não é criada e a viagem mostra que falta o modelo daquela rota.
3. **Given** um veículo ou motorista sem vínculo definido, **When** a atribuição é confirmada,
   **Then** a Pré-SM não é criada e a viagem mostra qual recurso está sem classificação.
4. **Given** que a gerenciadora recusou a criação por um motivo dela, **When** isso acontece,
   **Then** a mensagem devolvida por ela aparece na viagem, sem tradução nem interpretação nossa.

---

### User Story 4 - Enxergar e desfazer (Priority: P3)

Quem acompanha precisa ver o estado da Pré-SM sem abrir o sistema da gerenciadora, e precisa poder
cancelar uma que foi criada por engano.

**Why this priority**: é o que torna a feature operável no dia a dia, mas as três primeiras já
entregam o valor central. E o cancelamento é a única saída disponível para uma Pré-SM criada errado,
já que não existe ambiente de teste (ver Assumptions).

**Independent Test**: criar uma Pré-SM, ver o estado dela na viagem, cancelar, e conferir que o
estado muda.

**Acceptance Scenarios**:

1. **Given** uma viagem com Pré-SM criada, **When** alguém a abre, **Then** vê o número, o estado
   atual e quando foi criada.
2. **Given** uma Pré-SM ainda não efetivada, **When** alguém com permissão pede o cancelamento,
   **Then** ela é cancelada na gerenciadora e a viagem passa a mostrar isso.

---

### Edge Cases

- **A gerenciadora está fora do ar ou demora.** A atribuição no portal já aconteceu e não pode ser
  desfeita por causa disso. O sistema tenta de novo mais tarde, e a viagem mostra que a Pré-SM está
  pendente — nunca que falhou definitivamente enquanto ainda houver tentativa por vir.
- **A mesma ordem de atribuição é processada duas vezes.** Não pode nascer Pré-SM duplicada: a
  gerenciadora cobra por SM e uma duplicata é escolta contratada em dobro.
- **A viagem é cancelada depois da Pré-SM criada.** Fica registrado o que fazer, mas o cancelamento
  automático **não** entra nesta fatia (ver Out of Scope) — a viagem passa a mostrar que há uma
  Pré-SM aberta para uma viagem cancelada.
- **Troca de motorista depois da Pré-SM criada.** A Pré-SM existente fica desatualizada. Nesta fatia
  o sistema **avisa** que os dados divergem; alterar a Pré-SM existente fica para depois.
- **O motorista tem CPF no TMS mas a gerenciadora não o conhece.** A recusa vem dela e aparece na
  viagem como qualquer outra recusa.
- **Viagem com dois motoristas.** O segundo entra na Pré-SM, e o vínculo dele é exigido igual ao do
  primeiro.
- **Rota cujo nome de estação mudou no portal.** O casamento com o modelo precisa tolerar as mesmas
  variações que o resto do sistema já tolera (acento, parênteses, número colado à sigla, zero à
  esquerda) — foi medido que sem isso 4 rotas e 233 viagens/mês caem como "sem modelo".

## Requirements *(mandatory)*

### Functional Requirements

**Criação**

- **FR-001**: O sistema MUST criar a Pré-SM na gerenciadora quando — e somente quando — a ordem de
  atribuição enviada ao portal do cliente for confirmada como concluída.
- **FR-002**: O sistema MUST criar **no máximo uma** Pré-SM por viagem, mesmo que a atribuição seja
  reenviada ou que a ordem seja processada mais de uma vez.
- **FR-003**: O sistema MUST guardar, junto da viagem, o código da Pré-SM devolvido pela
  gerenciadora, o momento da criação e quem/o que a originou.
- **FR-004**: O sistema MUST NOT efetivar a Pré-SM automaticamente. A conversão em solicitação de
  monitoramento permanece uma decisão humana, fora desta fatia.
- **FR-005**: O sistema MUST montar a Pré-SM a partir do modelo de rota cadastrado na gerenciadora,
  informando motorista, segundo motorista (quando houver), placas do veículo e das carretas, e a
  janela de coleta da viagem.
- **FR-006**: O casamento entre a rota da viagem e o modelo da gerenciadora MUST tolerar as variações
  de escrita de estação já conhecidas (acento, conteúdo entre parênteses, sigla colada a número, zero
  à esquerda).

**Vínculo**

- **FR-007**: O cadastro de veículos, carretas e motoristas MUST distinguir três vínculos: frota
  própria, agregado e terceiro. O valor "nosso" que hoje existe corresponde a frota própria.
- **FR-008**: O diálogo de atribuição MUST permitir escolher o vínculo de cada recurso envolvido, e
  MUST guardar a escolha no próprio recurso.
- **FR-009**: Para veículos e carretas, o vínculo MUST vir pré-selecionado a partir de quem é o dono
  do recurso na gerenciadora; para motoristas MUST vir em branco, porque a gerenciadora não informa
  esse dado.
- **FR-010**: Um recurso já classificado MUST NOT voltar a pedir o vínculo em atribuições seguintes.
- **FR-011**: O sistema MUST registrar de onde veio a sugestão de vínculo, para que a próxima pessoa
  possa conferir por que aquele valor foi atribuído.

**Quando não dá**

- **FR-012**: O sistema MUST NOT criar a Pré-SM quando faltar CPF do motorista, modelo da rota, ou
  vínculo de qualquer recurso envolvido.
- **FR-013**: Em cada caso de FR-012, o sistema MUST mostrar na viagem o que exatamente faltou e o
  caminho para resolver.
- **FR-014**: Quando a gerenciadora recusar a criação, o sistema MUST mostrar a mensagem devolvida
  por ela, sem substituí-la por texto nosso.
- **FR-015**: Falhas de comunicação MUST ser tentadas de novo, e a viagem MUST distinguir "ainda
  tentando" de "desistiu".

**Enxergar e desfazer**

- **FR-016**: A viagem MUST mostrar o estado atual da Pré-SM — inexistente, pendente, criada,
  recusada ou cancelada.
- **FR-017**: Quem tem permissão para atribuir MUST poder cancelar uma Pré-SM ainda não efetivada.
- **FR-018**: O sistema MUST avisar quando a atribuição da viagem mudar depois da Pré-SM criada, para
  que a divergência não passe despercebida.

**Registro**

- **FR-019**: Toda criação, recusa e cancelamento de Pré-SM MUST ficar registrado no histórico da
  viagem, com data e origem.

### Key Entities

- **Pré-SM da viagem**: o vínculo entre uma viagem do TMS e a pré-solicitação na gerenciadora.
  Guarda o código devolvido, o estado, o momento de cada transição e o motivo da última recusa.
- **Vínculo do recurso**: a classificação de veículo, carreta ou motorista em frota própria, agregado
  ou terceiro — com o registro de qual evidência sugeriu o valor.
- **Modelo de rota**: a correspondência entre uma rota nossa (origem → destino) e o modelo de Pré-SM
  cadastrado na gerenciadora.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nenhuma Pré-SM precisa ser digitada à mão para viagens que têm modelo de rota, CPF e
  vínculo — hoje são 100% digitadas.
- **SC-002**: Ao menos 80% das viagens atribuídas geram Pré-SM sem intervenção. O piso vem do que foi
  medido: 84% das viagens rodam em rota com modelo, e 81% dos motoristas têm CPF.
- **SC-003**: Zero Pré-SM duplicadas — a gerenciadora cobra por solicitação, e duplicata é escolta
  contratada em dobro.
- **SC-004**: Toda viagem que **não** gerou Pré-SM diz por quê, na própria viagem. Nenhuma falha
  silenciosa.
- **SC-005**: O tempo entre a atribuição chegar ao portal e a Pré-SM existir na gerenciadora fica
  abaixo de cinco minutos em 95% dos casos.
- **SC-006**: Quem atribui responde o vínculo no máximo uma vez por veículo e uma vez por motorista —
  não uma vez por viagem.

## Assumptions

- **Não existe ambiente de teste.** Medido em 25/08/2026: o ambiente de homologação da gerenciadora
  recusa o nosso acesso (`USUARIO INVALIDO`). Toda escrita só pode ser exercitada contra o sistema
  real, o que torna o cancelamento (FR-017) parte do caminho de validação, e não um extra.
- **Os modelos de rota são cadastrados por gente, não por nós.** Medido: 89 modelos já existem e
  cobrem 84% das viagens. Cadastrar os que faltam é trabalho de cadastro na gerenciadora, fora do
  sistema — esta fatia só precisa se comportar bem enquanto eles não existem.
- **A janela de coleta da viagem é o horário que a Pré-SM espera.** São os campos que a operação já
  usa como "ETA ORIGEM" e "CPT ORIGEM".
- **O CPF do nosso cadastro é confiável.** Medido contra a gerenciadora em duas amostras: a validade
  da CNH bate em 83 de 84, e 100% dos motoristas casaram pelo id do portal.
- **A atribuição confirmada pelo portal é o momento certo.** Antes disso os dados existem, mas a
  atribuição pode ser recusada — e uma Pré-SM de atribuição recusada é escolta contratada para
  viagem que ninguém vai fazer.
- **Divisão do cadastro existente**: os recursos hoje classificados como "de fora" precisam ser
  repartidos entre agregado e terceiro. Assume-se que isso acontece pelo uso, conforme cada recurso
  aparece numa atribuição — não por um mutirão de cadastro.

## Out of Scope

- Efetivar a Pré-SM (converter em solicitação de monitoramento).
- Alterar uma Pré-SM já criada quando a atribuição muda — nesta fatia o sistema apenas avisa.
- Cancelar a Pré-SM automaticamente quando a viagem é cancelada.
- Documentos, ajudante e faixa de temperatura na Pré-SM.
- O caminho completo de criação sem modelo de rota.
- Qualquer ação sobre SM já em andamento (cancelar, finalizar, imprimir).
- Usar a validade de CNH que a gerenciadora devolve para o problema conhecido de CNH vencida —
  candidato a fatia própria.
