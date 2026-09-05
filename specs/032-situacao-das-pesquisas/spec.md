# Feature Specification: Situação das pesquisas da gerenciadora

**Feature Branch**: `032-situacao-das-pesquisas`

**Created**: 2026-09-05

**Status**: Draft

**Input**: pedido do usuário em 05/09/2026 — *"Preciso da identificação do status se foi concluída
ou não… será que dá pra fazer uma aba dentro do pré cadastro de Pesquisas concluídas?"*

---

## O problema, em uma frase

Hoje a situação da pesquisa de uma pessoa na gerenciadora **só existe depois que alguém aperta um
botão**, um cadastro por vez. Dos cinco pré-cadastros na fila, **dois têm conferência e três não** —
não porque falhou, mas porque ninguém apertou. No dia do evento seriam dezenas de cliques, e ninguém
teria a visão do conjunto.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ver de uma vez quem está resolvido e quem não está (Priority: P1)

Quem cuida do cadastro abre uma tela e vê, numa lista só, a situação da pesquisa de cada pessoa:
quem está **adequado ao risco** e até quando vale, quem está **aguardando** ou **em pesquisa**, quem
está **inconclusivo**, e quem **nunca foi conferido**. Sem apertar nada, e sem abrir um por um.

**Why this priority**: é o pedido, e é o que remove o trabalho manual. Sozinha ela já entrega valor:
mesmo que nada mais seja construído, a pessoa deixa de precisar abrir cinquenta telas para saber
onde está cada um.

**Independent Test**: com a fila e o cadastro atuais, abrir a tela e conferir que cada linha mostra
uma situação legível e a hora em que aquilo foi lido — comparando com a tela da gerenciadora.

**Acceptance Scenarios**:

1. **Dado** um pré-cadastro cuja pesquisa está adequada ao risco e vale até 01/03/2027, **quando** a
   pessoa abre a tela, **então** a linha mostra a situação por extenso e a validade.
2. **Dado** alguém que nunca foi conferido, **quando** a pessoa abre a tela, **então** a linha diz
   *não conferido* — e isso é visivelmente diferente de *conferido e não há pesquisa*.
3. **Dado** qualquer linha, **quando** a pessoa a lê, **então** ela vê **quando** aquele dado foi
   lido da gerenciadora.

---

### User Story 2 — O sistema conferir sozinho, sem ninguém pedir (Priority: P1)

O sistema pergunta à gerenciadora, de tempos em tempos e por conta própria, a situação de quem
ainda não está resolvido — e guarda a resposta. Quando a pessoa abre a tela, o dado já está lá.

**Why this priority**: é o que faz a História 1 valer alguma coisa. Sem isso, a tela mostraria uma
lista de "não conferido" e a pessoa continuaria apertando um por um.

**Independent Test**: deixar o sistema rodar um ciclo e verificar que os registros nunca conferidos
passaram a ter situação e hora, sem intervenção.

**Acceptance Scenarios**:

1. **Dado** um pré-cadastro nunca conferido, **quando** um ciclo roda, **então** ele passa a ter
   situação e hora de leitura.
2. **Dado** alguém cuja pesquisa está **adequada ao risco e ainda válida**, **quando** um ciclo
   roda, **então** ele **não** é perguntado de novo.
3. **Dado** alguém **aguardando pesquisa**, **quando** um ciclo roda, **então** ele **é** perguntado
   de novo, porque a situação dele ainda pode mudar.

---

### User Story 3 — Enxergar a pesquisa que está para vencer (Priority: P2)

Quem cuida do cadastro vê quais pesquisas **já venceram** ou **vencem em breve**, para providenciar
a renovação antes de a pessoa ser barrada.

**Why this priority**: é valor que só aparece com o tempo, mas é real: pesquisa vale cerca de seis
meses, e hoje ninguém no TMS enxerga o vencimento. Descobre-se quando a viagem é recusada.

**Independent Test**: com uma pesquisa cuja validade está próxima, conferir que a tela a destaca —
e que uma com validade distante não é destacada.

**Acceptance Scenarios**:

1. **Dado** uma pesquisa vencida, **quando** a pessoa abre a tela, **então** a linha aparece
   assinalada como vencida.
