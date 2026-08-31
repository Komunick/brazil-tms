# Feature Specification: Cargos editáveis, mini perfil e selos

**Feature Branch**: `029-cargos-editaveis`

**Created**: 2026-08-31

**Status**: Draft

**Input**: "cada cargo vai poder ver as áreas que o admin selecionar… essa função conseguir ser editável no TMS por um admin, sem precisar ter que mexer aqui no código… quero que coloque o nome do usuário lá em clicável, e quando apertar abrir um mini perfil… ah ter um cargo de beta tester, cargo líder, supervisor."

Referências, não duplicadas aqui: `docs/PRD.md` §18 (permissões), `specs/001-*/contracts/permission-matrix.md`, `packages/shared/src/auth/permissions.ts`.

---

## O problema, medido em produção em 31/08

Dos 34 usuários ativos:

| papel | pessoas |
|---|---|
| `admin` | **20** |
| `dispatcher` | 14 |
| `operations_manager` | 1 |
| `control_tower`, `fleet_coordinator`, `finance`, `executive_viewer` | **0** |

Não é desleixo de cadastro: é o modelo de papéis fixos falhando em uso. Quando o papel não coube, a pessoa virou admin — e hoje **20 pessoas podem apagar arquivo, exportar faturamento e mexer em usuário porque precisavam ver a Expedição**.

O catálogo tem 7 papéis atribuíveis e 23 permissões. Quem precisa de uma combinação que não existe no catálogo não tem para onde ir, porque o catálogo é código: mudar exige deploy. É essa porta que esta fatia abre.

### E o motivo que olha para a frente (usuário, 31/08)

Os 20 admins são o sintoma de hoje. A razão que dá peso à fatia é outra, e foi dita assim: **vão
entrar sistemas de OUTROS SETORES no TMS**, e com cargo editável *"vai ficar fácil separar quem pode
ver e o que pode mexer"*.

Isso muda o critério de "pronto". Não basta desfazer os 20 administradores de hoje — o desenho
precisa aguentar um setor que ainda não existe, cadastrado por quem não sabe programar, sem deploy e
sem tocar em nenhum dos 231 pontos de verificação. É por isso que o cargo escolhe **capacidades** e
não páginas (decisão 1): um setor novo traz telas novas, e telas novas trazem capacidades novas — que
aparecem sozinhas na tela de cargos, porque o catálogo é derivado e há um teste que o cobra.

**Esta spec supera o FR-008 da fatia 001** ("no DB permissions table"). Aquela decisão era de feature, não da constituição: o princípio IV exige que o **BFF** seja a única autoridade de autorização, e continua sendo — o que muda é de onde ele lê o conjunto de permissões, não quem decide.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O admin cria um cargo e escolhe o que ele vê (Priority: P1)

O admin abre a tela de cargos, cria "Despachante", e marca as áreas que esse cargo enxerga: Torre de Controle, Expedição, Minha Programação. Marca também as ações que ele pode executar dentro delas: atribuir motorista e placa, sim; cancelar viagem, não. Salva. A partir daí, quem estiver nesse cargo vê exatamente isso — no menu e no servidor.

**Why this priority**: é a fatia inteira. Sem ela nada muda, e os 20 admins continuam admin. As outras duas histórias são melhorias sobre um sistema que já funciona.

**Independent Test**: criar um cargo, pôr uma pessoa nele, entrar como ela e conferir que o menu e as rotas batem com o marcado — sem nenhum deploy no meio.

**Acceptance Scenarios**:

1. **Given** um cargo novo sem nada marcado, **When** o admin marca "Expedição" e salva, **Then** quem está nesse cargo passa a ver o item Expedição no menu e a abrir a página, e continua sem ver as demais.
2. **Given** uma pessoa no cargo "Despachante" com a tela da Expedição aberta, **When** o admin desmarca "Expedição", **Then** na próxima leitura da tela a pessoa perde o acesso — inclusive se digitar o endereço direto.
3. **Given** um cargo com "Torre de Controle" marcada e "Cancelar viagem" desmarcada, **When** alguém desse cargo chama a operação de cancelar por fora da tela, **Then** o servidor recusa.
4. **Given** o cargo é renomeado, **When** o admin salva, **Then** ninguém perde acesso: o nome é rótulo, não chave.

---

### User Story 2 - O mini perfil, aberto pelo nome (Priority: P2)

Onde aparece o nome de uma pessoa, ele é clicável. O clique abre um cartão pequeno: foto, nome, cargo e selos. Cada um troca a própria foto; **quem administra usuários** troca a de qualquer um.

