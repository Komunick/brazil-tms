# Feature Specification: Aceite de oferta de spot direto no cartão

**Feature Branch**: `030-aceite-de-spot`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Quero que o Spot bind que aparece na tela de todo mundo tenha a opção de
aceitar a LH ou Ignorar. Aceitar direto do card, mas com uma confirmação para não haver clique
acidental. O spot não vai sair da tela, vai ficar lá até alguém aceitar. Se aparecerem outros spots,
que apareçam também, um do lado do outro, um embaixo do outro, e não vão sumir até alguém aceitar ou
ignorar. O ignorar não vai rejeitar, só vai sair da tela. Mas que aconteça de uma forma que não
atrapalhe se alguém tiver atribuindo."

## Contexto

A oferta de spot é um **leilão com prazo curto**: o cliente abre a LH, e quem responde primeiro leva.
Hoje o aviso aparece no meio da tela de todo mundo, some sozinho em trinta segundos, e a única coisa
que dá para fazer com ele é ler. Quem quer pegar o frete precisa sair do aviso, abrir a lista de
viagens, procurar o número da LH e aceitar por lá.

Medido em produção (01/09): **onze aceites de LH vinda de oferta de spot foram disparados de zero a
três minutos depois de a oferta chegar** — exatamente a janela em que o aviso está na tela. Ou seja,
a operação já executa este fluxo à mão, todos os dias. O que falta é o botão no lugar onde a decisão
já está sendo tomada.

Esta fatia **não cria um segundo caminho de aceite**: ela liga o cartão ao caminho que já existe.

Referências, sem duplicar conteúdo: `packages/db/schema/spot-offers.ts` (o que é uma oferta),
`packages/db/schema/portal-commands.ts` (a fila de ordens para o portal),
`packages/shared/src/domain/portal-acceptance.ts` (quando cabe aceitar),
`apps/web/components/spot/oferta-de-spot.tsx` (o cartão de hoje) e
`apps/web/components/trips/dashboard/frente.tsx` — `CardsDeSpot` (o registro do dia por frente).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aceitar a oferta pelo cartão que já está na tela (Priority: P1)

Uma pessoa da operação está trabalhando no TMS quando o cartão da oferta sobe no meio da tela. Ela lê
a rota e o horário, decide que dá para pôr um caminhão ali e aperta **Aceitar** no próprio cartão. O
cartão pergunta, escrevendo o número da LH, se é para aceitar mesmo — aceite não tem volta. Ela
confirma. O cartão passa a dizer que a ordem foi enviada e continua na tela até o portal confirmar.

**Why this priority**: É o pedido, e é o que elimina o passo que hoje custa o frete — procurar a LH
numa lista enquanto o leilão corre. Sozinha, esta história já entrega o valor inteiro.

**Independent Test**: Com uma oferta cujo LH está no TMS esperando decisão, apertar Aceitar, confirmar,
e verificar que uma ordem de aceite nasceu com o autor registrado, que o cartão permanece na tela
marcado como enviado, e que ele sai quando a leitura seguinte trouxer a viagem como aceita.

**Acceptance Scenarios**:

1. **Given** um cartão de oferta na tela cuja viagem está esperando decisão, **When** a pessoa aperta
   Aceitar, **Then** o cartão mostra a confirmação com o número da LH escrito e não envia nada ainda.
2. **Given** a confirmação aberta, **When** a pessoa confirma, **Then** nasce uma ordem de aceite com
   o autor e o instante registrados, e o cartão passa ao estado "enviado, esperando o portal".
3. **Given** a confirmação aberta, **When** a pessoa volta atrás, **Then** nada é enviado e o cartão
   retorna ao estado de decisão.
4. **Given** um cartão no estado "enviado", **When** a leitura seguinte trouxer a viagem como aceita
   no portal, **Then** o cartão sai da tela de todas as pessoas e de todos os painéis.
5. **Given** um cartão no estado "enviado", **When** o portal recusar a ordem, **Then** o cartão
   mostra a recusa com o código que o portal devolveu e volta a permitir nova tentativa.
6. **Given** uma oferta cuja viagem ainda não existe no TMS, **When** o cartão é exibido, **Then** o
   botão de aceitar aparece desligado com a razão escrita, e liga sozinho quando a viagem chegar.
7. **Given** uma pessoa sem a permissão de aceitar viagem, **When** o cartão é exibido, **Then** ela
   vê a oferta e não vê o botão de aceitar.

---

### User Story 2 - Tirar da minha tela sem decidir pela equipe (Priority: P1)

