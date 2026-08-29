# Research — pré-cadastro de motorista parceiro

O que foi medido e decidido antes do plano. Nada aqui é suposição: cada item diz como foi apurado.

## R1 · O site e o TMS estão em servidores diferentes

**Medido em 29/08**, por resolução de nome:

```
braziltransports.com.br       144.24.36.23    HTTP 200
tms.braziltransports.com.br   170.9.14.1      HTTP 307
```

**Consequência**: o formulário no site chama o TMS por rede, atravessando origem. Não é uma chamada
interna, e por isso a origem permitida e a revalidação no servidor deixam de ser cuidado extra e
viram requisito.

## R2 · O manual da gerenciadora foi relido do PDF, e a leitura anterior estava incompleta

Até 29/08 a referência do repositório vinha de uma conversão HTML do manual. Ela **perde conteúdo**:
53 métodos contra **62** extraídos do PDF com `pdftotext -layout` (o arquivo é ISO-8859; precisa de
`iconv`).

**Duas afirmações anteriores caíram:**

**"Não há como anexar arquivo a uma pessoa pela API."** Falso. O `setMotorista` tem um bloco
`Documentos` — `Descricao`, `Extensao` (PDF, XLSX, XLS, DOC, DOCX, PNG, JPEG, JPG) e `Documento` em
Base64. As fotos vão junto do cadastro.

**"O código IBGE é obrigatório e trava sem a ponte de cidades."** Falso. Existem
`PaisEndereco`/`UFEndereco`/`CidadeEndereco` e os equivalentes de naturalidade, *"necessário informar
na ausência do código ibge"*. O IBGE é otimização, não bloqueio.

**Uma foi reconfirmada na fonte limpa**: o toxicológico **não existe** no manual. `toxicolog`,
`toxico`, `exame`, `ASO` e `atestado` dão zero ocorrências, enquanto `MOPP` aparece nas três linhas
esperadas — o controle prova que a busca funciona.

**A lição de método**: a ausência de algo numa extração não prova a ausência no original. As duas
afirmações erradas vieram de concluir a partir de um "não achei".

## R3 · A CNH-e oficial é imagem, não texto

**Medido em 29/08** sobre o PDF da CNH digital: `pdftotext` devolve **765 caracteres** — só o
cabeçalho do órgão e o rodapé sobre assinatura digital. O corpo do documento é imagem.

**Consequência**: não existe atalho de "extrair o texto do PDF oficial". Mesmo a via digital exige
leitura visual, igual à foto. Isso confirma a etapa 3 como leitura por modelo, e não por parser.

## R4 · O que sobra para uma pessoa preencher

Contado campo a campo contra a lista de obrigatórios do `setMotorista`:

| Origem | Quantidade |
|---|---|
| O motorista digita | 6 |
| Lido da CNH | 13 |
| Resolvido pelo CEP | 5 |
| Constante (profissão, filial) | 2 |
| **Falta** | **sexo · número e complemento do endereço · vínculo** |

**Consequência**: a tela interna é uma **conferência**, não um espelho do formulário da gerenciadora.
Três campos, não vinte. Se fosse um espelho, o problema teria mudado de lugar em vez de acabar.

## R5 · Os valores constantes, medidos contra a produção

Leitura, sem custo, em 28/08:

```
getTabela(FILIAIS)      uma linha: 9332 = 03571231000143-BRAZIL TRANSPORTS LTDA
getTabela(PROFISSOES)   30 = MOTORISTA
```

Existe **uma** filial. Não há ambiguidade a resolver, e os dois valores entram como configuração.

`getCliente` não serve: exige CNPJ e responde `CodErro 109 — O CADASTRO NAO EXISTE` para o nosso.
Ele consulta os *clientes* da transportadora, não a própria empresa.

## R6 · As bibliotecas do P1 já estão instaladas

Medido no `package.json` em 29/08: `zod`, `react-hook-form`, `@hookform/resolvers` e
`@radix-ui/react-dialog`. **O P1 sai sem dependência nova.**

**Validar CPF**: escrito em `packages/shared`, não instalado. São ~20 linhas de conta fixa, sob
teste — e como o formulário vive em **outro repositório**, uma dependência aqui não seria
compartilhada com ele de qualquer jeito. Os dois lados precisam da própria cópia.

**CEP**: `fetch` no ViaCEP, que devolve o código IBGE no campo `ibge`. Sem biblioteca.

**Ler a CNH**: `@anthropic-ai/sdk`, única dependência nova, e escolhida pela fatia 021 em julho.
Entra na etapa 3.

## R7 · Conter envios sem Redis

A constituição proíbe Redis e qualquer broker externo. A contagem sai da própria tabela de envios,
que já tem a hora.

**Dois limites, porque os riscos são diferentes**: apertado por CPF, porque ninguém se cadastra dez
vezes por engano; folgado por origem, porque vinte pessoas num estande dividem o mesmo wi-fi. Um
limite só erraria dos dois lados — ou deixa passar o abuso, ou derruba o evento.

**A origem é guardada como hash.** Conter repetição exige saber que é *a mesma* origem, não *qual*
ela é.

## R8 · O vazamento pela forma da resposta

A revisão do usuário fechou o vazamento de **dados** — a página não devolve nome, endereço nem
telefone ao receber um CPF.

Faltava o segundo furo: **a forma da resposta também é informação.** Responder "atualização
registrada" para uns e "cadastro criado" para outros confirma que aquele CPF é motorista da empresa,
sem exibir um único campo.

**Consequência**: a resposta é idêntica nos três casos, e um teste afirma isso byte a byte. Sem o
teste, a primeira pessoa que acrescentar uma mensagem útil reabre o furo sem perceber — e ninguém
vai notar, porque nada quebra.