2. **Dado** uma pesquisa que vence dentro do prazo de aviso, **quando** a pessoa abre a tela,
   **então** a linha aparece assinalada como a vencer, com a data.

---

### Edge Cases

- **Nunca conferido ≠ conferido e sem pesquisa.** São dois estados diferentes e a tela precisa
  distingui-los: o primeiro pede uma leitura, o segundo diz que a pessoa não tem pesquisa nenhuma na
  gerenciadora — e é essa a que autoriza pedir uma.
- **A pessoa está na fila e também já é motorista.** O mesmo CPF pode aparecer nos dois lados; a
  tela não pode mostrar duas verdades sobre ele.
- **A gerenciadora pede para esperar** (limite de consumo). O ciclo respeita a espera pedida e
  continua depois; não é falha, e não pode virar uma linha de erro para quem lê.
- **A gerenciadora está fora do ar.** O que já foi lido continua à vista, com a hora que tem — a
  tela não fica vazia nem finge que o dado é de agora.
- **A pesquisa existe sob um vínculo diferente do esperado.** Perguntar por um vínculo só faz a
  gerenciadora responder "não existe" sobre uma pesquisa que existe.
- **A situação muda entre a leitura e a decisão.** Uma *em pesquisa* vira *adequada* sozinha do lado
  deles; por isso a leitura sob demanda continua existindo.
- **Alguém arquivado ou desligado.** Não deve consumir tempo do ciclo nem poluir a lista.

## Requirements *(mandatory)*

### Functional Requirements

**A tela**

- **FR-001**: O sistema MUST mostrar, numa única tela, a situação da pesquisa das pessoas em
  acompanhamento, cobrindo tanto **quem está na fila de pré-cadastro** quanto **quem já é motorista**.
- **FR-002**: A tela MUST mostrar, para cada pessoa: o nome, a situação por extenso em português, a
  validade quando houver, e **a hora em que aquele dado foi lido da gerenciadora**.
- **FR-003**: A tela MUST distinguir **não conferido** de **conferido e sem pesquisa**.
- **FR-004**: A tela MUST separar visivelmente quem está **entrando** (fila) de quem **já roda**
  (motorista), porque a pergunta que cada grupo responde é diferente.
- **FR-005**: A tela MUST permitir filtrar por situação, para que a pergunta "quem falta resolver?"
  seja respondida sem leitura linha a linha.
- **FR-006**: A tela MUST assinalar pesquisa **vencida** e **a vencer** dentro do prazo de aviso.
- **FR-007**: A tela MUST indicar quando a leitura de uma pessoa **falhou**, com o motivo, em vez de
  apresentá-la como "sem pesquisa".

**A leitura automática**

- **FR-008**: O sistema MUST perguntar à gerenciadora, por conta própria e periodicamente, a
  situação das pessoas em acompanhamento.
- **FR-009**: O sistema MUST NOT perguntar de novo sobre pesquisa **resolvida e ainda válida** —
  perguntar de novo gasta tempo sem produzir informação.
- **FR-010**: O sistema MUST perguntar de novo sobre quem está **em andamento**, **vencido**,
  **nunca conferido** ou cuja **última leitura falhou**.
- **FR-011**: O sistema MUST respeitar a espera que a gerenciadora pedir, continuando o ciclo depois
  dela, sem tratar isso como erro.
- **FR-012**: O sistema MUST guardar, junto de cada resposta, **quando** ela foi lida.
- **FR-013**: O sistema MUST registrar a falha de leitura de uma pessoa sem interromper o ciclo das
  demais.
- **FR-014**: O sistema MUST procurar a pesquisa em **todos os vínculos possíveis**, porque a
  gerenciadora responde "não existe" quando se pergunta pelo vínculo errado.

**O que não muda**

- **FR-015**: A leitura sob demanda de um cadastro individual MUST continuar existindo — a leitura
  automática preenche, ela não substitui a conferência do momento em que se vai decidir.
- **FR-016**: O sistema MUST NOT pedir pesquisa por esta tela.
- **FR-017**: O sistema MUST NOT alterar a regra que decide se uma pesquisa nova pode ser pedida.
- **FR-018**: O sistema MUST NOT apresentar um dado lido no passado como se fosse de agora.
- **FR-019**: A tela MUST exigir a mesma permissão que hoje autoriza conferir e pedir pesquisa —
  nenhuma permissão nova.

