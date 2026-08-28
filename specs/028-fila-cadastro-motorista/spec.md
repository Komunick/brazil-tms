# Feature Specification: A fila de cadastro de motorista novo, e a leitura do documento

**Feature Branch**: `028-fila-cadastro-motorista`

**Created**: 2026-08-28

**Status**: Draft

**Input**: "Etapa 1 de `docs/PROPOSTA-CADASTRO-MOTORISTA.md` — a fila e a leitura, sem enviar nada."

**Origem**: hoje um funcionário digita à mão, na tela da gerenciadora Raster, um formulário de quatro
abas com cerca de vinte campos, **mais de 5 vezes por dia** (usuário, 28/08) — mais de 150 por mês.
Depois volta na mesma tela para saber se a auditoria aprovou.

**Referências, que esta spec NÃO repete**: `docs/PROPOSTA-CADASTRO-MOTORISTA.md` (o desenho das quatro
etapas, os números medidos e as perguntas com dono) · `docs/INTEGRA-14.2-REFERENCIA.md` (a API).

---

## O que esta fatia entrega, e o que ela ainda NÃO entrega

**Entrega**: uma fila de cadastros em preparação, alimentada pela leitura do documento, com uma tela
onde a pessoa **confere** em vez de digitar.

**Não entrega, e isto é deliberado**: nada é enviado à Raster. Nem cadastro, nem pesquisa.

**Dependência declarada**: sozinha, esta fatia **não reduz trabalho** — quem confere no TMS ainda
digitaria na tela da Raster. Ela só passa a economizar quando o envio entrar (Etapa 2). O corte foi
escolhido porque o envio é a primeira coisa que gasta dinheiro e depende de resposta da gerenciadora,
enquanto tudo aqui pode ser construído e conferido sem gastar nada.

## O que já existe e NÃO se reescreve

| Já pronto | Onde | O que esta fatia faz com isso |
|---|---|---|
| Aba Documentos do motorista, bucket privado, histórico, link curto | fatia 025, `resource_documents` | **Reusa.** O arquivo do documento entra por ali. |
| Vínculo do motorista (frota/agregado/terceiro) | `drivers.ownershipType` | **Reusa.** É o vínculo que a pesquisa exige. |
| Cadastro com nome, CPF, telefone, CNH (número, categoria, validade) | `drivers` | **Reusa.** São 6 dos campos exigidos. |
| A decisão de como ler documento com IA: no servidor, com esquema validado, preenchendo para conferência, sem nunca inventar | fatia **021**, em rascunho e **não implementada** | **Herda as decisões** e amplia o conjunto de campos. |

**Sobre a 021**: ela decidiu o approach e cobre **dois** campos (nome e validade da CNH). A pesquisa
da gerenciadora exige **quinze** vindos do documento. Esta fatia implementa aquela ideia no tamanho
que o problema pede; a 021 fica superada na parte de motorista.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conferir um cadastro lido do documento (Priority: P1)

Um funcionário recebe a foto da CNH de um motorista novo. Ele abre a fila de cadastros no TMS, cria
uma entrada, anexa o arquivo, e a leitura preenche os campos. A tela mostra **o documento de um lado
e os campos do outro**. Ele confere, corrige o que a leitura errou, completa o que falta, e a linha
passa a "pronta para envio".

**Por que é P1**: é o trabalho inteiro da fatia. Sem esta tela não há fila nem leitura.

**Teste independente**: com um arquivo de CNH legível, criar a entrada → os campos aparecem
preenchidos e marcados como lidos do documento → corrigir um campo → salvar → a linha muda de estado.

**Acceptance Scenarios**:

1. **Dado** um arquivo de CNH legível, **quando** a leitura termina, **então** os campos que o
   documento carrega aparecem preenchidos, cada um marcado com sua origem, e nada é enviado a lugar
   nenhum.
2. **Dado** um campo que a leitura não conseguiu ler, **quando** o resultado chega, **então** o campo
   fica **em branco e assinalado** — nunca preenchido por adivinhação — e a tela diz quais faltaram.
3. **Dado** um arquivo que não é um documento legível, **quando** a leitura termina sem nada
   utilizável, **então** a pessoa vê uma mensagem clara e os campos permanecem como estavam.
4. **Dado** um CPF com dígito verificador inválido, **quando** a pessoa tenta marcar como pronto,
   **então** o sistema recusa e aponta o campo.
5. **Dado** que a leitura não está configurada, **quando** a pessoa cria a entrada, **então** ela
   consegue preencher tudo à mão e a fila funciona igual.

