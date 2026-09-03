# Feature Specification: Motoristas disponíveis

**Feature Branch**: `feat/motoristas-disponiveis`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "Quero um sistema dentro da torre de controle, vão usar dados que você já puxa, vai ser uma aba de Motoristas disponíveis, como vai funcionar: o motorista vai concluir a viagem, essa página vai ter Nome, Origem, Destino, Placa — se tiver 2, as duas placas —, Data de início da última viagem e data de conclusão e o Status Finalizado. Basicamente a lógica vai funcionar se o condutor está perto do dia do destino Hoje ou amanhã, então vai identificar os condutores em rotas que vão chegar Hoje ou amanhã, e quando tiverem chegados vai vir o Status Finalizado = Status finalizado significa condutor disponível. O motorista vai sair dessa aba quando ele entrar em uma viagem, quando ele estiver indo pra doca por exemplo."

---

## Contexto

A operação já mantém esta lista — numa planilha chamada **PROGRAMAÇÃO SHOPEE FROTA**, digitada à mão.
Ela tem, nesta ordem: NOME · ORIGEM · DESTINO · Data de início · Data de Conclusão · CAVALO ·
CARRETA · STATUS. As linhas são ordenadas pela data de início, e alguém escreve **FINALIZADO** nas
que já chegaram.

**Toda coluna dessa planilha já existe no TMS**, medido em 03/09: o nome vem do cadastro do
motorista, origem e destino das estações da viagem, as duas placas da atribuição corrente, as duas
datas das janelas planejadas de coleta e entrega, e o FINALIZADO é o status que o portal do cliente
já informa — `Completed` no portal corresponde a viagem concluída no TMS em **26 de 26 casos** de
três dias.

Ou seja: esta fatia **não busca dado novo**. Ela para de digitar à mão o que o sistema já sabe.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver quem está livre agora (Priority: P1)

Quem escala carga abre a aba e vê, de relance, os motoristas que **terminaram a viagem e ainda não
pegaram outra** — com o nome, de onde vieram, para onde foram, as placas que estão com eles e quando
aquilo começou e terminou. Cada um marcado como **FINALIZADO**, que é a palavra que a operação já usa
para dizer "está livre".

**Why this priority**: É o motivo inteiro da aba. Hoje essa resposta custa abrir a planilha, conferir
se alguém a atualizou e, na dúvida, ligar para o motorista. Sozinha, esta história já substitui a
planilha.

**Independent Test**: Abrir a aba com o dado de produção e conferir que os motoristas marcados
FINALIZADO são exatamente os que concluíram a última viagem e não têm nenhuma viagem aberta —
comparando com a planilha do dia.

**Acceptance Scenarios**:

1. **Given** um motorista cuja última viagem foi concluída ontem e que não recebeu nenhuma viagem
   desde então, **When** alguém abre a aba, **Then** ele aparece com status FINALIZADO, com os dados
   dessa última viagem.
2. **Given** um motorista com carreta engatada, **When** ele aparece na lista, **Then** as **duas**
   placas são mostradas, cavalo e carreta, cada uma identificada.
3. **Given** um motorista cuja viagem não tem carreta, **When** ele aparece na lista, **Then** o
   campo da carreta fica visivelmente vazio, e não repete a placa do cavalo.
4. **Given** um motorista que concluiu a viagem há mais de sete dias e nunca pegou outra, **When**
   alguém abre a aba, **Then** ele **não** aparece.

---

### User Story 2 - Ver quem fica livre hoje ou amanhã (Priority: P2)

Na mesma lista, quem escala vê também os motoristas que **ainda estão na estrada mas chegam hoje ou
amanhã** — com o status atual da viagem, não FINALIZADO. É a fila do que vai ficar disponível, que
permite prometer carga antes de o caminhão encostar.

**Why this priority**: É o que transforma a aba de retrato em previsão. Sem ela a lista só conta o
passado; com ela dá para planejar o dia seguinte — e é o que a operação mais usa de manhã. Vem depois
da P1 porque quem já chegou é a resposta urgente; quem vai chegar é a que dá para esperar.

**Independent Test**: Conferir que os motoristas em viagem que chega hoje ou amanhã aparecem com o
status corrente da viagem, e que nenhum deles aparece como FINALIZADO.

**Acceptance Scenarios**:

1. **Given** um motorista em viagem cuja entrega está planejada para amanhã, **When** alguém abre a
   aba, **Then** ele aparece com o status atual da viagem, claramente distinto de FINALIZADO.
2. **Given** esse mesmo motorista, **When** a viagem passa a constar como concluída, **Then** na
   leitura seguinte ele passa a FINALIZADO sem ninguém digitar nada.
3. **Given** um motorista em viagem que só chega depois de amanhã, **When** alguém abre a aba,
   **Then** ele não aparece.

---

### User Story 3 - Enxergar quem a atribuição vai recusar (Priority: P3)

O motorista que está livre mas **não pode receber carga** — porque foi bloqueado por nós ou porque o
cadastro dele não está ativo no espelho do cliente — aparece na lista **marcado como impedido**, com
o motivo.

**Why this priority**: Não é o caso comum, mas é o caso que faz perder tempo: dos 36 motoristas
finalizados de hoje e ontem, **4 não estão ativos**. Sem a marca, alguém escolhe o nome, começa a
atribuir e só descobre no fim do gesto. Esconder também não serve — aí o nome some sem explicação e
ninguém vai consertar o cadastro.

**Independent Test**: Conferir que um motorista inativo ou bloqueado aparece na lista com a marca e o
motivo, e que a marca some quando o impedimento é resolvido.

**Acceptance Scenarios**:

1. **Given** um motorista finalizado cujo cadastro não está ativo, **When** alguém abre a aba,
   **Then** ele aparece marcado como impedido, com o motivo legível.
2. **Given** um motorista finalizado bloqueado por nós, **When** alguém abre a aba, **Then** ele
   aparece marcado como impedido, com o motivo do bloqueio.
3. **Given** que o impedimento é resolvido no cadastro, **When** a lista é lida de novo, **Then** a
   marca desaparece sem nenhuma ação nesta aba.

---

### Edge Cases

- **Motorista com mais de uma viagem aberta ao mesmo tempo.** Medido: **15 motoristas** têm — nove com
  duas, três com três, três com quatro. "A última viagem" é a que **chega por último**, e é ela que a
  linha mostra. Qualquer outra escolha faz a aba descrever a viagem errada e chamar de livre quem já
  tem a próxima carga.
- **O motorista que chegou ontem.** As duas regras do pedido se contradizem ao pé da letra: "chega
  hoje ou amanhã" o esconderia, "só sai quando entrar em viagem" o manteria. São **20 motoristas** nessa
  situação agora. Decidido: **a janela decide quem entra, só viagem nova faz sair** — e o parado some
  sozinho depois de sete dias. É exceção declarada, não defeito.
- **Viagem cancelada.** Há 8 canceladas chegando amanhã e 3 hoje. O motorista está livre de fato, mas
  o status **não é FINALIZADO** — dizer o contrário afirmaria que uma carga foi entregue.
- **Viagem sem motorista atribuído.** Não produz linha nenhuma: a aba é de motoristas, não de viagens.
- **A virada do dia.** "Hoje", "amanhã" e o corte de sete dias são contados no fuso de São Paulo. Uma
  contagem em fuso universal muda de dia às 21h e faz a lista trocar de conteúdo no meio do turno da
  noite — e passa despercebida em qualquer teste feito de manhã.
- **Motorista que recebe viagem enquanto alguém olha a lista.** Ele deixa a lista sozinho na leitura
  seguinte, sem ninguém remover — é o "sai quando entra em viagem" do pedido.
- **Duas viagens do mesmo motorista chegando no mesmo instante.** O desempate precisa ser estável, para
  a linha não alternar entre uma e outra a cada leitura. Havia um caso na produção com uma concluída e
  uma cancelada na mesma hora: ganha a **concluída**, porque só ela significa carga entregue.
- **A cancelada que chega depois da viagem em andamento.** Medido em 03/09: **dois motoristas**
  apareceriam como livres estando `in_transit`, porque a última deles *pela data* era uma cancelada
  com chegada mais tarde. Viagem em andamento tem de ganhar de viagem terminada (FR-004a) — foi
  achado simulando contra a produção, não testando.

---

## Requirements *(mandatory)*

### Functional Requirements

**A lista e o que ela mostra**