A mesma pessoa vê um cartão de uma rota que não interessa a ela. Aperta **Ignorar**. O cartão sai da
tela dela. Não vai recusa nenhuma para o portal, e a oferta continua na tela dos colegas até alguém
aceitar.

**Why this priority**: Sem ela, a primeira história torna a tela inabitável — os cartões param de
sair sozinhos e ninguém consegue limpá-los. As duas juntas são o MVP; separá-las entregaria um
sistema pior que o de hoje.

**Independent Test**: Ignorar uma oferta numa sessão e verificar, noutra sessão de outra pessoa, que
o cartão continua lá; e verificar que nenhuma ordem foi enviada ao portal.

**Acceptance Scenarios**:

1. **Given** um cartão na tela, **When** a pessoa aperta Ignorar, **Then** o cartão sai da tela dela e
   nenhuma ordem é enviada ao portal.
2. **Given** uma oferta ignorada por uma pessoa, **When** outra pessoa abre o TMS, **Then** o cartão
   está na tela dela.
3. **Given** uma oferta ignorada, **When** a pessoa que ignorou recarrega a página ou entra por outro
   aparelho, **Then** o cartão continua fora da tela dela.
4. **Given** uma oferta ignorada, **When** a pessoa consulta o registro do dia, **Then** a oferta
   continua listada, assinalada como ignorada por ela, e ainda pode ser aceita.

---

### User Story 3 - Decidir a partir do registro do dia (Priority: P2)

Quem está olhando o Painel do dia vê, no cartão de spot da frente, as ofertas que chegaram. As que
ainda esperam decisão estão assinaladas, e é possível aceitar dali mesmo, com a mesma confirmação.

**Why this priority**: É o segundo lugar onde a decisão acontece — quem recolheu os cartões, ou
entrou depois, encontra ali o que ficou esperando. Depende das duas primeiras para existir, mas o
sistema funciona sem ela.

**Independent Test**: Aceitar por uma linha do Painel do dia e verificar que o cartão correspondente,
noutra aba, passa ao estado "enviado" — provando que é o mesmo estado, e não uma segunda decisão.

**Acceptance Scenarios**:

1. **Given** uma oferta esperando decisão, **When** o Painel do dia é aberto, **Then** a linha dela
   está assinalada como esperando decisão, distinta das aceitas e das não aceitas.
2. **Given** uma linha esperando decisão, **When** a pessoa aceita por ali e confirma, **Then** o
   efeito é idêntico ao de aceitar pelo cartão, incluindo o registro de quem decidiu.
3. **Given** uma oferta aceita pelo cartão, **When** o Painel do dia é atualizado, **Then** a linha
   dela reflete o mesmo estado, sem exigir ação nova.

---

### Edge Cases

- **A LH foi tomada antes do clique chegar.** É leilão, e a janela existe: o estado que o TMS conhece
  é tão fresco quanto a última leitura do portal. O portal recusa, e a recusa precisa aparecer com o
  código devolvido. Sumir em silêncio faria alguém acreditar que pegou o frete.
- **Duas pessoas aceitam a mesma oferta ao mesmo tempo.** Só uma ordem pode existir por viagem; a
  segunda encontra o caminho fechado e a tela diz que já há decisão em andamento, com quem a tomou.
- **A oferta chega antes da viagem.** Medido: aconteceu em 16 de 98 casos, e em 82 deles a viagem
  chegou em até dois minutos. O cartão existe, informa, e o botão liga sozinho.
- **A oferta nunca vira viagem no TMS.** Medido: 34 de 132. O cartão fica com o aceite indisponível
  para sempre; ignorar continua sendo possível, e é o único jeito de limpá-lo.
- **Muitas ofertas ao mesmo tempo.** Medido: 5 a 10 por dia, e há dias com várias no mesmo minuto. Os
  cartões dividem o espaço; quando não couberem, o conjunto rola sem esconder nenhum.
- **Ninguém decide por horas.** Os cartões permanecem — inclusive de madrugada, quando há gente
  trabalhando. Quem precisa da tela livre recolhe; recolher não decide nada e não remove nada.
- **A pessoa perde a permissão de aceitar entre ver o cartão e confirmar.** A decisão é recusada no
  servidor, não só no botão.
- **A mesma oferta chega duas vezes** (o monitor da VM reenvia ao ser reiniciado). Ela continua sendo
  uma só, e o estado dela não se duplica.

## Requirements *(mandatory)*

### Funcionamento do cartão

