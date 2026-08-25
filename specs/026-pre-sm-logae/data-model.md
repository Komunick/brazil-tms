# Data Model — 026 Pré-SM na Logae

Uma migração `--custom`, a próxima na sequência (**0046** hoje; renumerar no merge se outra entrar
antes — armadilha conhecida do repositório).

---

## 1. `ownership_type` ganha dois valores

```sql
ALTER TYPE ownership_type ADD VALUE IF NOT EXISTS 'agregado';
ALTER TYPE ownership_type ADD VALUE IF NOT EXISTS 'terceiro';
```

**`subcontracted` FICA, dormente.** Postgres não remove valor de enum, e é ele que 1.246 veículos,
as carretas e 405 motoristas carregam hoje. Mesma técnica da 015 com o `trip_status`: o valor existe
no banco, fica **fora** do tipo TypeScript, e as colunas são fixadas ao tipo restrito via
`.$type<VinculoRecurso>()`.

Significado no código: `subcontracted` é **"ainda não classificado"**, nunca um erro. É o estado de
quem ainda não passou por uma atribuição depois desta feature.

| valor | significa | vai para a gerenciadora como |
|---|---|---|
| `owned` | frota própria | `F` |
| `agregado` | de terceiro, roda fixo para nós | `A` |
| `terceiro` | autônomo, viagem eventual | `T` |
| `subcontracted` *(dormente)* | ainda não classificado | **nada — impede a criação (FR-012)** |

> `ALTER TYPE ... ADD VALUE` não roda dentro de bloco de transação em versões mais antigas do
> Postgres. A migração precisa separar isso do resto, ou usar a forma que a versão em uso aceita —
> conferir antes de escrever o arquivo.

## 2. Os três CHECKs, reescritos

O CHECK atual, idêntico em `vehicles`, `trailers` e `drivers`:

```sql
(ownership_type = 'subcontracted' AND carrier_id IS NOT NULL)
OR (ownership_type = 'owned' AND carrier_id IS NULL)
```

**Ele impede a feature**: uma linha com `agregado` não satisfaz nenhum dos dois braços, e o banco
recusa o `update`. A migração passaria e a feature quebraria no primeiro uso.

A forma nova, que diz a mesma coisa sem enumerar:

```sql
ALTER TABLE vehicles DROP CONSTRAINT vehicles_ownership_carrier_ck;
ALTER TABLE vehicles ADD CONSTRAINT vehicles_ownership_carrier_ck CHECK (
  (ownership_type = 'owned'  AND carrier_id IS NULL)
  OR (ownership_type <> 'owned' AND carrier_id IS NOT NULL)
);
-- idem para trailers_ownership_carrier_ck e drivers_ownership_carrier_ck
```

Ler: **frota própria não tem transportadora; todo o resto tem.** É a intenção original, escrita de
um jeito que não precisa mudar quando surgir um quarto valor.

## 3. `trip_pre_sm` — o estado por viagem

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `trip_id` | uuid → `trips.id` | |
| `status` | enum novo `pre_sm_status` | ver máquina abaixo |
| `codigo` | text NULL | o código devolvido pela gerenciadora; nulo até existir |
| `cod_modelo` | integer NULL | qual modelo foi usado |
| `motivo` | text NULL | por que não deu — a mensagem **dela**, quando for recusa (FR-014) |
| `payload_enviado` | jsonb NULL | o que foi mandado, sem credencial |
| `requested_at` | timestamptz | |
| `settled_at` | timestamptz NULL | |
| `tentativas` | integer default 0 | |

**Máquina**: `pendente` → `criada` \| `recusada` \| `sem_dados`; `criada` → `cancelada`.

- `sem_dados` é o estado de FR-012 (falta CPF, modelo ou vínculo) — **separado de `recusada`**,
  porque um é problema nosso e o outro é resposta dela, e mandam a pessoa para lugares diferentes.

**O índice único, que é a garantia de R3**:

```sql
CREATE UNIQUE INDEX trip_pre_sm_viva_uk ON trip_pre_sm (trip_id)
  WHERE status IN ('pendente', 'criada');
```

**Parcial de propósito.** Se cobrisse todos os estados, uma Pré-SM cancelada travaria a viagem para
sempre — e cancelar é justamente o que se faz quando ela nasceu errada. Recusada e cancelada não
impedem uma nova tentativa; pendente e criada impedem.

`payload_enviado` guarda o corpo **sem credencial**. Sem ele, uma recusa da gerenciadora é
indepurável: não há como saber o que foi mandado.

## 4. `pre_sm_route_models` — rota → modelo

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `origem_norm` | text | nome normalizado da estação de origem |
| `destino_norm` | text | idem destino |
| `cod_modelo` | integer | o código na gerenciadora |
| `descricao` | text | como ela chama, para conferência humana |
| `confirmado_em` | timestamptz NULL | **nulo = proposto pela carga, ainda não conferido** |
| `criado_em` / `atualizado_em` | timestamptz | |

Único em `(origem_norm, destino_norm)`.

**`confirmado_em` é o ponto do desenho.** A carga *propõe*; uma pessoa *confirma*. Só linha
confirmada vale para criar Pré-SM. Sem isso, um casamento errado do normalizador viraria escolta
contratada para a rota errada — e o normalizador já errou uma vez nesta sessão.

Os nomes ficam **normalizados** (sem acento, sem parênteses, sigla separada do número, zero à
esquerda descartado) porque é assim que o casamento acontece; a `descricao` guarda o original para
quem for conferir reconhecer.

## 5. O que muda em tabelas existentes

Nada além dos três CHECKs. `trips` **não** ganha coluna: o estado da Pré-SM vive na tabela própria,
ligado por `trip_id`. Uma coluna em `trips` obrigaria a mexer na tabela mais quente do sistema para
guardar algo que nem toda viagem tem.

## 6. Auditoria

Criação, recusa e cancelamento entram no histórico da viagem (FR-019) pelo caminho que já existe —
sem tabela nova de log. Quem cancela é gente, e o cancelamento passa pelo BFF, então o ator é
conhecido; quem cria é o worker, e o ator é o mesmo do robô do portal.