---

### User Story 2 - O CEP completa o endereço (Priority: P1)

O endereço não está na CNH. A pessoa digita o CEP e o restante do endereço se completa, incluindo o
código do município — que a gerenciadora exige e ninguém deveria procurar em tabela.

**Por que é P1**: sem o município resolvido, o cadastro não pode ser enviado na etapa seguinte. São
**dois** municípios: o de nascimento e o de residência.

**Teste independente**: digitar um CEP válido → rua, bairro, cidade, UF e código do município
aparecem → digitar um CEP inexistente → mensagem clara, campos livres para preenchimento manual.

**Acceptance Scenarios**:

1. **Dado** um CEP válido, **quando** a pessoa sai do campo, **então** logradouro, bairro, cidade, UF
   e código do município são preenchidos e marcados como vindos do CEP.
2. **Dado** um CEP que não existe, **quando** a consulta responde, **então** a pessoa vê o aviso e
   pode preencher o endereço à mão.
3. **Dado** que a consulta de CEP está fora do ar, **quando** a pessoa digita, **então** o cadastro
   continua possível manualmente e a linha registra que o município ficou por confirmar.

---

### User Story 3 - Ver a fila e o que falta em cada um (Priority: P2)

A fila lista os cadastros em preparação. Cada linha diz **em que estado está** e, quando não está
pronta, **o que falta**, com caminho para resolver. A lista se atualiza sozinha.

**Por que é P2**: com mais de 5 por dia a fila é o que evita que um cadastro seja esquecido, mas a
tela de conferência (US1) entrega valor antes dela.

**Teste independente**: criar três entradas em estados diferentes → a lista mostra as três com os
motivos corretos → completar uma → ela muda de seção sem recarregar a página.

**Acceptance Scenarios**:

1. **Dado** um cadastro sem nome da mãe e sem celular, **quando** a fila é exibida, **então** a linha
   lista **os dois** motivos, não o primeiro.
2. **Dado** um cadastro completo, **quando** a fila é exibida, **então** ele aparece como pronto para
   envio, sem botão de envio nesta fatia.
3. **Dado** que alguém completou um cadastro em outra aba, **quando** a fila se atualiza, **então** a
   mudança aparece sem a pessoa recarregar.

---

### Edge Cases

- Duas pessoas abrem o mesmo cadastro: a segunda não deve sobrescrever silenciosamente a primeira.
- Um CPF já existente no cadastro de motoristas: a fila deve apontar o motorista existente em vez de
  criar um duplicado.
- Um arquivo grande ou de tipo não aceito: recusa clara, sem entrada meio criada.
- A leitura demora ou falha: a entrada continua existindo e pode ser preenchida à mão.
- Um documento de outra pessoa anexado por engano: como a conferência é lado a lado, o erro tem de
  ser visível — o nome lido e o nome do cadastro aparecem juntos.

## Requirements *(mandatory)*

### Functional Requirements

**A fila**

- **FR-001**: O sistema DEVE manter uma fila de cadastros de motorista em preparação, separada do
  cadastro de motoristas já ativos.
- **FR-002**: Cada linha DEVE exibir o estado do cadastro e, quando não estiver pronto, **todos** os
  motivos que faltam — não apenas o primeiro.
- **FR-003**: A fila DEVE se manter atualizada sem ação da pessoa e sem recarregar a página.
- **FR-004**: O sistema DEVE impedir a criação de uma segunda entrada para um CPF que já esteja na
  fila ou já exista como motorista, apontando a existente.

**A leitura**

- **FR-005**: A pessoa DEVE poder anexar um arquivo de documento a uma entrada da fila, reusando o
  mecanismo de documentos de recurso já existente.
- **FR-006**: O sistema DEVE extrair do documento os campos que ele carrega e preenchê-los na
  entrada.
- **FR-007**: O sistema NUNCA DEVE inventar valor: campo não lido fica vazio e assinalado.
- **FR-008**: Cada campo preenchido DEVE indicar sua origem — lido do documento, vindo do CEP, ou
  digitado por pessoa.
- **FR-009**: A leitura NUNCA DEVE gravar o cadastro sozinha; ela só propõe valores para conferência.
- **FR-010**: Quando a leitura não estiver configurada ou falhar, a fila DEVE continuar utilizável
  com preenchimento manual.

**Os campos**