- **FR-001**: O cartão de oferta MUST permanecer na tela até que a oferta seja aceita ou ignorada.
  A saída por decurso de prazo deixa de existir.
- **FR-002**: Havendo mais de uma oferta esperando decisão, todas MUST estar visíveis ao mesmo tempo,
  dividindo o espaço lado a lado e em linhas sucessivas, sem que nenhuma seja escondida por outra.
- **FR-003**: A área ocupada pelos cartões MUST permitir que o restante da tela continue legível e
  operável — quem está atribuindo uma viagem não pode ser interrompido, perder o foco do teclado nem
  ficar impedido de clicar no que está atrás.
- **FR-004**: O cartão MUST oferecer um modo recolhido que reduz o conjunto a um indicador com a
  contagem do que espera decisão, e MUST permitir voltar ao modo aberto. Recolher NÃO decide nada e
  NÃO remove oferta alguma da lista.
- **FR-005**: NÃO MUST existir um gesto que tire o cartão da tela sem deixar registro. Aceitar deixa
  a ordem e a autoria; ignorar deixa a dispensa daquela pessoa; recolher não tira o cartão da lista,
  só o encolhe, e a contagem continua à vista. Um "fechar" que apaga o cartão sem nenhum dos três
  NÃO MUST existir — é ele que hoje faz a oferta passar batido.

### Aceitar

- **FR-006**: O cartão MUST oferecer aceitar a LH sem que a pessoa precise sair dele.
- **FR-007**: O aceite MUST exigir dois gestos: o primeiro abre uma confirmação que escreve o número
  da LH e avisa que o aceite não tem volta; só o segundo envia. Um clique isolado não aceita nada.
- **FR-008**: A confirmação MUST poder ser desfeita antes do segundo gesto, sem efeito nenhum.
- **FR-009**: O aceite MUST usar o mesmo caminho de decisão que a tela de viagem já usa, com a mesma
  verificação de cabimento e a mesma auditoria de quem decidiu, quando e sobre qual viagem. NÃO MUST
  ser criado um segundo caminho de aceite.
- **FR-010**: Enquanto a viagem correspondente não existir no TMS, o aceite MUST estar indisponível,
  com a razão escrita no cartão, e MUST ficar disponível assim que ela existir, sem ação da pessoa.
- **FR-011**: O aceite MUST ser oferecido apenas a quem já tem permissão para aceitar viagem. Sem
  ela, a oferta continua visível e o aceite não aparece — e a recusa MUST valer no servidor, não só
  no botão.
- **FR-012**: Havendo decisão em andamento para a mesma viagem, o cartão MUST dizer isso e não MUST
  permitir uma segunda ordem.

### O que faz o cartão sair

- **FR-013**: Ordem enviada com sucesso NÃO MUST bastar para tirar o cartão da tela. Ele MUST
  permanecer, assinalado como enviado e com quem decidiu, até a confirmação do portal.
- **FR-014**: O cartão MUST sair da tela de todas as pessoas, e de todos os painéis, quando a leitura
  do portal trouxer a viagem como aceita — e por nenhum outro motivo.
- **FR-015**: Recusado o aceite pelo portal, o cartão MUST mostrar a recusa com o código devolvido e
  MUST voltar a permitir nova tentativa ou o descarte pela pessoa. A recusa NÃO MUST fazer o cartão
  sair sozinho.

### Ignorar

- **FR-016**: Ignorar MUST tirar o cartão apenas da tela de quem ignorou. NÃO MUST enviar recusa nem
  qualquer outra ordem ao portal.
- **FR-017**: A oferta ignorada por uma pessoa MUST continuar visível para as demais até que alguém
  a aceite.
- **FR-018**: O ignorar MUST sobreviver a recarregar a página, trocar de aparelho e reiniciar a
  sessão — não é memória da aba.
- **FR-019**: Ignorar NÃO MUST apagar a oferta do registro do dia. Ela MUST continuar listada,
  assinalada como ignorada por aquela pessoa, e MUST continuar podendo ser aceita.

### O registro do dia

- **FR-020**: O registro de ofertas por frente MUST distinguir três situações na mesma lista: aceita,
  não aceita e esperando decisão.
- **FR-021**: As ofertas que esperam decisão MUST poder ser aceitas a partir do registro do dia, com
  a mesma confirmação de dois gestos e o mesmo registro de autoria.
- **FR-022**: A decisão tomada no cartão e a tomada no registro do dia MUST ser a MESMA — tomada num
  lugar, ela aparece no outro sem ação adicional.
- **FR-023**: O resumo do registro MUST informar quantas ofertas ainda esperam decisão.

