# Feature Specification: Pré-cadastro de motorista parceiro, feito pelo próprio motorista

**Feature Branch**: `028-fila-cadastro-motorista`

**Created**: 2026-08-28 · **Reescrita**: 2026-08-29 (duas vezes — ver abaixo)

**Status**: Draft

**Prazo**: a captura precisa estar no ar **antes de 10/09/2026** — há um evento nesse dia, com mais
de 50 motoristas esperados e **ninguém do escritório presente**.

---

## Por que esta spec foi reescrita duas vezes

**Primeira versão**: uma fila interna, alimentada pelo funcionário com a foto que chegava por
WhatsApp. Estava errada quanto ao pedido.

**Segunda**: um formulário público onde o motorista se cadastra. Certa na direção, incompleta em
três pontos que a revisão do usuário fechou — o que fazer quando o CPF já existe, o vazamento de
dados por consulta de CPF, e o toxicológico como tarefa rastreada em vez de lacuna silenciosa.

**Referências, que esta spec NÃO repete**: `docs/PROPOSTA-CADASTRO-MOTORISTA.md` (a API, os números
medidos e as perguntas com dono) · `docs/INTEGRA-14.2-REFERENCIA.md`.

## O que acontece hoje

O motorista manda os documentos por WhatsApp. Um funcionário abre a tela da gerenciadora Raster e
digita à mão um formulário de quatro abas com cerca de **vinte campos**. Depois pede a pesquisa.
Depois **volta na mesma tela** para saber se a auditoria aprovou.

**Dez a quinze minutos por motorista.** Cinquenta seria mais de um dia inteiro.

## A ideia central: no evento se CAPTURA, não se completa

Os vinte campos não precisam existir no dia 10. Precisam existir **antes de a pesquisa ser pedida**,
e isso acontece depois, no escritório.

O motorista informa o mínimo que só ele sabe e fotografa os documentos. **Todo o resto é lido da
foto, depois, e conferido por gente.**

## As três situações de um CPF

O que separa esta spec de um formulário ingênuo. Num evento de captação, parte do público **já roda
para a Brazil Transports**.

| Situação | O que o sistema faz |
|---|---|
| CPF **não existe** | Novo pré-cadastro na fila |
| CPF **já está na fila** | Não duplica: anexa o envio novo ao pendente, preservando o histórico |
| CPF **é motorista ativo** | Cria uma **solicitação de atualização cadastral** ligada ao motorista existente |

Em nenhuma delas o cadastro de motoristas é alterado antes da conferência.

## O que a página pública NUNCA faz

Informar um CPF **não pode** devolver nada sobre ele. Nem nome, nem endereço, nem telefone, nem RG,
nem CNH — e **nem sequer se aquele CPF já é conhecido**.

A resposta é a mesma para os três casos acima. A distinção acontece dentro do TMS, para quem está
autenticado.

Sem isso, o formulário vira uma máquina de colher dados: digita CPF, descobre quem é motorista da
empresa. E a proteção não é só esconder os campos — é **não deixar a resposta mudar de forma**,
porque a diferença já é a informação.

## Onde cada coisa mora

Medido em 29/08: o site institucional e o TMS estão em **servidores diferentes**.

```
braziltransports.com.br       144.24.36.23    o site institucional
tms.braziltransports.com.br   170.9.14.1      o TMS
```

O botão verde **"Seja nosso Parceiro!"**, no topo da página, abre um **formulário flutuante no meio
do próprio site** — o fundo continua atrás, e o motorista não troca de página nem vê outro endereço.

**Ele hoje abre o WhatsApp e deixa de abrir** (decisão do usuário, 29/08). O formulário passa a ser
o caminho do parceiro.

**O código do site institucional está com o usuário** (29/08), então o botão e a janela flutuante são
alterados por quem já mexe neste repositório — não há dependência de outro time, o que importa com
doze dias de prazo.

**A divisão do trabalho** (decisão do usuário, 29/08): o **formulário é construído no site
institucional**; o **TMS entra como banco e como API** que recebe o envio, guarda as fotos e mantém
a fila.

Isso traz duas obrigações que não existiriam se o formulário fosse servido daqui, e as duas são
requisito:

**A validação existe nos dois lados.** O site valida para dar boa experiência; o TMS **valida tudo
de novo**, porque nada vindo de um navegador é confiável. Uma requisição feita fora do site chega
igual à feita por dentro.

