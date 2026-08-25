# Data Model — 027 aba GR

Uma tabela nasce, uma muda de forma, três continuam como estão.

---

## 1. `pre_sm_city_links` — a ponte de estação para cidade *(nova)*

A correspondência entre uma estação nossa e a cidade no cadastro da gerenciadora. **A carga propõe;
uma pessoa confirma; só confirmada vale.**

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `estacao_norm` | text NOT NULL | a estação normalizada — a mesma chave que a busca usa |
| `uf` | text NOT NULL | extraída do nome da estação |
| `cidade_nome` | text NOT NULL | extraída do nome da estação |
| `cod_ibge` | integer NOT NULL | o código no cadastro da gerenciadora |
| `descricao` | text NOT NULL | como **ela** escreve: `"BETIM / MG"` |
| `confirmado_em` | timestamptz NULL | **nulo = não vale ainda** |
| `criado_em` / `atualizado_em` | timestamptz | |

**Único** em `estacao_norm`: uma estação tem uma cidade.

### Por que `descricao` existe

É o que a pessoa compara na tela. Sem ela, confirmar seria aprovar um número — e o casamento por
nome, quando erra, **erra apontando para outra cidade**, não em branco. Uma Pré-SM com a cidade
errada é escolta contratada para um trajeto que o caminhão não vai fazer.

### Por que `uf` e `cidade_nome` ficam guardados

Não são derivados na hora de propósito: são a **prova** de como a proposta foi feita. Quando alguém
estranhar uma correspondência, a pergunta é "de onde saiu isso?", e a resposta precisa estar na
linha — não numa reexecução do normalizador, que pode ter mudado desde então.

---

## 2. `pre_sm_route_models` — muda de forma

Passa a apontar para a **rota** da gerenciadora, não para um modelo de Pré-SM.

| coluna | antes | depois |
|---|---|---|
| `cod_modelo` | integer NOT NULL | **`cod_rota`** integer NOT NULL |
| `descricao` | descrição do modelo | descrição da rota, como o `getRotas` devolve |

O resto — `origem_norm`, `destino_norm`, `confirmado_em`, o único composto — fica igual.

**Sem migração de dado**: as duas tabelas estão vazias em todo lugar (conferido em 25/08) e a
migração `0046` nunca chegou à produção. Ver R1 em `research.md`.

O nome da tabela vira `pre_sm_route_links`, para casar com a irmã e não mentir sobre o conteúdo.

---

## 3. `trip_pre_sm` — não muda

A tabela da 026 serve inteira. Estados: `pendente` · `criada` · `recusada` · `sem_dados` ·
`cancelada` · `nao_tentada`.

O índice único parcial (`WHERE status IN ('pendente','criada')`) continua sendo a garantia de **uma
Pré-SM ativa por viagem** — inclusive contra dois cliques simultâneos no botão da aba (FR-008).

`payload_enviado` passa a guardar o corpo do `setPreSM` em vez do corpo do modelo. É `jsonb`: não
muda de forma.

### O que muda no significado de um estado

`nao_tentada` deixa de ser só "a integração estava desligada" e passa a incluir "a pessoa ainda não
apertou". São a mesma coisa do ponto de vista da viagem — estava tudo pronto e ninguém pediu — e
distingui-las criaria um estado que a tela não sabe explicar.

---

## 4. `drivers` / `vehicles` / `trailers` — não mudam

O `ownership_type` com `owned` · `agregado` · `terceiro` (migrações `0046` e `0047`) é exatamente o
que o `setPreSM` pede nos campos `Vinc*`. Nada a fazer.

`subcontracted` continua dormente significando **"ainda não classificado"** — 1.246 veículos e 405
motoristas estão assim, e a classificação acontece pelo uso, no diálogo de atribuição.

---

## 5. A leitura da fila — sem tabela nova

A aba GR é uma **consulta**, não uma tabela. Ela cruza o que já existe:

```
viagens atribuídas (trip_assignments.is_current)
  ← as placas e o motorista da ordem do portal
  ← o vínculo de cada recurso
  ← a correspondência de cidade da origem e do destino   (confirmada)
  ← a correspondência de rota                            (confirmada)
  ← o estado da Pré-SM, quando existe
```

**Não guardar "está pronta para enviar"** é decisão, não esquecimento. Essa resposta muda quando
alguém preenche um CPF, classifica um vínculo ou confirma uma correspondência — nenhum desses
eventos passa pela viagem. Uma coluna guardada ficaria velha no instante seguinte e precisaria de
alguém para recalculá-la, e esse alguém não existe.

É o mesmo raciocínio do aviso de divergência na 026, e pela mesma razão.

---

## Migração

Uma só, e ela faz três coisas:

1. renomeia `pre_sm_route_models` → `pre_sm_route_links` e `cod_modelo` → `cod_rota`
2. cria `pre_sm_city_links`
3. deixa `trip_pre_sm` e os enums intactos

**Renumerar no merge, nunca antes** — a numeração é do momento em que entra no `dev`.

O `drizzle-kit generate` **não serve neste repositório**: o journal tem 49 entradas e só 27
snapshots, então ele diffa contra o snapshot `0024` e recria tabelas de produção. A migração é
escrita à mão. Isso já mordeu na 026.