### Memória e auditoria

- **FR-024**: O estado de cada oferta — decidida, esperando, ignorada por quem — MUST ser guardado
  fora do navegador, para que "aceita" valha para todos e "ignorada" valha por pessoa.
- **FR-025**: Toda decisão de aceite MUST registrar quem decidiu, quando, e a partir de onde foi
  tomada, para que o registro sirva de prova depois.
- **FR-026**: Nenhuma oferta MUST ser apagada ao ser decidida ou ignorada — ela deixa a tela, e
  permanece no registro.

### Key Entities

- **Oferta de spot**: o convite a dar lance que o monitor do portal detecta e entrega ao TMS. Já
  existe, e esta fatia não muda como ela nasce. Ganha um estado de decisão.
- **Decisão sobre a oferta**: o que aconteceu com aquela oferta — nada ainda, aceite enviado, aceite
  confirmado pelo portal, aceite recusado pelo portal. É compartilhada: vale para todas as pessoas.
- **Dispensa pessoal**: o registro de que uma pessoa tirou aquela oferta da própria tela. É por
  pessoa e por oferta, e não influencia a de ninguém.
- **Ordem para o portal**: a decisão de aceitar, encaminhada ao portal pelo caminho que já existe.
  Esta fatia não altera a forma dela; apenas passa a criá-la a partir da oferta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa consegue aceitar uma oferta de spot **sem sair da tela em que está** e sem
  procurar o número da LH em lista nenhuma — em no máximo dois gestos a partir do cartão.
- **SC-002**: Nenhuma oferta desaparece da tela sem que alguém tenha decidido sobre ela: em uma
  jornada de observação, o número de ofertas que saíram da tela é igual ao número de ofertas aceitas
  mais o de ignoradas por aquela pessoa.
- **SC-003**: Uma oferta aceita por uma pessoa deixa de aparecer para todas as demais em até um
  minuto após o portal confirmar, e não antes disso.
- **SC-004**: Uma oferta ignorada por uma pessoa continua visível para as demais em 100% dos casos.
- **SC-005**: Nenhum aceite ocorre com um único gesto — toda ordem enviada teve uma confirmação
  explícita registrada antes dela.
- **SC-006**: Com cinco ofertas simultâneas na tela, todas as cinco permanecem legíveis e o restante
  da tela continua operável — é possível preencher e enviar uma atribuição sem recolher os cartões.
- **SC-007**: Toda recusa do portal é visível para quem decidiu, com o código devolvido, e nenhuma
  ordem recusada é apresentada como sucesso.
- **SC-008**: O registro do dia continua listando 100% das ofertas recebidas, incluindo as ignoradas.

## Assumptions

- **A permissão reutilizada é a de aceitar viagem.** Não nasce permissão nova nesta fatia: quem já
  pode aceitar pela tela de viagem passa a poder aceitar pelo cartão. Foi decidido assim porque é a
  mesma decisão, sobre a mesma viagem, com a mesma consequência.
- **O painel de parede se comporta como qualquer outra tela.** A pergunta foi feita ao usuário —
  se o cartão deveria sair sozinho na TV durante a madrugada — e a resposta foi que há gente
  trabalhando de madrugada e que se aceita de madrugada. Logo, nenhuma exceção.
- **A detecção da oferta não muda.** Continua vindo do monitor que roda na VM do portal, pelo mesmo
  caminho de entrada. Esta fatia consome o que já chega.
- **O vínculo entre oferta e viagem é o número da LH.** Medido: casa em 98 de 132 ofertas.
- **A confirmação do portal chega pela leitura periódica que já existe**, e é ela que decide a saída
  do cartão. Nenhuma leitura nova é criada para isso.
- **A oferta que nunca vira viagem permanece sem aceite disponível.** Não se inventa viagem para
  poder aceitar.
- **Som e notificação do sistema continuam como estão.** Esta fatia mexe no que o cartão permite
  fazer, não em como ele chama atenção.

## Fora de escopo

- Rejeitar a oferta pelo cartão. Ignorar não é rejeitar, e rejeitar exige um motivo do vocabulário do
  portal — é outra decisão, com outra tela.
- Atribuir motorista e placa pelo cartão. Vem depois do aceite e já tem lugar próprio.
- Mudar a regra de quais rotas viram oferta, ou qualquer coisa no monitor que roda na VM.
- Alterar o som, a notificação do sistema ou o aviso no Telegram.
- Aceite automático, por regra ou por preferência. Toda decisão continua sendo de gente.