**A resposta da API é o novo ponto de vazamento.** Quem recebe a resposta agora é o código do site.
Se ela distinguir "CPF novo" de "CPF já é motorista", a informação está em mãos de quem chamou — e
o vazamento volta pela porta dos fundos. A resposta é **idêntica nos três casos**, por construção,
não por disciplina de quem escreve o site.

**Sem serviço novo e sem banco novo** — os dados e as fotos vão para o banco e o armazenamento que
já existem no TMS.

## O que sobra para uma pessoa preencher — três campos, não vinte

A tela interna **não é um espelho do formulário da gerenciadora**. Se fosse, teríamos recriado o
problema num lugar novo: alguém diante de vinte campos vazios.

Contado contra a lista real de obrigatórios do método de cadastro:

| De onde vem | O quê |
|---|---|
| O motorista digitou | CPF · nome · celular · CEP · MOPP · toxicológico |
| Lido da CNH | nascimento · RG e órgão emissor · nome da mãe · naturalidade · registro · formulário · segurança · Renach · UF de emissão · categoria · validade · 1ª habilitação |
| Resolvido pelo CEP | logradouro · bairro · cidade · UF · código do município |
| Constante | profissão · filial |
| **Sobra faltando** | **sexo · número e complemento do endereço · vínculo** |

O trabalho do operador é **confirmar e completar três campos**, com o documento ao lado — não
preencher um formulário.

**Medido em 29/08**: o PDF oficial da CNH-e é imagem, não texto. Extrair dele devolve 765
caracteres, só cabeçalho e rodapé jurídico. Mesmo a via digital precisa de leitura visual — não há
atalho que dispense a foto.

## O que já existe e NÃO se reescreve

| Já pronto | Onde | O que esta fatia faz |
|---|---|---|
| Armazenamento privado e links de curta duração | fatia **025**, implementada | **Reusa** para as fotos |
| Vínculo do motorista (frota/agregado/terceiro) | `drivers.ownershipType` | **Reusa** — confirmado internamente, nunca pelo motorista |
| Nome, CPF, telefone, CNH (número, categoria, validade) | `drivers` | **Reusa** — não duplica campo |
| Leitura de documento: no servidor, esquema validado, preencher para conferência, **nunca inventar** | fatia **021**, rascunho não implementado | **Herda as decisões**, amplia de 2 para ~14 campos |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O motorista faz o pré-cadastro pelo celular (Priority: P1 — prazo 10/09)

Três etapas, mobile-first, sem login. O desenho é do site institucional; o que se pede e o que se
recusa é o que esta spec define, porque é o TMS que valida:

1. **Quem é**: nome completo, CPF, celular/WhatsApp
2. **Documentos**: CNH, comprovante de residência e o **CEP** (o motorista sabe de cor; adianta a
   conferência de cinquenta cadastros)
3. **Declarações**: possui MOPP? (validade se sim) · possui toxicológico? (validade se sim) ·
   ciência sobre a coleta e o uso dos dados

**Por que é P1**: é o que tem data. Sem isto, não há evento.

**Acceptance Scenarios**:

1. **Dado** um telefone com internet ruim, **quando** o motorista envia fotos de vários megabytes,
   **então** elas são reduzidas no próprio navegador antes de subir e o envio conclui.
2. **Dado** um CPF com dígito verificador inválido, **quando** ele avança de etapa, **então** a tela
   recusa e aponta o campo.
3. **Dado** um arquivo que não é imagem nem PDF, ou grande demais, **então** a tela recusa com uma
   frase clara.
4. **Dado** que ele marcou "possui MOPP", **então** a validade passa a ser exigida; marcando "não",
   ela não aparece. O mesmo para o toxicológico.
5. **Dado** que a rede caiu no meio, **quando** ele volta, **então** não perde o que já preencheu.
6. **Dado** o cadastro concluído, **então** a tela diz **o que acontece depois e em quanto tempo** —
   não há ninguém no estande para explicar.
7. **Dado** um envio sem a ciência sobre os dados marcada, **então** o cadastro não é aceito.

---

### User Story 2 - O mesmo CPF não vira dois cadastros, e nada vaza (Priority: P1 — prazo 10/09)

