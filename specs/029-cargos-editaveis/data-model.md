# Data Model: cargos editáveis, mini perfil e selos (029)

Migração `0060_cargos_e_perfil.sql`, escrita à mão, **aditiva**, renumerada só no merge. Entrada no
`meta/_journal.json` é obrigatória — sem ela a migração é pulada e o deploy responde sucesso.

---

## `cargos` — nova

| coluna | tipo | notas |
|---|---|---|
| `id` | uuid PK | |
| `nome` | text NOT NULL UNIQUE | rótulo, não chave. Renomear não muda acesso (US1, cenário 4) |
| `ativo` | boolean NOT NULL default true | desativar em vez de apagar (princípio III) |
| `criado_em` / `atualizado_em` | timestamptz NOT NULL | |

Não há coluna "é admin". Ser administrador é **ter `manage_users`**, e isso se lê da tabela abaixo —
uma segunda representação da mesma verdade divergiria.

## `cargo_permissoes` — nova

| coluna | tipo | notas |
|---|---|---|
| `cargo_id` | uuid → `cargos(id)` ON DELETE CASCADE | |
| `permissao` | text NOT NULL | uma das 23 do catálogo |

PK composta `(cargo_id, permissao)`. Índice em `(permissao)` — é por ele que a trava do último admin
pergunta (research §2).

**Uma linha por permissão, e não um array.** O porquê está em research §2: é esta forma que responde
"quantas pessoas ativas ainda alcançam `manage_users`?" com um `join` comum, dentro da transação e
sob concorrência.

Sem CHECK amarrando ao catálogo: o vocabulário vive em TypeScript e cresce a cada fatia. Quem valida
é o Zod na entrada da rota, e o cargo só oferece o que o catálogo mostra. Uma permissão gravada que o
código não reconheça simplesmente nunca é concedida por `can` — falha fechada, que é o lado certo.

## `selos` — nova

| coluna | tipo | notas |
|---|---|---|
| `id` | uuid PK | |
| `nome` | text NOT NULL UNIQUE | "Beta tester", "Líder", "Supervisor" |
| `cor` | text NOT NULL | uma da paleta fechada |
| `criado_em` | timestamptz NOT NULL | |

## `usuario_selos` — nova

| coluna | tipo | notas |
|---|---|---|
| `user_id` | uuid → `users(id)` ON DELETE CASCADE | |
| `selo_id` | uuid → `selos(id)` ON DELETE CASCADE | |
| `aplicado_por` / `aplicado_em` | uuid → `users(id)` / timestamptz | |

PK composta `(user_id, selo_id)`. **Nenhuma relação com `cargo_permissoes`.** A separação física é o
que torna FR-013 verificável: não existe caminho de `usuario_selos` até uma permissão.

## `users` — alterada, só acrescentando

| coluna | tipo | notas |
|---|---|---|
| `cargo_id` | uuid NULL → `cargos(id)` | **NULO de propósito** — ver research §5 |
| `desativado_em` | timestamptz NULL | preenchido ao desativar, **zerado ao reativar** |

### O que NÃO muda, e é o item mais importante desta tabela

`role` continua existindo, `NOT NULL`, com o índice `users_role_idx`, e o enum `app_role` intacto.

A migração roda **com o app anterior no ar** (`deploy.sh` não migra), e esse app lê `role`. Derrubar a
coluna aqui derruba a produção entre a migração e o restart. A remoção é assunto de uma fatia futura,
depois de a produção ter rodado no cargo.

`setor` segue ortogonal ao cargo, como já é ao papel — o comentário no schema explica, e nada aqui
muda isso.

## `resource_documents` — CHECK alargado

`entity_type` passa a aceitar `'user'`, ao lado de `driver | vehicle | preregistration`.

**Só a COLUNA.** `RESOURCE_DOCUMENT_ENTITY_TYPES` — a PORTA das rotas de frota — continua
`driver | vehicle`. O comentário do schema avisa o que acontece se as duas forem alargadas juntas, e
research §6 detalha.

---

## A semeadura, na mesma migração

1. Cria **8 cargos** com os nomes dos papéis de hoje.
2. Preenche `cargo_permissoes` a partir de `ROLE_PERMISSIONS` — escrito literalmente no SQL, não
   gerado em tempo de execução: a migração precisa ser lida e conferida.
3. `update users set cargo_id = (o cargo do seu role)`.

Depois: `scripts/029-conferir-acesso.ts` compara pessoa a pessoa e precisa dizer **34 de 34
idênticos** antes de qualquer código novo subir.

Os 8 cargos semeados são **ponto de partida, não estrutura** (FR-016): renomeáveis e editáveis como
qualquer outro. Quatro deles (`control_tower`, `fleet_coordinator`, `finance`, `executive_viewer`)
nascem sem ninguém dentro, e isso está certo — são o vocabulário existente, e apagá-los seria decidir
pelo admin.

`customer_viewer` **não vira cargo** (FR-017): não é papel atribuível hoje e não passa a ser.

---

## Auditoria

Tudo em `audit_logs`, que já tem `previous_value` e `new_value` em jsonb — exatamente o que FR-026
pede.

| ação | `entity_type` | previous / new |
|---|---|---|
| criar cargo | `cargo` | null / nome + permissões |
| mudar o que o cargo alcança | `cargo` | **a lista antes** / a lista depois |
| renomear | `cargo` | nome antes / nome depois |
| desativar cargo | `cargo` | ativo / inativo |
| mover pessoa de cargo | `user` | cargo antes / cargo depois |
| aplicar ou tirar selo | `user` | selos antes / selos depois |
| descartar foto aos 90 dias | `user` | referência da foto / null |

O `previous_value` da mudança de permissões guarda **a lista inteira**, não o que mudou. Guardar só a
diferença obriga quem investiga a somar todas as mudanças desde o começo para saber o que valia num
dia — e é justamente essa a pergunta que se faz depois de um incidente.

---

## Invariantes que o modelo precisa sustentar

| # | invariante | onde é garantida |
|---|---|---|
| I1 | sempre existe ≥1 pessoa ativa com `manage_users` | `ainda-tem-admin.ts`, dentro da transação, depois da escrita (research §3) |
| I2 | ninguém fica sem cargo | rota recusa apagar cargo com gente dentro sem destino; `NOT NULL` numa fatia futura |
| I3 | selo nunca concede permissão | não existe caminho de `usuario_selos` a `cargo_permissoes` |
| I4 | ninguém amplia o próprio acesso | quem edita só concede o que ele mesmo alcança (FR-012) |
| I5 | cargo sem cargo_id ⇒ conjunto vazio | `loadSession`, sem fallback (research §1) |