### Key Entities

- **Retrato da situação**: o que a gerenciadora respondeu sobre uma pessoa num instante — a
  situação, a validade, o tipo, o link de photocheck quando há, e **a hora da leitura**. É sempre
  substituído por inteiro: é uma fotografia, não um histórico.
- **Pessoa em acompanhamento**: quem entra na leitura automática — alguém da fila de pré-cadastro
  ainda não arquivado, ou um motorista em condição de rodar.
- **Situação**: o vocabulário da gerenciadora, já traduzido para português no sistema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Quem cuida do cadastro descobre a situação de **todas** as pessoas em acompanhamento
  **sem apertar nada**, abrindo uma tela só.
- **SC-002**: Nenhuma pessoa em acompanhamento fica sem situação por mais de um dia, exceto quando a
  gerenciadora não responde — e nesse caso a tela diz isso.
- **SC-003**: Um ciclo completo cobre as pessoas em acompanhamento em **menos de uma hora**.
- **SC-004**: Um ciclo em regime — depois do primeiro — pergunta apenas sobre quem não está
  resolvido, e o número de perguntas **diminui** conforme os casos se resolvem.
- **SC-005**: No dia do evento, conferir cinquenta pessoas recém-cadastradas não exige cinquenta
  gestos manuais.
- **SC-006**: Nenhuma pesquisa é pedida em consequência desta funcionalidade, e nenhum valor é
  gasto com a gerenciadora por causa dela.
- **SC-007**: Quem lê a tela consegue dizer, para qualquer linha, **de quando** é aquele dado.

## Assumptions

- **Quem entra na leitura automática**: a fila de pré-cadastro não arquivada, mais os motoristas em
  condição de rodar. Motorista inativo, bloqueado ou arquivado fica de fora — ele não pode ser
  escalado hoje, então a situação da pesquisa dele não tem consequência operacional, e incluí-lo
  gastaria a maior parte do tempo do ciclo com quem não usa o resultado. Medido em 05/09: 591 de
  1.549 motoristas estão em condição de rodar.
- **Ritmo do ciclo**: uma vez por dia. A situação muda em horas do lado da gerenciadora, não em
  minutos, e o valor da tela é saber "quem falta", não "mudou agora". A leitura sob demanda cobre a
  urgência.
- **Prazo de aviso de vencimento**: 30 dias. É folga suficiente para renovar sem correria, e curto
  o bastante para não transformar a lista inteira em aviso — a validade observada é de cerca de seis
  meses.
- **A tela substitui a planilha, não a tela da gerenciadora.** Ela mostra a pesquisa que decide, não
  todas as linhas que existem lá: a consulta responde uma por pessoa e vínculo, e quando existem
  pesquisa e consulta no mesmo vínculo, vemos uma. Para "posso pedir?" e "está resolvido?", basta.
- **Custo**: nada aqui gasta com a gerenciadora — as consultas usadas são leitura. Mas rodam contra
  a produção.

## Dependencies

- A leitura já existente que pergunta a situação de um CPF por vínculo, com o tratamento de espera
  que ela já tem.
- O vocabulário de situações já traduzido no sistema.
- O trabalho de fundo já existente (fila no Postgres + um processo trabalhador).

## Out of Scope

- Renovação automática de pesquisa.
- Pedir pesquisa em lote.
- Photocheck além de mostrar o link e a validade.
- Qualquer escrita na gerenciadora.
- Veículos e carretas — a pesquisa deles existe, esta fatia é de pessoas.
- Espelhar linha a linha a tela da gerenciadora.

## Clarifications

### Q1 — Onde a tela mora

O pedido foi *"uma aba dentro do pré cadastro"*, e naquele momento a tela era só sobre a fila.
Depois o escopo cresceu para incluir quem já é motorista (FR-001), e uma aba sobre 591 motoristas
dentro de "Pré-cadastros" fica no lugar errado para quem procura.

[NEEDS CLARIFICATION: a tela deve ficar como aba dentro de Pré-cadastros, como o pedido dizia, ou
como página própria ao lado dela — dado que agora cobre também quem já é motorista?]
