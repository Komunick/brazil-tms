# Research: cargos editáveis, mini perfil e selos (029)

As oito decisões que o plano precisava tomar, cada uma com o que foi medido, o que foi escolhido, e
**qual alternativa foi recusada e por quê**.

---

## R1 — De onde `can()` passa a ler, sem tocar nos 281 pontos

### O que foi medido

O número "281" do enunciado misturava duas coisas. Contado de novo, separando:

| | |
|---|---|
| `requirePermission(ctx, chave)` | **169** |
| `can(papel, chave)` direto | **62** |
| total | 231 |

E `require-auth.ts` mostra que `requirePermission` **já é um ponto de estrangulamento**:

```ts
export function requirePermission(ctx: AuthContext, key: PermissionKey): void {
  if (!can(ctx.role, key)) throw new Forbidden();
}
```

Os 62 diretos estão quase todos em `page.tsx`, decidindo o que a TELA mostra
(`podeAtribuir={can(role, "assign_resources")}`).

Medido também em `session.ts`: `loadSession` faz `select ... from users where id = ?` **a cada
requisição**, embrulhado no `cache()` do React (que vale só dentro de uma requisição). O papel NÃO
vem de um token assinado.

### Decisão

- `SessionUser` e `AuthContext` passam a carregar `permissoes: ReadonlySet<PermissionKey>`,
  resolvidas **no mesmo `select`**, por `join` com `cargo_permissoes`. Sem consulta a mais.
- `can` muda de `can(papel, chave)` para `can(principal, chave)`, onde `principal` é qualquer coisa
  com `permissoes`.
- `requirePermission` passa a chamar `can(ctx, chave)` — os **169 não são tocados**.
- Os **62 são tocados**, e é proposital: a troca de assinatura faz o compilador apontar cada um.
- **`ROLE_PERMISSIONS` sai do caminho de execução** e passa a existir só como semente da migração.

### FR-007 sai de graça

Como a sessão lê o banco a cada requisição, mudar o cargo de alguém vale na requisição seguinte. Não
há token para invalidar nem sessão para derrubar. Se o papel viesse do JWT, esta fatia teria de
inventar invalidação de sessão — e não tem.

### Alternativa recusada: fallback para o papel antigo

Deixar `can` cair em `ROLE_PERMISSIONS[papel]` quando o cargo não for encontrado.

**Recusada porque esconde exatamente o defeito que mais importa.** Se o `join` do cargo quebrar, tudo
continuaria funcionando e ninguém saberia que a autorização voltou a ser a de código — até alguém
editar um cargo e nada acontecer. É o mesmo formato de defeito de `programacao_prefs`, que respondeu
`200` por um dia inteiro sem gravar nada.

Sem cargo, o conjunto é **vazio**. A pessoa entra, não vê nada, e a tela diz "sem cargo definido".
Barulhento e correto.

### Alternativa recusada: manter as duas assinaturas

`can(papel, …)` e `canDoContexto(ctx, …)` convivendo.

**Recusada por FR-005.** Duas funções são dois caminhos de autorização, e o antigo continuaria
compilando para sempre — quem escrevesse a próxima tela poderia usar o errado sem nenhum aviso.

---

## R2 — A forma da tabela

### Decisão: duas tabelas, uma linha por permissão

```
cargos(id, nome, ativo, criado_em, atualizado_em)
cargo_permissoes(cargo_id, permissao)     -- PK composta
```

### Por que não jsonb nem array

A pergunta que a trava do último admin faz, e que ela faz DENTRO de uma transação, sob concorrência:

> quantas pessoas ATIVAS ainda alcançam `manage_users`?

Com a tabela de ligação:

```sql
select count(*) from users u
  join cargo_permissoes cp on cp.cargo_id = u.cargo_id
 where cp.permissao = 'manage_users' and u.status = 'active';
```

Índice comum, plano previsível, e trava de linha funcionando como em qualquer outro `join`. Com
`jsonb` ou `text[]` a mesma pergunta vira varredura de contenção e pede índice GIN — mais máquina
para responder pior.

**KISS não é "menos tabelas", é menos coisa para entender.** Uma linha por permissão é o modelo
relacional na forma mais direta; o array economizaria uma tabela e cobraria em toda consulta.

### Alternativa recusada: `jsonb` numa coluna de `cargos`

Recusada pela consulta acima. Registrada porque é a escolha óbvia à primeira vista, e porque este
repositório já usa `jsonb` para preferência de tela — onde ele está certo, porque ninguém pergunta
"quem tem tal preferência".

---

## R3 — Onde mora a trava do último admin

### Decisão: uma função pura + um ponto de chamada + verificação DEPOIS da escrita