O sistema reconhece se o CPF é novo, já está na fila, ou é de um motorista ativo — e trata cada caso
de um jeito, **sem que a página pública demonstre qual foi**.

**Por que é P1**: num evento de captação parte do público já é da casa. Sem isto, a fila nasce com
duplicados e o cadastro de motoristas corre risco.

**Acceptance Scenarios**:

1. **Dado** um CPF que não existe em lugar nenhum, **então** nasce um pré-cadastro novo.
2. **Dado** um CPF que já está na fila, **então** o envio novo é **anexado ao pendente**, sem criar
   um segundo, e o histórico dos dois envios é preservado.
3. **Dado** um CPF de motorista ativo, **então** nasce uma **solicitação de atualização cadastral**
   ligada a ele — e `drivers` **não é alterado**.
4. **Dado** qualquer um dos três casos, **quando** a página pública responde, **então** a mensagem é
   **a mesma**: nada na tela, no tempo de resposta ou no endereço revela qual caso ocorreu.
5. **Dado** um CPF de motorista ativo, **quando** o formulário é preenchido, **então** nenhum dado
   anterior daquele motorista é exibido, pré-preenchido ou sugerido.

---

### User Story 3 - A fila recebe, distingue e nada se perde (Priority: P1 — prazo 10/09)

Os envios chegam numa tela do TMS, separada do cadastro de motoristas ativos.

**Acceptance Scenarios**:

1. **Dado** um envio recém-chegado, **então** ele aparece com data, hora, identificação e os
   documentos acessíveis por link de curta duração.
2. **Dado** dois tipos de entrada, **então** a fila distingue **novo cadastro** de **atualização
   cadastral**, visivelmente.
3. **Dado** que ninguém olhou durante o evento, **quando** alguém abre no dia seguinte, **então** os
   cinquenta estão lá, em ordem de chegada.
4. **Dado** um envio claramente inválido, **quando** alguém o descarta, **então** ele sai da fila e o
   descarte fica registrado com autor e data.
5. **Dado** dois operadores no mesmo cadastro, **então** o segundo não sobrescreve o primeiro em
   silêncio.

---

### User Story 4 - A leitura da CNH preenche o que o documento carrega (Priority: P2)

Nascimento, RG e órgão emissor, nome da mãe, naturalidade, número de registro, formulário,
segurança, Renach, UF de emissão, categoria, validade e primeira habilitação saem da foto.

**Por que é P2**: é o que elimina a digitação, mas não bloqueia o evento — os envios ficam guardados
esperando.

**Acceptance Scenarios**:

1. **Dado** uma CNH legível, **então** os campos que o documento carrega aparecem preenchidos.
2. **Dado** um campo que a leitura não conseguiu ler, **então** ele fica **vazio e assinalado** —
   nunca preenchido por adivinhação.
3. **Dado** que a leitura não está configurada ou falhou, **então** a fila continua utilizável com
   preenchimento manual.
4. **Dado** um documento que não é uma CNH, **então** a tela diz que não conseguiu ler e não
   preenche nada.

---

### User Story 5 - A conferência mostra de onde veio cada valor (Priority: P2)

O documento aparece **ao lado** dos campos. Cada valor indica sua origem: **lido da CNH · vindo do
CEP · digitado internamente · declarado pelo motorista · já existente no cadastro**.

**Acceptance Scenarios**:

1. **Dado** um cadastro lido, **então** cada campo mostra sua origem.
2. **Dado** uma solicitação de atualização, **então** a tela mostra **valor atual × valor proposto**,
   lado a lado, e nada é gravado sem decisão explícita.
3. **Dado** o MOPP e o toxicológico, **então** aparecem marcados como **declarados pelo motorista**,
   e não como fato conferido.
4. **Dado** um cadastro sem vínculo definido, **então** ele não pode seguir para a gerenciadora: o
   `ownershipType` é confirmado **internamente**, nunca pelo motorista.
5. **Dado** o CEP informado pelo motorista, **quando** o operador o confirma contra o comprovante,
   **então** logradouro, bairro, cidade, UF e código do município são preenchidos — número e
   complemento seguem sujeitos a conferência.

---

### User Story 6 - O envio à gerenciadora, e o que ela não aceita (Priority: P2)

Um clique cria a pessoa e pede a pesquisa. Os documentos vão junto.

**Acceptance Scenarios**:

