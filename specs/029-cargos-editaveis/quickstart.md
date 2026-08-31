# Quickstart: verificar a 029 sem quebrar produção

Nada aqui custa dinheiro. As três primeiras etapas **não mudam nada para ninguém** e podem ser feitas
com o sistema em uso.

---

## 1. Antes de qualquer coisa: o retrato de hoje

O número que justifica a fatia, e a linha de base do SC-003:

```bash
docker exec brazil-tms-supabase-db-1 psql -U postgres -t -A -F'|' \
  -c "select role, count(*) from public.users where status='active' group by 1 order by 2 desc"
```

Esperado hoje: `admin|20`, `dispatcher|14`, `operations_manager|1`.

Guarde essa saída. É contra ela que a virada é conferida.

---

## 2. Migrar à mão, com o app anterior no ar

O `deploy.sh` **não** aplica migração (`docs/OPERACAO.md`). A `0060` é aditiva e convive com o código
que ainda lê `users.role`.

```bash
cd /opt/brazil-tms
git fetch origin +refs/heads/dev:refs/remotes/origin/dev
git checkout origin/dev -- packages/db/migrations
PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH pnpm --filter @brazil-tms/db db:migrate
git checkout HEAD -- packages/db/migrations
```

**Confira a tabela, nunca a mensagem.** O `drizzle-kit` responde "migrations applied successfully"
mesmo sem ter feito nada — aconteceu duas vezes, por motivos diferentes:

```sql
select to_regclass('public.cargos'), to_regclass('public.cargo_permissoes');
```

Duas respostas não nulas, ou a migração não subiu.

---

## 3. A prova de que ninguém perde acesso

**Este é o passo que não pode ser pulado.** Leitura pura, nada muda:

```bash
pnpm --filter @brazil-tms/db db:conferir-acesso
```

Saída esperada:

```
34 pessoas · 34 idênticas · 0 divergentes
```

**E confira a conta mestre pelo nome** (FR-017a). Ela é a que precisa continuar alcançando tudo, e um
relatório de 34 linhas idênticas esconde bem uma linha específica:

```sql
select u.email, c.nome as cargo, count(cp.permissao) as capacidades
  from users u
  join cargos c on c.id = u.cargo_id
  left join cargo_permissoes cp on cp.cargo_id = c.id
 where u.email = 'victorti@braziltransports.com.br'
 group by 1, 2;
```

Esperado: o cargo semeado a partir de `admin`, com **23 capacidades** — o catálogo inteiro.

Qualquer número diferente de zero significa que a semeadura está errada — e **nada precisa ser
desfeito**, porque o app novo ainda não subiu e `users.role` continua sendo quem manda. Conserte a
semeadura e rode de novo.

---

## 4. Publicar, e conferir que a leitura mudou de lugar

Depois do deploy, a pergunta é se o servidor está lendo o cargo ou ainda o papel. O jeito de saber
sem adivinhar: **mover uma pessoa de cargo e ver o efeito sem ela sair e entrar.**

1. mova alguém para um cargo com menos coisa;
2. peça para essa pessoa **recarregar** (não sair);
3. o menu tem de encolher na hora.

Se ela precisar sair e entrar, a sessão está lendo de outro lugar que não o banco — e isso é defeito.

---

## 5. Os quatro caminhos do último admin

Cada um tem de ser recusado, **com motivo em português**:

| # | tentativa | esperado |
|---|---|---|
| 1 | desativar o cargo que administra | `422 ULTIMO_ADMIN` |
| 2 | tirar "administrar usuários" do último cargo que a tem | `422 ULTIMO_ADMIN` |
| 3 | mover a última pessoa que administra para outro cargo | `422 ULTIMO_ADMIN` |
| 4 | desativar essa pessoa | `422 ULTIMO_ADMIN` |

E o quinto, que não dá para fazer por dois cliques: **duas abas ao mesmo tempo**, cada uma rebaixando
um administrador diferente. Uma passa, a outra é recusada. É a corrida que a verificação depois da
escrita existe para resolver (research §3) — e é o único caso onde uma validação "antes" passaria nas
duas e deixaria a organização com zero.

---

## 6. Os selos não dão acesso

```sql
-- tem de devolver zero linhas, sempre
select 1 from usuario_selos us join cargo_permissoes cp on true limit 0;
```

Na prática: aplique um selo a alguém e confira que o conjunto de permissões dela não mudou. FR-013 é
verificável por construção — não existe caminho de `usuario_selos` até uma permissão —, mas convém
ver acontecendo uma vez.

---

## 7. A foto e o prazo

- envie uma foto no próprio perfil → aparece no cartão e nas listas
- envie um arquivo grande, e um que não seja imagem → recusa com o motivo, e **nada** fica no bucket
- alguém sem foto → **iniciais**, e não um ícone genérico igual para todos

O descarte aos 90 dias não dá para esperar acontecendo. Verifique o agendamento:

```sql
select name, cron from pgboss.schedule where name like 'perfil%';
```

E force uma vez, contra uma pessoa desativada com `desativado_em` antigo, num ambiente que não seja
produção.

---

## O que NÃO fazer

- **Não** remover `users.role` nesta fatia. Entre a migração e o restart, quem responde é o app
  anterior, e ele lê a coluna.
- **Não** pôr `cargo_id` como `NOT NULL` agora. O app anterior cria usuário sem saber preencher.
- **Não** deixar `can` cair no papel antigo quando o cargo faltar. Sem cargo, o conjunto é vazio e a
  tela diz isso — um fallback esconderia justamente o defeito que mais importa.
- **Não** rodar `drizzle-kit generate`. Ele diffa contra um snapshot antigo e recria tabelas de
  produção.
- **Não** esquecer a entrada no `meta/_journal.json`. Sem ela a migração é pulada e o deploy diz
  sucesso.
- **Não** alargar `RESOURCE_DOCUMENT_ENTITY_TYPES` junto com o CHECK da coluna. O CHECK passa a
  aceitar `user`; a PORTA das rotas de frota continua `driver|vehicle`. Alargar as duas faria a rota
  de frota procurar o pai em `drivers`/`vehicles` e não achar — o comentário no schema avisa.
- **Não** espalhar a trava do último admin pelas quatro rotas. Uma função, um ponto de chamada,
  **dentro da transação e depois da escrita** — verificar antes perde a corrida de duas abas.
- **Não** semear oito cargos. São **sete**: `customer_viewer` está no enum do banco e não está em
  `ROLE_PERMISSIONS`, e criá-lo violaria o FR-017.