- **FR-001**: O sistema MUST oferecer uma aba "Motoristas disponíveis" dentro da Torre de Controle,
  irmã de "Minha Programação".
- **FR-002**: Cada linha MUST mostrar, para um motorista: nome, estação de origem, estação de destino,
  placa do cavalo, placa da carreta, data e hora de início e data e hora de conclusão da última
  viagem, e o status dela.
- **FR-003**: Quando a viagem tem carreta, as **duas** placas MUST aparecer, identificadas
  separadamente. Quando não tem, o campo da carreta MUST ficar vazio e assinalado como vazio, nunca
  preenchido com a placa do cavalo.
- **FR-004**: A viagem descrita na linha MUST ser a **última viagem do motorista**, escolhida nesta
  ordem: **viagem em andamento ganha de viagem terminada**; entre as de mesma condição, a de
  **conclusão planejada mais distante**. Não é a mais recentemente criada, nem "a única aberta".
- **FR-004a**: Uma viagem **cancelada ou concluída MUST NOT** ser escolhida como a última quando o
  motorista tem qualquer viagem **em andamento** na varredura — mesmo que a terminada chegue depois.
  Sem isso, um motorista dirigindo aparece como livre.
- **FR-005**: O desempate entre duas viagens com a mesma data de conclusão MUST ser estável, de modo
  que leituras repetidas descrevam sempre a mesma viagem.
- **FR-006**: A lista MUST ser ordenável e MUST vir ordenada, por padrão, de forma que o disponível há
  mais tempo apareça primeiro.
- **FR-007**: A lista MUST permitir busca por nome do motorista, por estação e por placa.

**Quem entra, quem fica, quem sai**

- **FR-008**: Um motorista MUST entrar na lista quando a data de conclusão da sua última viagem cair
  **hoje ou amanhã** no fuso de São Paulo.
- **FR-009**: Um motorista cuja última viagem está concluída MUST permanecer na lista mesmo depois de
  a data de conclusão ter passado, até que receba uma viagem nova.
- **FR-010**: Um motorista concluído MUST sair da lista quando a conclusão da sua última viagem
  completar **sete dias** — contados no fuso de São Paulo.
- **FR-011**: Um motorista MUST sair da lista quando passar a ter uma viagem cuja conclusão planejada
  seja posterior a amanhã, sem nenhuma ação de quem usa a tela.
- **FR-012**: A saída e a entrada MUST ser consequência da leitura do estado, e não de um gesto — não
  existe "remover da lista".

**O status**

- **FR-013**: O status **FINALIZADO** MUST ser mostrado quando, e somente quando, a última viagem
  estiver concluída. FINALIZADO significa, para quem lê, motorista disponível.
- **FR-014**: Viagem **cancelada** MUST NOT ser mostrada como FINALIZADO; ela MUST ter rótulo próprio,
  ainda que o motorista conte como livre para efeito de aparecer na lista.
- **FR-015**: Viagens ainda em andamento MUST mostrar o status corrente, visualmente distinto de
  FINALIZADO.
- **FR-016**: O status MUST ser derivado do estado da viagem a cada leitura. O sistema MUST NOT
  guardar "disponível" ou "finalizado" em campo próprio.

**O impedimento**

- **FR-017**: Um motorista que está livre mas cujo cadastro impede a atribuição MUST aparecer na
  lista, **marcado como impedido**, com o motivo legível.
- **FR-018**: Os dois impedimentos MUST ser reconhecidos: o bloqueio feito por nós e o cadastro que
  não está ativo no espelho do cliente.
- **FR-019**: A marca MUST desaparecer sozinha quando o impedimento for resolvido no cadastro, sem
  nenhuma ação nesta aba.

**Frescor, acesso e limites**

- **FR-020**: A lista MUST se atualizar sozinha enquanto a tela estiver aberta, sem exigir recarga.
- **FR-021**: O acesso MUST exigir a mesma permissão que a Torre de Controle já exige. Nenhuma
  permissão nova MUST ser criada.
- **FR-022**: A aba MUST NOT oferecer atribuição de viagem, e MUST NOT escrever nada no portal do
  cliente.
- **FR-023**: A lista MUST mostrar quantos motoristas estão disponíveis e quantos estão a caminho, de
  modo que o total seja conferível sem contar linha por linha.
- **FR-024**: Quando não houver nenhum motorista na situação, a aba MUST dizer isso em palavras, e não
  mostrar uma tabela vazia.