("Administrador" aqui é *quem alcança administrar usuários*, e não o papel `admin`. Hoje os dois são
a mesma coisa; **é esta fatia que os separa** — depois dela, um cargo pode administrar usuários sem
se chamar admin, e é esse o ponto.)

**Why this priority**: resolve "quem é essa pessoa e o que ela pode?" sem abrir a administração de usuários — mas não muda o que ninguém consegue fazer. Entrega valor sozinha, depois da US1.

**Independent Test**: clicar num nome em qualquer lista e ver o cartão com os dados certos; trocar a própria foto e vê-la aparecer.

**Acceptance Scenarios**:

1. **Given** uma lista com nomes de usuários, **When** alguém clica num nome, **Then** abre o cartão com foto, nome, cargo e selos daquela pessoa.
2. **Given** o próprio perfil aberto, **When** a pessoa envia uma foto dentro do formato e do tamanho aceitos, **Then** a foto passa a aparecer no cartão e nas listas.
3. **Given** uma pessoa sem foto, **When** o cartão abre, **Then** aparecem as iniciais dela, e não um espaço vazio nem um ícone genérico igual para todos.
4. **Given** alguém que não administra usuários, **When** abre o perfil de outra pessoa, **Then** vê os dados e **não** consegue trocar a foto nem o cargo.

---

### User Story 3 - Os selos (Priority: P3)

O admin cria selos com nome e cor — "Beta tester", "Líder", "Supervisor" — e aplica a quem quiser. Eles aparecem no mini perfil e ao lado do nome nas listas. **Não dão acesso a nada.**

**Why this priority**: é reconhecimento e contexto, não acesso. Sai por último porque nenhuma decisão de operação depende dele.

**Independent Test**: criar um selo, aplicar a duas pessoas, ver aparecer nos dois perfis — e confirmar que o que elas conseguem fazer não mudou.

**Acceptance Scenarios**:

1. **Given** um selo "Beta tester" criado, **When** o admin o aplica a uma pessoa, **Then** ele aparece no mini perfil dela e ao lado do nome.
2. **Given** uma pessoa com dois selos, **When** o perfil abre, **Then** os dois aparecem, e o cargo continua distinguível deles.
3. **Given** qualquer selo, **When** ele é aplicado ou retirado, **Then** o conjunto de permissões da pessoa não muda em nada.

---

### Edge Cases

- **O último admin.** Precisa ser impossível ficar sem ninguém capaz de administrar: apagar o cargo que administra, retirar essa capacidade do último cargo que a tem, mover a última pessoa que a tem para outro cargo, ou desativar essa pessoa. A recusa vem do servidor, não do botão — e diz o motivo.
- **A pessoa perde acesso com a tela aberta.** A tela que ela já carregou não pode continuar funcionando: a próxima leitura precisa recusar, e ela precisa entender o que houve em vez de ver a tela quebrar.
- **O admin muda o próprio cargo.** Vale a mesma trava do último admin; e a mudança precisa valer para ela sem sair e entrar de novo.
- **Cargo apagado com gente dentro.** Ou se recusa enquanto houver alguém, ou se exige dizer para onde essas pessoas vão. Ninguém pode acabar sem cargo — quem fica sem cargo fica sem sistema.
- **Cargo sem nada marcado.** É permitido (é como todo cargo nasce), e quem estiver nele entra e não vê nada além do que é público a qualquer autenticado. A tela precisa dizer isso antes de salvar, porque parece defeito.
- **Duas abas abertas, dois admins editando o mesmo cargo.** A última gravação vence; ninguém pode perder uma marcação sem saber que perdeu.
- **Foto grande, formato estranho, arquivo que não é imagem.** Recusado com o motivo, e nada é guardado.
- **A pessoa é desativada.** A foto dela é descartada 90 dias depois (FR-024), sozinha. Reativação dentro do prazo para o relógio; o cartão de quem já foi descartado volta às iniciais, e não a um espaço quebrado.
- **Nome clicável onde o usuário não existe mais.** O nome continua legível e o cartão diz que a conta não está mais ativa, em vez de abrir vazio.

---

## Requirements *(mandatory)*

### Functional Requirements

#### O cargo e o que ele controla

