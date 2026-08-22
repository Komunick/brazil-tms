# Operação — como o TMS roda em produção

O que existe, onde roda, e o que fazer quando para. Escrito depois da promoção para produção de
2026-08-18, com as armadilhas que ela revelou.

Para o produto, veja `PRD.md`; para as decisões técnicas, `STACK.md`; para branches e PRs,
`DELIVERY-WORKFLOW.md`. Este arquivo é sobre a máquina ligada.

---

## 1. Por onde o dado entra

O TMS não digita nada: três fontes alimentam, e todas são **somente leitura** do lado do cliente.

```
VM Linux (Chrome dedicado)                          VM Windows (Chrome dedicado)
├── robô do portal ──┐                              └── monitor de ofertas ──┐
└── robô do BSC ─────┤                                                       │
                     ▼                                                       ▼
        POST /api/imports/portal-feed                   POST /api/imports/spot-offer
        POST /api/imports/bsc                                    │
                     │                                           │
                     ▼                                           ▼
                   TMS  ──> Postgres <── worker (pg-boss: SLA, documentos, retiradas)
```

| fonte | onde roda | ritmo | o que traz |
|---|---|---|---|
| robô do portal | VM Linux | plano 15 min · em curso 5 min · execução 5 min | viagens, marcos, preço, motorista |
| robô do BSC | VM Linux | acorda de hora em hora, lê **uma vez por publicação** | nota e 20 indicadores, em 3 recortes |
| monitor de ofertas | VM Windows | 30 s | leilões de spot nas rotas de interesse |

O monitor de ofertas **não é deste repositório** — ele existia antes, avisando no Telegram, e ganhou
o TMS como segundo destino. O TMS não redetecta oferta nenhuma: recebe o que ele já decidiu enviar.

Os robôs precisam da **aba aberta**, não da aba na frente — desde que o Chromium suba com as travas
de segundo plano (seção 6). Aba fechada é robô parado.

---

## 2. Onde as coisas rodam

Tudo na mesma VM (Oracle, `ubuntu@arm07`), em dois deploys independentes:

| | produção | dev |
|---|---|---|
| pasta | `/opt/brazil-tms` | `/home/ubuntu/komunick/repos/brazil-tms` |
| endereço | `tms.braziltransports.com.br` | `tmsdev.braziltransports.com.br` |
| web | porta 3000 | porta 3100 |
| Postgres | contêiner `brazil-tms-supabase-db-1` | `brazil-tms-dev-supabase-db-1` |
| cofre de segredos | `/root/komunick/data/brazil-tms/secrets.env` | `.../brazil-tms-dev/secrets.env` |

`devops/` e `deploy.sh` **não são versionados** (excluídos via `.git/info/exclude`), então o
repositório não conta essa história — este arquivo conta.

O `pnpm` vive no nvm do usuário `ubuntu`. Qualquer comando do repositório precisa do PATH:

```bash
PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH pnpm --filter @brazil-tms/db db:migrate
```

---

## 3. Segredos e ambiente

```
devops/config.env  ──> devops/gen-env.sh ──> infra/supabase/.env
                            │                apps/web/.env.local
   /root/.../secrets.env ───┘                packages/db/.env
        (o cofre)                            workers/.env
```

O `config.env` guarda o que é escolha (endereços, token dos robôs, e-mail do usuário de serviço). O
**cofre** guarda o que é sorteado uma vez e não pode mudar: senha do Postgres, `JWT_SECRET`, chaves
do Supabase e a senha inicial do admin.

> ### ⚠️ A armadilha do `gen-env.sh`
>
> **Sem o cofre, ele sorteia segredos NOVOS** — e os `.env` passam a apontar para credenciais que o
> banco em execução não tem. Nada quebra na hora: o site cai no **restart seguinte**, e o erro não
> parece ter relação com quem rodou o script.
>
> Antes de rodar, faça backup dos quatro `.env`. Depois, confira a primeira linha da saída:
>
> - `Segredos reaproveitados de ...` → certo
> - `Segredos NOVOS sorteados ...` → **pare e restaure os backups**
>
> Os dois cofres foram criados em 2026-08-18 a partir dos `.env` em uso. Se um deles sumir (VM
> reinstalada, disco novo), recrie-o **antes** de rodar o `gen-env` — os valores estão nos `.env`.

Variáveis que os robôs exigem:

| variável | quem usa | sem ela |
|---|---|---|
| `PORTAL_FEED_TOKEN` | as três rotas de ingestão | robôs levam 401, nada entra |
| `PORTAL_FEED_ACTOR_EMAIL` | worker (varredura de retiradas) | o job falha a cada 30 min, calado |