1. **Dado** um cadastro conferido, **então** o envio cria a pessoa e solicita a pesquisa, sem
   ninguém abrir a tela da gerenciadora.
2. **Dado** um cadastro com campo exigido faltando, **então** o botão fica travado e a linha diz
   **todos** os motivos, não o primeiro.
3. **Dado** que o toxicológico foi declarado, **então** o cadastro é marcado como **ação manual
   necessária na Raster** — porque a API não tem esse campo.
4. **Dado** que alguém preencheu o toxicológico manualmente na tela da gerenciadora, **então** dá
   para registrar **quem** e **quando**, e a marca sai.
5. **Dado** uma recusa da gerenciadora, **então** a mensagem dela aparece e nada é reenviado
   sozinho.

---

### User Story 7 - O envio automático para os cadastros sem pendência (Priority: P3)

Um cadastro em que **nada falta** — CPF válido, todos os campos lidos, endereço completo, vínculo
definido, sem duplicidade — segue para a gerenciadora **sem passar pela mesa de ninguém**. O que
tiver qualquer pendência continua parando para conferência.

**Por que é P3, e não antes**: a decisão de gastar sem um par de olhos precisa de número, não de
palpite. Depois do evento haverá dado real sobre quantos cadastros chegam limpos — e é esse número
que autoriza ligar, para quais casos, e com que teto.

**Acceptance Scenarios**:

1. **Dado** um cadastro sem nenhuma pendência e o envio automático ligado, **então** ele segue
   sozinho e o registro diz que foi automático, não humano.
2. **Dado** qualquer pendência — campo faltando, CPF já existente, foto ilegível — **então** ele
   para para conferência, mesmo com o automático ligado.
3. **Dado** o envio automático desligado, **então** o comportamento é o da US6: tudo passa pela
   conferência.
4. **Dado** um teto diário de envios automáticos, **quando** ele é atingido, **então** o restante
   espera conferência em vez de continuar gastando.

---

### User Story 8 - O resultado da auditoria volta sozinho (Priority: P3)

A situação da pesquisa aparece no TMS sem ninguém abrir a tela da gerenciadora.

---

### Edge Cases

- **Link público circula.** Vão chegar testes, duplicados e fotos ilegíveis. Como nada é enviado à
  gerenciadora automaticamente, isso não gera custo — vira descarte auditável.
- **Envio em massa** de uma mesma origem precisa ser contido, sem punir um estande onde vinte
  pessoas usam o mesmo wi-fi.
- **O motorista abandona no meio.** Cadastro incompleto não polui a fila nem vira motorista.
- **Foto girada ou de cabeça para baixo** — comum em celular.
- **Motorista ativo se recadastra com CPF digitado errado**, caindo como novo. A conferência é o
  que pega; a fila precisa tornar isso visível.
- **Toxicológico declarado como válido, mas vencido na data.** É declaração, não prova.
- **O mesmo motorista envia duas vezes no evento** — a segunda anexa à primeira.

## Requirements *(mandatory)*

### A API pública que recebe o envio — P1

- **FR-001**: O TMS DEVE expor uma rota **sem exigir login** que receba o pré-cadastro e os
  documentos, chamável a partir do site institucional.
- **FR-001a**: A rota DEVE aceitar chamadas apenas da origem do site institucional.
- **FR-001b**: O TMS DEVE **revalidar no servidor** tudo o que o formulário validou no navegador —
  CPF, tipo e tamanho de arquivo, campos exigidos, consentimento. Uma requisição feita fora do
  site chega igual à feita por dentro.
- **FR-001c**: O TMS DEVE publicar o contrato da rota — campos, formatos e respostas — para que o
  formulário seja construído sem adivinhação.
- **FR-002**: A página DEVE ser utilizável em telefone, em três etapas.
- **FR-003**: A etapa 1 DEVE pedir **apenas** nome completo, CPF e celular/WhatsApp.
- **FR-004**: A etapa 2 DEVE pedir CNH, comprovante de residência e o CEP.
- **FR-005**: A etapa 3 DEVE pedir MOPP (possui e validade), toxicológico (possui e validade) e a
  **ciência sobre a coleta e o uso dos dados**, sem a qual o envio não é aceito.