- **FR-001**: O sistema MUST permitir que um administrador crie, renomeie e desative cargos pela interface, sem qualquer alteração de código ou publicação de versão.
- **FR-002**: Cada cargo MUST guardar um conjunto de capacidades escolhidas entre as que o sistema já reconhece hoje (as 23 do catálogo atual). Um cargo NÃO pode conceder capacidade que o sistema não reconheça.
- **FR-003**: A tela de edição MUST apresentar essas capacidades como **áreas, páginas e ações em português** — "Torre de Controle", "Expedição", "Cancelar viagem" —, e não com os nomes internos.
- **FR-004**: Cada pessoa MUST ter exatamente **um** cargo. Não há soma de cargos.
- **FR-005**: A autorização MUST continuar sendo decidida no servidor, nos mesmos pontos de verificação já existentes. Esta fatia troca a ORIGEM do conjunto de permissões, e NÃO cria um segundo caminho de decisão.
- **FR-006**: O menu MUST mostrar apenas os itens que o cargo alcança, e o servidor MUST recusar o acesso direto ao endereço de uma página não alcançada — esconder no menu nunca é a única defesa.
- **FR-007**: A mudança no cargo MUST valer para a pessoa sem que ela precise sair e entrar de novo.
- **FR-008**: A tela de cargos MUST mostrar quantas pessoas estão em cada cargo, antes de qualquer edição.
- **FR-009**: O sistema MUST permitir mover uma pessoa de cargo, e MUST registrar quem moveu, quando, de onde para onde.

#### O que não pode acontecer

- **FR-010**: O sistema MUST impedir, no servidor, que a organização fique sem nenhuma pessoa capaz de administrar usuários — por apagar cargo, por retirar a capacidade, por mover a última pessoa, ou por desativá-la. A recusa MUST explicar o motivo.
- **FR-011**: O sistema MUST impedir que uma pessoa fique sem cargo. Apagar um cargo com gente dentro MUST exigir destino para essas pessoas ou ser recusado.
- **FR-012**: O sistema MUST recusar que alguém amplie o próprio acesso além do que já tem — quem edita cargos só concede o que ele mesmo alcança.
- **FR-013**: Nenhum selo MUST conceder capacidade alguma, em nenhuma circunstância.

#### A migração de quem já existe

- **FR-014**: A entrada em vigor MUST preservar exatamente o acesso atual de cada uma das pessoas já cadastradas: cada papel de hoje nasce como um cargo equivalente, e cada pessoa já aponta para o seu, na mesma operação em que a mudança entra.
- **FR-015**: Nenhuma pessoa MUST perder acesso no momento da virada. Verificável antes: para cada pessoa, o conjunto de capacidades depois é idêntico ao de antes.
- **FR-016**: Os cargos semeados MUST poder ser editados e renomeados como qualquer outro — eles são ponto de partida, não estrutura fixa.
- **FR-017**: O valor reservado que não é papel atribuível (`customer_viewer`, FR-007 da fatia 001) MUST continuar não sendo oferecido como cargo.
- **FR-017a**: A conta mestre `victorti@braziltransports.com.br` (confirmada em produção em 31/08: `admin`, ativa) MUST terminar a virada com **todas as 23 capacidades**, e a conferência do FR-015 MUST nomeá-la explicitamente em vez de deixá-la se perder entre as 34.
  **Isto é um fato a conferir, e NÃO uma regra no código.** Gravar esse endereço numa verificação de autorização criaria um segundo caminho de decisão — exatamente o que o FR-005 proíbe —, e uma conta privilegiada por e-mail escrito em código é o tipo de coisa que sobrevive à pessoa que saiu da empresa. Quem protege a organização de ficar sem administrador é o FR-010, que vale para qualquer pessoa.

#### O perfil

- **FR-018**: O nome de uma pessoa MUST ser clicável onde ele aparece, e o clique MUST abrir um cartão com foto, nome, cargo e selos.
- **FR-019**: Cada pessoa MUST poder enviar e trocar a própria foto; um administrador MUST poder trocar a de qualquer pessoa.
- **FR-020**: Quem não tem foto MUST aparecer com as próprias iniciais, distinguíveis entre pessoas — nunca um mesmo ícone genérico para todos.
- **FR-021**: O sistema MUST recusar arquivo fora do formato ou do tamanho aceitos, dizendo o motivo, sem guardar nada.
- **FR-022**: A foto MUST ficar em armazenamento privado, alcançável apenas por quem está autenticado, e nunca por endereço público permanente.

#### Selos

- **FR-023**: Um administrador MUST poder criar selos (nome e cor), aplicá-los e retirá-los; uma pessoa MUST poder ter vários.

#### Rastro e privacidade