O e-mail precisa **existir como usuário no banco daquele ambiente**. Ele não faz login e não recebe
e-mail: existe para assinar eventos e auditoria do que os robôs fazem.

---

## 4. Deploy

`git push` em `dev` ou `main` dispara o workflow `deploy.yml` num runner **self-hosted** na própria
VM, que executa o `deploy.sh` do deploy correspondente. Produção tem `environment: production`, então
o job fica **`waiting`** até alguém aprovar em Actions → *Review deployments*.

> ### ⚠️ O deploy NÃO aplica migração
>
> O cabeçalho do `deploy.sh` diz `git pull → pnpm install → migração → build → restart`. **Não existe
> comando de migração no arquivo.** Migre à mão, com o código antigo ainda no ar — as migrações são
> aditivas, então o site atual convive com as colunas novas.
>
> ```bash
> cd /opt/brazil-tms
> git fetch origin +refs/heads/dev:refs/remotes/origin/dev   # o clone de prod só busca main
> git checkout origin/dev -- packages/db/migrations
> PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH pnpm --filter @brazil-tms/db db:migrate
> git checkout HEAD -- packages/db/migrations
> ```
>
> **Confira a tabela, nunca a mensagem.** O `drizzle-kit` responde *"migrations applied
> successfully"* mesmo sem ter feito nada. Aconteceu duas vezes no mesmo dia, por motivos diferentes:
> uma migração escrita à mão sem entrada no `meta/_journal.json`, e o `origin/dev` inexistente no
> clone de produção.
>
> ```sql
> select to_regclass('public.spot_offers'), to_regclass('public.bsc_snapshots');
> ```

### `ctl.sh` (parar, subir, status)

```bash
cd /opt/brazil-tms
sudo bash devops/ctl.sh status
sudo env PATH=/home/ubuntu/.nvm/versions/node/v22.23.2/bin:$PATH bash devops/ctl.sh start
```

> ### ⚠️ Duas armadilhas do `ctl.sh`
>
> **Via `sudo` ele não acha o `pnpm`** (o PATH do nvm é do usuário `ubuntu`): ele PARA os processos e
> falha ao subir. Sempre passe o PATH como acima.
>
> **O processo iniciado pelo `deploy.sh` não é reconhecido pelo `ctl.sh stop`** (arquivo de PID
> diferente). Se a porta 3000 aparecer ocupada depois de um `stop`, é ele — encerre pelo PID.
> Consequência prática: um `start` sem o `stop` correspondente cria um **segundo worker**.

---

## 5. O worker e seus jobs

Um processo (`workers/`, pg-boss), com os jobs registrados **no arranque** — por isso todo ajuste de
cron exige reinício:

| job | cron | o que faz |
|---|---|---|
| `sla.sweep` | `*/5` | recalcula risco de SLA e gera/resolve alertas |
| `documents.checks` | `*/5` | confere documentos obrigatórios |
| `portal.withdrawn` | `*/30` | **apaga** viagens que o cliente retirou do portal |

### A varredura de retiradas

O portal não avisa quando o cliente desiste de uma proposta: ela some do Planejado e pronto. Do lado
de cá a viagem seguia viva para sempre, cobrando atribuição e alertando.

Ela **apaga**, e a distinção é o cancelamento: viagem que o portal mostra **Cancelada** fica (é
história real); some só a que **não existe** no portal, e essa nunca chegou a ser viagem.

Cinco travas, todas necessárias:

1. **Só quem veio do portal** — a marca `Status (portal)` em `customer_fields`, que só o robô
   escreve. Viagem digitada à mão nunca é tocada.
2. **Só "Recebida"** — é também o que torna a cancelada inalcançável, já que ela chega como
   `cancelled`.
3. **Só dentro da janela varrida** — de 15 dias atrás a 7 à frente. Fora dela, a ausência só diz que
   ninguém olhou.
4. **Só com o robô alimentando** — se ele não carimbou dezenas de viagens na última hora, ausência
   não prova nada. É a trava do dia ruim, e substituiu um teto por quantidade que travava a varredura
   para sempre quando a pilha crescia.
5. **Só sem traço operacional** — nada de atribuição, documento, item de fatura ou exceção.

O que sobra como registro é a auditoria `trip.purge_withdrawn`, que **sobrevive à viagem**
(`audit_logs.entity_id` é polimórfico, sem chave estrangeira) e guarda o número da LH, o cliente e há
quantas horas ela sumira.

---

## 6. As travas de segundo plano do Chromium