### Key Entities

- **Motorista disponível**: não é registro guardado — é uma **conclusão derivada** a cada leitura, a
  partir do motorista, da sua última viagem por data de conclusão e do estado dessa viagem. Não existe
  tabela, coluna nem migração para esta fatia.
- **Última viagem do motorista**: a viagem com a **maior data de conclusão planejada** entre as
  atribuições correntes daquele motorista. É a chave da fatia inteira: é o que decide qual rota a
  linha descreve, se o motorista está livre e se ele continua na lista.
- **Impedimento**: a razão pela qual um motorista livre não pode receber carga — bloqueio nosso ou
  cadastro inativo no espelho do cliente. Já existe e é apenas exibido aqui.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Quem escala descobre quem está livre **em menos de 10 segundos** a partir da abertura da
  aba, sem abrir planilha e sem telefonar.
- **SC-002**: A planilha PROGRAMAÇÃO SHOPEE FROTA deixa de ser atualizada à mão — **zero** digitação
  de status para manter a lista correta.
- **SC-003**: A lista concorda com a realidade do portal em **100%** dos motoristas conferidos numa
  amostra de um dia: quem está FINALIZADO na tela está concluído no portal, e vice-versa.
- **SC-004**: Nenhum motorista com viagem aberta aparece como disponível — verificável sobre os **15
  motoristas** que hoje têm mais de uma viagem aberta ao mesmo tempo.
- **SC-005**: Um motorista que recebe viagem nova desaparece da lista **na leitura seguinte**, sem
  ninguém agir sobre a tela.
- **SC-006**: Um motorista que conclui a viagem passa a FINALIZADO **na leitura seguinte**, sem
  ninguém digitar.
- **SC-007**: Todo motorista mostrado como disponível ou está apto a receber carga, ou traz a marca de
  impedido com o motivo — **nenhum** aparece limpo e é recusado depois na atribuição.
- **SC-008**: A lista abre com o volume real da operação (na ordem de **130 motoristas** na janela)
  em **menos de 2 segundos**, e a atualização automática não interrompe quem está lendo ou buscando.

---

## Fora de escopo

O que esta fatia deliberadamente NÃO faz — cada um por um motivo, não por falta de tempo:

- **Atribuir viagem pela aba.** Ela responde "quem está livre"; escolher e atribuir continua na
  Expedição, onde já existe o gesto inteiro com as suas travas.
- **Sugerir motorista para uma carga.** Isso é decisão de quem escala, com informação que a aba não
  tem — combinação, histórico, conversa.
- **Prever quando o motorista fica livre além da janela planejada.** Sem posição por GPS e sem
  recálculo de rota: o que o cliente planejou é o que a aba mostra.
- **Exportar para planilha.** A aba existe para a planilha deixar de ser necessária.
- **Qualquer escrita no portal do cliente**, e qualquer mudança no robô, na importação ou na máquina
  de status.
- **Jornada, folga e descanso.** A aba fala de carga, não de tempo de direção.

---

## Assumptions

- **A janela planejada é boa o bastante para dizer quando o motorista chega.** As 772 viagens dos
  últimos 7 dias têm as duas janelas preenchidas, sem exceção. A fatia não tenta prever chegada por
  posição de GPS.
- **A conclusão vem do cliente, e é a fonte.** O TMS não decide que uma viagem terminou; ele lê. Se o
  portal atrasa, a aba atrasa junto — e isso é preferível a inventar uma conclusão nossa que
  divergiria em silêncio.
- **"Disponível" é sobre carga, não sobre jornada.** A aba não sabe de descanso, folga ou hora
  extra. Um motorista que acabou de chegar aparece como disponível mesmo que, na prática, precise
  parar — essa decisão continua sendo de quem escala.
- **O corte de sete dias é um filtro de ruído, não uma regra de negócio.** Ele existe porque 117
  motoristas estão parados há mais de 7 dias e 72 há mais de 30; sem o corte a lista viraria o
  cadastro inteiro. Mudá-lo não muda nada além do tamanho da lista.
- **Reusa o que existe**: o cadastro de motoristas, veículos e carretas; a atribuição corrente; a
  leitura de viagens do portal; a navegação da Torre de Controle; e a permissão que ela já exige.