- **FR-024**: A foto de quem for desativado MUST ser descartada **90 dias** após a desativação (decidido em 31/08). O prazo é decisão de negócio declarada, não padrão silencioso: noventa dias cobrem o desligamento que volta atrás e o afastamento curto, sem transformar o armazenamento em arquivo de pessoal. Se a pessoa for reativada dentro do prazo, a foto permanece e o relógio para.
- **FR-024a**: O descarte MUST acontecer sozinho, sem depender de alguém lembrar — um prazo que precisa de gente para valer é um prazo que não vale.
- **FR-025**: Toda mudança de permissão MUST ir para o registro de auditoria: criar cargo, alterar o que um cargo alcança, mover pessoa de cargo, apagar cargo. (Princípio IV da constituição.)
- **FR-026**: O registro de auditoria de uma mudança de cargo MUST permitir reconstruir o que o cargo alcançava antes e depois — "mudou o cargo X" sozinho não responde a pergunta que se faz depois de um incidente.

### Key Entities

- **Cargo**: um nome, o conjunto de capacidades que ele concede, e se está ativo. É a única coisa que decide o que uma pessoa alcança. Pessoas apontam para ele; apagá-lo exige destino para elas.
- **Pessoa (usuário)**: ganha um cargo (exatamente um), uma foto opcional e zero ou mais selos. O que ela já tem — nome, e-mail, situação, setor da passagem de turno — não muda de significado.
- **Selo**: um nome e uma cor, aplicável a várias pessoas. **Sem nenhuma relação com acesso.**
- **Capacidade**: o vocabulário fechado que o sistema já reconhece. Não é criada pela interface — o cargo escolhe entre as que existem.
- **Foto de perfil**: arquivo privado ligado a uma pessoa, com prazo de descarte após a desativação.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O número de pessoas com acesso administrativo total cai de **20 para no máximo 3** em até 30 dias após a entrada em vigor, sem que ninguém perca o acesso de que precisa para trabalhar.
- **SC-002**: Criar um cargo novo e pôr alguém nele leva **menos de 2 minutos** e **zero publicações de versão** — hoje leva um ciclo de desenvolvimento inteiro.
- **SC-003**: Na virada, **100% das 34 pessoas** mantêm exatamente o acesso que tinham. Medido comparando o conjunto de capacidades de cada pessoa antes e depois.
- **SC-004**: É impossível, por qualquer caminho da interface ou de fora dela, deixar a organização sem quem administre — demonstrado tentando as quatro formas descritas em FR-010.
- **SC-005**: Descobrir o que uma pessoa alcança leva **um clique** a partir do nome dela, de qualquer lista onde ele apareça.
- **SC-006**: Depois de uma mudança de cargo, é possível responder "o que essa pessoa passou a alcançar, quem mudou e quando" apenas com o registro de auditoria.

---

## Assumptions

- **O catálogo de capacidades continua fechado e vivendo em código.** Criar uma capacidade nova exige código de qualquer forma, porque é o código que a verifica — não haveria como uma capacidade inventada pela tela ser respeitada por ninguém. O que passa a ser dado é a COMBINAÇÃO.
- **O provedor de autenticação não muda.** Quem a pessoa é continua vindo de onde vem hoje; esta fatia trata só do que ela alcança depois de entrar.
- **O armazenamento privado de arquivos e o histórico da fatia 025 são reaproveitados** para a foto, em vez de um lugar novo.
- **O setor da passagem de turno continua ortogonal ao cargo**, como já é hoje em relação ao papel — são perguntas diferentes e somá-las multiplicaria os cargos.
- **O recorte por frente não vira permissão.** Ele já existe, é escolha da própria pessoa, e é outro assunto.
- **A frescura da tela continua vindo de consulta periódica**, como no resto do sistema — não há aviso instantâneo quando um cargo muda.
- **Três administradores** é o alvo de SC-001 por ser o menor número que sobrevive a férias e a um desligamento sem travar a empresa.

---

## Dependências e sequência

- **US1 não depende de US2 nem de US3.** É entregável e verificável sozinha.
- **US2 depende de US1** apenas para exibir o cargo no cartão; a foto e o nome clicável funcionam antes.
- **US3 é independente das duas** e pode ser a última.
- **A fatia 028 (pré-cadastro de motorista) fica em espera** por decisão do usuário em 31/08, com a ressalva registrada de que ela tem data marcada (evento de 10/09).

## Fora de escopo

Selo que concede permissão · RLS no Postgres (segue diferida) · convite ou auto-cadastro de usuário · troca do provedor de autenticação · permissão por cliente ou por frente.