- **FR-006**: A página NÃO DEVE pedir nenhum campo impresso na CNH.
- **FR-007**: As imagens DEVEM ser reduzidas no navegador antes do envio — trabalho do formulário.
  O TMS impõe o teto de tamanho e **recusa o que passar**, para que o limite valha mesmo quando a
  redução não acontecer.
- **FR-008**: O CPF DEVE ter o dígito verificador conferido antes do envio.
- **FR-009**: O sistema DEVE aceitar apenas imagem e PDF, com limite de tamanho.
- **FR-010**: Ao concluir, a tela DEVE dizer o que acontece a seguir e em quanto tempo.
- **FR-010a**: A tela DEVE oferecer um caminho de contato para quem tiver dúvida ou travar no meio.
  O botão substituído era o **WhatsApp** — um canal de duas vias — e um formulário não responde.
  Sem isso, quem tiver problema fica sem saída, e ninguém do escritório estará no evento para
  perceber.
- **FR-011**: O sistema DEVE conter envios repetidos da mesma origem, sem impedir várias pessoas na
  mesma rede.

### O que a página pública não revela — P1

- **FR-012**: A página pública NUNCA DEVE exibir, pré-preencher ou sugerir qualquer dado já
  existente de um CPF informado.
- **FR-013**: A **resposta da API** DEVE ser indistinguível entre CPF novo, CPF já na fila e CPF de
  motorista ativo — em conteúdo, em código de estado e em tempo de resposta. Quem recebe a resposta
  é o código do site institucional; se ela distinguir os casos, a informação já vazou, e nenhuma
  disciplina de quem escreve o site conserta isso depois.
- **FR-014**: A comparação entre dado atual e dado proposto DEVE existir **apenas** para usuário
  autenticado no TMS.

### As três situações de CPF — P1

- **FR-015**: CPF inexistente DEVE gerar um pré-cadastro novo.
- **FR-016**: CPF já na fila DEVE ter o envio **anexado ao pendente**, preservando o histórico dos
  envios, sem criar um segundo cadastro.
- **FR-017**: CPF de motorista ativo DEVE gerar uma **solicitação de atualização cadastral** ligada
  ao motorista existente.
- **FR-018**: O sistema NUNCA DEVE criar um segundo motorista para um CPF já cadastrado.
- **FR-019**: O sistema NUNCA DEVE alterar `drivers` antes da conferência humana.

### A fila — P1

- **FR-020**: A fila DEVE ser separada do cadastro de motoristas ativos.
- **FR-021**: A fila DEVE distinguir **novo cadastro** de **atualização cadastral**.
- **FR-022**: Cada linha DEVE mostrar data e hora, identificação, documentos e situação.
- **FR-023**: O descarte DEVE registrar autor e data.
- **FR-024**: Dois operadores NÃO DEVEM sobrescrever a conferência um do outro em silêncio.
- **FR-025**: A fila DEVE se manter atualizada sem recarregar a página.

### A leitura e a conferência — P2

- **FR-026**: O sistema DEVE extrair da CNH os campos que o documento carrega.
- **FR-027**: O sistema NUNCA DEVE inventar valor: campo não lido fica vazio e assinalado.
- **FR-028**: Cada valor DEVE indicar sua origem: lido da CNH, vindo do CEP, digitado internamente,
  **declarado pelo motorista**, ou já existente no cadastro.
- **FR-029**: A conferência DEVE mostrar o documento ao lado dos campos.
- **FR-030**: Para motorista existente, a tela DEVE mostrar valor atual × valor proposto.
- **FR-031**: O `ownershipType` DEVE ser definido ou confirmado **internamente** antes da pesquisa.
- **FR-032**: O CEP informado pelo motorista DEVE ser confirmado pelo operador contra o comprovante,
  e o sistema preenche logradouro, bairro, cidade, UF e código do município. Número e complemento
  seguem sujeitos a conferência.
- **FR-033**: Estado civil e escolaridade NÃO DEVEM ser exigidos no formulário público enquanto não
  houver necessidade operacional confirmada.

### MOPP e toxicológico

- **FR-034**: MOPP e toxicológico DEVEM ser capturados no formulário público e guardados como
  **informação declarada pelo motorista**.
- **FR-035**: Os dois DEVEM aparecer na conferência com essa origem explícita.
- **FR-036**: O sistema NÃO DEVE inventar campo nem endpoint para o toxicológico — a API da
  gerenciadora não o suporta.