- **FR-011**: O cadastro de motorista DEVE passar a guardar os campos que a gerenciadora exige e que
  hoje não existem: sexo, data de nascimento, RG e órgão emissor, nome da mãe, município de
  nascimento, número de formulário / de segurança / Renach da CNH, UF de emissão, data da primeira
  habilitação, endereço completo com município, e MOPP (possui e vencimento).
- **FR-012**: Os campos que o cadastro já possui NÃO DEVEM ser duplicados — nome, CPF, telefone,
  número, categoria e validade da CNH, e o vínculo, são reusados de onde já estão.
- **FR-013**: O CPF DEVE ter o dígito verificador conferido antes de a entrada ser marcada como
  pronta.
- **FR-014**: O sistema DEVE resolver o município a partir do CEP, preenchendo logradouro, bairro,
  cidade, UF e o código do município.
- **FR-015**: O sistema DEVE tratar município de nascimento e município de residência como campos
  distintos.

**Estado e transições**

- **FR-016**: Uma entrada DEVE ser marcável como pronta apenas quando todos os campos exigidos
  estiverem presentes e válidos.
- **FR-017**: O sistema DEVE registrar quem conferiu e quando.
- **FR-018**: Uma entrada pronta DEVE poder voltar a incompleta se alguém alterar um campo exigido.

**Limites desta fatia**

- **FR-019**: O sistema NÃO DEVE enviar nada à gerenciadora nesta fatia — nem cadastro, nem
  solicitação de pesquisa.

**Dados pessoais**

- **FR-020**: Os arquivos de documento DEVEM ficar em armazenamento privado, acessíveis apenas por
  link de curta duração e para quem tem permissão de gestão de frota.
- **FR-021**: O prazo de descarte dos arquivos DEVE ser uma decisão registrada e aplicada, não um
  padrão silencioso.

### Key Entities

- **Cadastro em preparação**: uma pessoa a caminho de virar motorista apta. Guarda os campos
  exigidos, a origem de cada um, o estado, os motivos pendentes, quem conferiu e quando. Vive
  separado do motorista ativo até estar pronto.
- **Origem do campo**: para cada campo, de onde o valor veio — documento, CEP ou pessoa. É o que
  torna a conferência rápida.
- **Documento anexado**: o arquivo em si, no acervo de documentos de recurso que já existe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Conferir um cadastro cujo documento foi lido com sucesso leva **menos de 2 minutos**,
  contra os vários minutos de digitação de vinte campos hoje.
- **SC-002**: Em documentos legíveis, pelo menos **12 dos 15 campos** que a CNH carrega chegam
  preenchidos, restando à pessoa conferir e completar o resto.
- **SC-003**: **Nenhum** campo é preenchido com valor inventado — em toda amostra de conferência, o
  que não foi lido está vazio e assinalado.
- **SC-004**: Uma pessoa que nunca viu a tela consegue concluir uma conferência sem treinamento,
  porque o documento está ao lado dos campos.
- **SC-005**: A fila comporta o volume real — mais de 5 entradas por dia — sem que nenhuma seja
  esquecida por falta de visibilidade do que falta.
- **SC-006**: Um cadastro marcado como pronto contém **todos** os campos que a etapa seguinte precisa
  para enviar, verificável sem enviar nada.

## Assumptions

- Os documentos continuam chegando pelo caminho de hoje; esta fatia não muda como o motorista os
  envia.
- A conferência humana permanece obrigatória: na etapa seguinte cada solicitação é cobrada, e um CPF
  errado gasta dinheiro pesquisando outra pessoa.
- O vínculo (frota/agregado/terceiro) já existente no cadastro de motorista é o mesmo que a
  gerenciadora exige.
- A profissão é constante para todos os motoristas e não precisa ser perguntada.
- O município resolvido pelo CEP usa o mesmo padrão de código que a gerenciadora espera.

## Pendências herdadas da proposta, que NÃO bloqueiam esta fatia

Registradas aqui para que ninguém as trate como resolvidas. Detalhe e dono em
`docs/PROPOSTA-CADASTRO-MOTORISTA.md`.

- O exame toxicológico **não existe na API** da gerenciadora — só na tela dela.
- **Não há como anexar arquivos a uma pessoa pela API**; se a pesquisa os exigir, essa parte não
  automatiza. Pergunta pendente.
- Não se sabe se criar o cadastro é cobrado ou se só a pesquisa é. Não afeta esta fatia, que não
  envia nada.

## Fora de escopo

Envio à gerenciadora · acompanhamento do resultado da auditoria · o link para o próprio motorista
preencher · renovação · veículos e carretas · o toxicológico · anexar arquivos na tela da
gerenciadora.
