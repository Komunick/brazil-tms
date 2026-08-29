# Data Model — pré-cadastro de motorista parceiro

Duas tabelas novas. Nenhuma alteração em `drivers` na etapa 1.

## Por que duas, e não uma

A spec exige preservar o histórico quando o mesmo CPF envia de novo (FR-016), e o princípio III da
constituição diz que histórico operacional é imutável.

Numa linha só, o segundo envio sobrescreveria o primeiro — e a pergunta "o que ele mandou da
primeira vez?" ficaria sem resposta. É a mesma separação que já existe entre `portal_commands`, que
é o pedido, e `trips`, que é o fato.

```
driver_preregistrations          um por CPF em andamento — o estado de trabalho
  └── driver_preregistration_submissions   um por envio — imutável
```

---

## `driver_preregistrations`

O pré-cadastro em andamento. **Um por CPF**, enquanto não for concluído ou arquivado.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `cpf` | text | só dígitos, normalizado. **Índice único parcial** entre os não arquivados |
| `tipo` | enum | `novo` \| `atualizacao` — ver a regra abaixo |
| `driver_id` | uuid null | preenchido quando `tipo = atualizacao`. FK para `drivers` |
| `status` | enum | `recebido` · `em_conferencia` · `pronto` · `enviado` · `arquivado` |
| `campos` | jsonb | os valores consolidados **com a origem de cada um** — ver adiante |
| `pendencia_toxicologico` | boolean | ação manual na tela da gerenciadora |
| `toxicologico_resolvido_por` | uuid null | quem preencheu à mão |
| `toxicologico_resolvido_em` | timestamptz null | |
| `arquivado_em` / `arquivado_por` / `arquivado_motivo` | | o descarte **marca, não apaga** |
| `conferido_por` / `conferido_em` | | |
| `enviado_por` / `enviado_em` | | |
| `created_at` / `updated_at` | timestamptz | |

### A regra do `tipo`, decidida no recebimento

| CPF | `tipo` | `driver_id` |
|---|---|---|
| não existe em lugar nenhum | `novo` | nulo |
| já tem pré-cadastro aberto | *não cria linha* — anexa o envio ao existente | — |
| é motorista ativo | `atualizacao` | o id dele |

**`drivers` não é tocado em nenhum dos três.** Ele só muda depois da conferência, e por decisão
explícita de uma pessoa.

### O índice único parcial

```sql
CREATE UNIQUE INDEX ON driver_preregistrations (cpf) WHERE arquivado_em IS NULL;
```

Parcial porque um CPF arquivado pode voltar — alguém descartou por engano, ou a pessoa se
recadastra meses depois. O que não pode é **dois abertos ao mesmo tempo**, e é isso que o índice
impede, no banco, sem depender de a aplicação lembrar.

## `driver_preregistration_submissions`

Cada envio. **Nunca alterado depois de escrito.**

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `preregistration_id` | uuid | FK |
| `recebido_em` | timestamptz | |
| `origem_hash` | text | **hash** da origem, nunca o IP — ver abaixo |
| `dados` | jsonb | o que chegou nesse envio, exatamente como chegou |
| `documento_cnh_id` | uuid | FK para `resource_documents` (fatia 025) |
| `documento_comprovante_id` | uuid | FK para `resource_documents` |

### Por que hash, e não o IP

Para conter repetição basta saber que é **a mesma** origem. Saber **qual** é dado pessoal que não
precisamos guardar — e que, guardado, vira responsabilidade sem contrapartida.

### Por que `dados` guarda o que chegou, e não o normalizado

O normalizado vive no pré-cadastro. Aqui fica o **cru**, para responder "o que ele mandou?" mesmo
depois de alguém corrigir na conferência. É o mesmo motivo pelo qual `portal_commands.response`
guarda o corpo do portal sem tradução — e ontem essa decisão foi o que permitiu achar um defeito.

---

## O `campos` e a origem

Cada chave é um campo; cada valor carrega o dado e de onde ele veio.

```json
{
  "nome":        { "valor": "MARCOS ANTONIO DA SILVA", "origem": "cnh" },
  "cpf":         { "valor": "12345678900",             "origem": "digitado" },
  "nomeMae":     { "valor": "MARIA APARECIDA",         "origem": "cnh" },
  "bairro":      { "valor": "CONCORDIA",               "origem": "cep" },
  "possuiMopp":  { "valor": "sim",                     "origem": "declarado" },
  "numero":      { "valor": null,                      "origem": null }
}
```

**As cinco origens**: `cnh` · `cep` · `digitado` · `declarado` · `existente`.

`declarado` é o que o motorista afirmou e ninguém conferiu — MOPP e toxicológico. Ele **não** é a
mesma coisa que `digitado`, que é alguém do escritório preenchendo com o documento à vista. Misturar
os dois faria a conferência tratar uma afirmação sem prova como fato verificado.

`valor: null` com `origem: null` é o campo que a leitura **não conseguiu ler**. Ele existe na
estrutura de propósito: some se fosse omitido, e a tela precisa saber que ele foi tentado e falhou —
nunca inventar.

### Por que `jsonb`

**Contra uma coluna por campo**: seriam ~40 colunas mais ~40 de origem. A etapa 3 acrescenta catorze
de uma vez, e cada acréscimo exigiria migração — num repositório onde migração é escrita à mão.

**Contra uma tabela campo/valor/origem**: o objeto é sempre lido inteiro, junto com a linha. A
tabela pagaria um `join` e uma agregação em toda leitura, para flexibilidade que ninguém pediu.

**O risco do `jsonb` é perder a garantia de forma**, e a mitigação é a mesma que o repositório já usa
em `customerFields` e `operational_fields`: um esquema Zod em `packages/shared` define a forma, e
nada escreve sem passar por ele.

---

## O que NÃO muda nesta fatia

`drivers` continua como está. Os campos novos que a gerenciadora exige — sexo, nome da mãe,
naturalidade, Renach, formulário, segurança — vivem no `campos` do pré-cadastro **até a conferência
decidir promovê-los**.

Promover é assunto da etapa 4, e aí sim `drivers` ganha colunas. Fazer isso agora seria acrescentar
quinze colunas a uma tabela de produção para dados que ainda não existem.