O Chrome estrangula — e chega a congelar — a aba que não está na frente, e só uma pode estar. Medido:
o robô do portal ficou **duas horas sem varrer** (8 viagens carimbadas numa hora, contra 3.498 na
anterior), voltando em rajadas quando alguém mexia no navegador.

O lançador (`robo-portal/iniciar.sh`) sobe o Chromium com:

```
--disable-background-timer-throttling
--disable-backgrounding-occluded-windows
--disable-renderer-backgrounding
```

Com elas, tanto faz qual aba está na frente. **Medido depois:** o BSC leu os três recortes com a aba
atrás, e o portal varreu 3.939 viagens no mesmo estado.

O lançador abre as **duas abas** (portal e BSC, esta com `?hl=pt-BR`) — antes só abria o portal, e a
do BSC dependia de alguém lembrar depois de cada reinício.

---

## 7. Quando o dado para de chegar

Na ordem, do mais provável ao menos:

1. **A aba está aberta?** Aba fechada é robô parado. VNC em `localhost:6080` (túnel SSH).
2. **O console diz o quê?** F12 na aba do robô. Toda linha começa com a versão — `[TMS BSC 1.13.1]`.
   `401` é token; `404` é deploy antigo; "estação desconhecida" é cadastro.
3. **O TMS está recebendo?**
   ```sql
   select count(*) from trips where portal_last_seen_at > now() - interval '20 minutes';
   ```
   Um ciclo do plano carimba centenas. Menos que dezenas é robô parado.
4. **O BSC congelou?** O cartão do painel mostra *"sem atualizar há N h"* acima de 30 horas. A causa
   quase sempre é o filtro "Transportador" vazio — o robô repõe sozinho desde a 1.12.0.
5. **O worker está vivo?** `ps -eo cmd | grep 'tsx index.ts'`. Deve haver **um** por ambiente.

---

## 8. Trocar de ambiente

Apontar os robôs para outro TMS exige mudar **três lugares** — e o token de cada ambiente é
diferente:

| robô | arquivo | onde |
|---|---|---|
| portal | `/home/ubuntu/robo-portal/entrega/portal-feed.user.js` | VM Linux |
| BSC | `/home/ubuntu/robo-portal/entrega/bsc-feed.user.js` | VM Linux |
| eTorre | `/home/ubuntu/robo-portal/entrega/etorre-feed.user.js` | VM Linux |
| executor | `/home/ubuntu/robo-portal/entrega/portal-actions.user.js` | VM Linux |
| ofertas | script no Tampermonkey | VM Windows |

Os quatro da VM Linux são servidos em `http://127.0.0.1:8899` para o Tampermonkey, por
`infra/userscript-server/servir.py` (cópia em `/home/ubuntu/robo-portal/servir.py`). **Editar o
arquivo não basta:** suba o `@version` e abra a URL no navegador da VM para o Tampermonkey oferecer
a atualização — e recarregue a aba, porque a página em execução continua com o código antigo.

O deploy **não** atualiza esses arquivos: eles são cópias com o token preenchido, fora do repositório.

### Trocar o token: NUNCA com substituir-tudo

O arquivo do repositório traz `COLE_AQUI_O_TOKEN` na configuração, e a guarda que verifica se alguém
esqueceu de trocar precisa comparar com esse mesmo texto. Um substituir-tudo (o `str.replace` do
Python troca TODAS as ocorrências) acerta as duas, e a guarda vira `if (token === <o token certo>)`:
o robô passa a recusar exatamente o token válido, dizendo "token não configurado" com o token
correto na mão. Custou uma hora em 2026-08-22.

Troque **só a linha do `CONFIG`**. Desde a 0.4.3 o executor escreve o texto de exemplo partido em
dois pedaços na guarda, justamente para que um substituir-tudo não a alcance — mas a regra vale para
todos os robôs.

### O servidor não pode ter cache

`python -m http.server` responde sem `Cache-Control` e sem `ETag`. Nessa situação o Chromium aplica
cache heurístico e pode executar um corpo antigo enquanto MOSTRA o novo — navegar até a URL
revalida, o XHR de fundo do Tampermonkey não. `servir.py` manda `no-store` e registra cada download
em `log/entrega.log`, que é o que responde à pergunta "ele chegou a baixar?".

---

## 9. Registros que ficam

| o quê | onde |
|---|---|
| viagens removidas pela varredura | auditoria `trip.purge_withdrawn` |
| limpezas manuais | `/home/ubuntu/komunick/backups/*.json` |
| logs de web e worker | `/root/komunick/logs/brazil-tms-{web,worker}.log` |
| versões anteriores dos robôs | `*.bak-*` ao lado dos arquivos servidos |