- **FR-037**: Um cadastro com toxicológico declarado DEVE ser marcado como **ação manual necessária
  na Raster**.
- **FR-038**: O sistema DEVE permitir registrar **quem** preencheu o toxicológico manualmente e
  **quando**, retirando a marca.

### O envio — P2

- **FR-039**: O envio DEVE ocorrer apenas com todos os campos exigidos presentes e válidos.
- **FR-040**: O envio DEVE criar a pessoa e solicitar a pesquisa sem ninguém abrir a tela da
  gerenciadora.
- **FR-041**: Uma recusa DEVE aparecer com a mensagem da gerenciadora, sem reenvio automático.
- **FR-042**: O sistema DEVE registrar quem enviou e quando.

### Dados pessoais

- **FR-043**: As fotos DEVEM ficar em armazenamento privado, acessíveis apenas por link de curta
  duração e a quem tem permissão.
- **FR-044**: O prazo de descarte das fotos DEVE ser uma decisão registrada e aplicada.

## Key Entities

- **Pré-cadastro**: o que o motorista enviou — identificação, documentos, declarações, data e
  origem. Vive separado do motorista ativo. É **novo cadastro** ou **atualização cadastral**.
- **Envio**: cada submissão. Um pré-cadastro pode ter vários; o histórico não se perde.
- **Campo com origem**: cada valor e de onde veio — CNH, CEP, digitado, declarado, ou já existente.
- **Declaração**: MOPP e toxicológico, com validade. Informação do motorista, não fato conferido.
- **Pendência manual**: o toxicológico que precisa ser preenchido na tela da gerenciadora, com quem
  o resolveu e quando.
- **Documento anexado**: o arquivo, no acervo da fatia 025.

## Success Criteria *(mandatory)*

- **SC-001**: Um motorista conclui o pré-cadastro no celular em **menos de 2 minutos**, sem ajuda.
- **SC-002**: A página abre e fica utilizável em **menos de 3 segundos** numa conexão móvel comum.
- **SC-003**: **Nenhum** dos envios do evento se perde.
- **SC-004**: **Nenhum** dado de motorista existente é revelado pela página pública, e a resposta
  não permite descobrir se um CPF é conhecido.
- **SC-005**: **Nenhum** CPF gera dois cadastros.
- **SC-006**: Conferir um cadastro cuja leitura funcionou leva **menos de 1 minuto**, contra os 10 a
  15 de digitação hoje.
- **SC-007**: Em documentos legíveis, pelo menos **12 dos 14 campos** que a CNH carrega chegam
  preenchidos.
- **SC-008**: **Nenhum** campo é preenchido com valor inventado.
- **SC-009**: Cinquenta cadastros são conferidos e enviados em **menos de uma hora**.
- **SC-010**: **Nenhuma** solicitação é cobrada por cadastro que não passou por conferência.
- **SC-011**: **Nenhum** cadastro com toxicológico declarado é dado por concluído sem alguém ter
  registrado a ação manual.

## Assumptions

- Quem mantém o site institucional consegue acrescentar um botão e um popup que carrega conteúdo
  nosso. Se não conseguir, o caminho alternativo é o botão abrir a página do TMS diretamente — o
  formulário é o mesmo.
- O motorista tem a CNH em mãos no momento do cadastro.
- A conferência acontece **depois** do evento; ninguém do escritório estará presente.
- O vínculo já existente em `drivers` é o mesmo que a gerenciadora exige.
- A profissão é constante para todos os motoristas.
- O código do município resolvido pelo CEP é o mesmo padrão que a gerenciadora espera; quando não
  resolver, país, UF e cidade por extenso são aceitos pela API.

## Pendências, com dono

Nenhuma bloqueia as histórias P1.

- **O toxicológico bloqueia a liberação na gerenciadora?** Se bloquear, a ação manual é obrigatória
  antes de a pesquisa valer. *Gerenciadora.*
- **Criar o cadastro é cobrado, ou só a pesquisa?** *Gerenciadora.*
- **Qual o prazo de descarte das fotos?** *Usuário.*

## Fora de escopo

**Envio do toxicológico por API** (a captura e o
armazenamento estão dentro; o envio não existe) · renovação periódica de cadastro · veículos e
carretas · acompanhar o photocheck até o fim · estado civil e escolaridade · qualquer acesso do
motorista ao TMS além desta página.