```
packages/shared/src/auth/cargo-invariantes.ts   ← pura, sem banco, sob teste
packages/db/src/cargos/ainda-tem-admin.ts       ← a consulta, um lugar só
```

Os quatro caminhos do FR-010 (apagar cargo, tirar a permissão, mover a última pessoa, desativá-la)
**não fazem quatro validações**. Cada mutação, dentro da sua transação:

1. escreve o que foi pedido;
2. **recontar** quantas pessoas ativas ainda alcançam `manage_users`;
3. se for zero, desfaz a transação e devolve o motivo em português.

### Por que verificar DEPOIS da escrita, e não antes

Verificar antes tem uma corrida real: dois administradores, em duas abas, rebaixando um ao outro ao
mesmo tempo. Cada transação lê "ainda há 2", cada uma escreve, e a organização acaba com zero. Contar
DEPOIS, dentro da mesma transação, faz o banco resolver: a segunda transação vê o efeito da primeira
e é desfeita.

É o padrão *escreve e confere*, e vale a pena dizer por que ele parece errado: gravar para depois
desfazer soa desperdício. Só que a alternativa não é mais barata — é errada sob concorrência, e essa
concorrência é de duas pessoas clicando ao mesmo tempo, não de mil requisições por segundo.

### Alternativa recusada: trigger no banco

Um `constraint trigger` seria a única defesa contra um `UPDATE` feito à mão no `psql`.

**Recusada por dois motivos.** Ele não consegue devolver a frase que a tela precisa mostrar, e um
segundo lugar com a regra é precisamente o que este item veio evitar. Fica **registrado como o que se
perde**: um administrador com acesso ao banco consegue se trancar para fora. Aceito — quem tem `psql`
de produção consegue muito pior.

---

## R4 — Como PROVAR que ninguém perde acesso

### Decisão: `scripts/029-conferir-acesso.ts`, leitura pura

Para cada uma das 34 pessoas, monta dois conjuntos e compara:

| origem | de onde vem |
|---|---|
| **antes** | `ROLE_PERMISSIONS[users.role]` — o catálogo em código |
| **depois** | `users.cargo_id → cargo_permissoes` — as tabelas novas |

Saída: uma linha por pessoa com diferença, e um total. **O esperado é zero diferenças.**

Roda contra produção em leitura, não custa nada, e roda **antes** de qualquer código novo subir — a
migração é aditiva, então dá para semear, conferir e só então publicar. Se der diferença, a semeadura
está errada e nada precisa ser desfeito, porque nada mudou ainda.

Isto é o SC-003 na forma executável. "Ninguém perde acesso" deixa de ser promessa.

---

## R5 — A ordem de entrada em vigor, com o app anterior no ar

### O que a operação impõe

`docs/OPERACAO.md`: **o `deploy.sh` NÃO aplica migração.** Migra-se à mão, e nesse momento quem está
respondendo é o código ANTERIOR.

### Decisão: `users.role` FICA

Esta fatia **não remove** `users.role`, **não mexe** no enum `app_role` e **não derruba** o índice
`users_role_idx`. A coluna continua `NOT NULL`, escrita como hoje.

Sequência:

1. migração aditiva + semeadura (app anterior no ar, lendo `role` — segue funcionando)
2. `029-conferir-acesso.ts` → 34 de 34 idênticos
3. publica o app novo, que lê o cargo
4. `role` fica parado, sem ninguém ler, até uma fatia futura removê-lo

### `cargo_id` nasce NULO, e isso é deliberado

Pô-lo `NOT NULL` na mesma migração criaria uma janela mortal: entre a migração e o restart, o app
ANTERIOR ainda cria usuário — e ele não sabe preencher `cargo_id`. O `insert` falharia e o cadastro
de usuário quebraria em produção.

Então: nulo agora, a aplicação garante que todo mundo tem cargo, e o `NOT NULL` entra numa migração
posterior, com o app novo já no ar. **Quem estiver com cargo nulo tem conjunto de permissões vazio** —
não cai no papel antigo (R1).

### Alternativa recusada: uma migração só, com `NOT NULL` e remoção de `role`

Recusada pela janela acima. Ela é curta — minutos — e é exatamente o tipo de janela que só aparece no
dia em que alguém cadastra um usuário durante o deploy.

---

## R6 — Onde a foto mora

### Decisão: `resource_documents` com `entityType = 'user'`, e **porta própria**

A fatia 025 já entregou bucket privado, histórico e link de curta duração. Reaproveitar é certo.

O comentário no schema avisa da armadilha, e ele é seguido à risca:

- **A COLUNA** (`resource_documents_entity_type_ck`) passa a aceitar `user`.
- **A PORTA** (`RESOURCE_DOCUMENT_ENTITY_TYPES`, o vocabulário das rotas de frota) **continua sendo
  `driver | vehicle`**. Alargá-la faria a rota de frota aceitar `user` e cair em
  `assertResourceDocumentParent`, que procura o pai em `drivers`/`vehicles` — e não acharia nada.
- A foto entra por **rota própria** (`/api/me/foto` e `/api/users/[id]/foto`), com a sua própria
  verificação de dono: a pessoa troca a dela; quem administra usuários troca a de qualquer um.

`assertResourceDocumentParent` ganha o ramo de `user` procurando em `users`. Ele hoje testa
`archivedAt`; `users` não tem essa coluna, e o equivalente é `status = 'disabled'` — desativado não
recebe foto nova.

`docType = 'foto_perfil'`; a foto atual é a mais recente. O histórico vem junto de graça, e responde
"quem trocou a foto de quem" sem trabalho a mais.

### Alternativa recusada: tabela própria de avatar

Recusada pelo princípio I. Seria uma segunda máquina de arquivo privado — upload, link temporário,
limpeza — para fazer o que a existente já faz.

---

## R7 — Quem apaga a foto aos 90 dias

### Decisão: job agendado no worker que já existe

`workers/jobs/perfil/limpar-fotos.ts`, registrado com `boss.schedule` — o mesmo mecanismo de outros
seis jobs (`sla.sweep`, `document-checks`, `posicoes`, `coordenadas`, `portal-withdrawn`, `turno`).

- **Uma vez por dia** é a frequência certa: o prazo é de 90 dias, e um job de 5 em 5 minutos gastaria
  288 execuções por dia para responder uma pergunta que muda uma vez por trimestre. Cron configurável
  por ambiente, como os outros.
- Alvo: `users.status = 'disabled'` **e** `desativado_em < agora - 90 dias`.
- Apaga o objeto no bucket **e** a linha em `resource_documents`. Objeto sem linha vira lixo que
  ninguém encontra; linha sem objeto vira cartão quebrado.
- Registra o descarte em auditoria: é a única exclusão real desta fatia, e o princípio III pede rastro.

### A reativação para o relógio, sem código para isso

`desativado_em` é preenchido ao desativar e **zerado ao reativar**. Como o job filtra por ele, quem
volta some do alvo naturalmente. Nenhuma regra especial, nenhum "cancelar agendamento".

### Alternativa recusada: agendar o descarte no ato da desativação

Um job com 90 dias de atraso, criado na hora.

**Recusada** porque ele precisaria ser cancelado na reativação — e um cancelamento esquecido apaga a
foto de alguém que voltou a trabalhar. A varredura diária não tem estado para esquecer.

---

## R8 — Como a tela traduz permissão em "área e página"

### O que já existe

`apps/web/lib/nav.ts`: 30 itens, cada um já com `permission?: PermissionKey`, em 6 grupos
(`operacao` 10, `cadastros` 11, `faturamento` 3, `sistema` 3, `analise` 2, `importacao` 2).

O problema: as 23 permissões incluem **ações que não são página** — `cancel_trip`, `delete_archive`,
`export_billing`, `resolve_dispute`. E várias páginas compartilham a mesma permissão
(`view_all_trips` aparece em vários itens).

### Decisão: um catálogo derivado, e um teste que impede o envelhecimento

`packages/shared/src/auth/catalogo-de-acesso.ts` monta a tela em duas partes:

1. **Áreas e páginas** — derivadas do `nav.ts`, agrupadas pelo `grupo` que ele já declara. Nada é
   redigitado; se um item de menu mudar de permissão, a tela de cargos acompanha sozinha.
2. **Ações** — as permissões que nenhum item de menu reivindica. Estas têm rótulo próprio, escrito à
   mão, porque não existe página de onde tirá-lo.

### O que impede o segundo catálogo de envelhecer

**Um teste afirma que toda `PermissionKey` aparece em exatamente um lugar da tela** — como página ou
como ação. Uma permissão nova **derruba a CI** até alguém a colocar.

É o mesmo formato do `migrations-journal.test.ts`: o defeito é uma AUSÊNCIA, ausência não tem tipo, e
a única forma de cobrá-la é um teste que conta.

Sem ele, o desfecho é conhecido e silencioso: a permissão nova existe, o servidor a verifica, nenhum
cargo consegue concedê-la, e a tela onde ela é usada fica inalcançável para todo mundo que não seja
administrador — sem erro em lugar nenhum.

### Alternativa recusada: cadastrar as áreas numa tabela

Áreas viriam do banco, editáveis.

**Recusada.** Editar a lista de áreas não é o pedido — o pedido é escolher entre elas. E uma lista de
páginas no banco pode divergir das páginas que existem de verdade, sem nada avisar.
