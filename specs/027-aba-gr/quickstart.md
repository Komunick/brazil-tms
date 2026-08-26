# Quickstart — 027 aba GR

## Antes de escrever código

Leia, nesta ordem:

1. **`docs/PROPOSTA-ABA-GR.md`** — o desenho e as três decisões de uso.
2. **[spec.md](./spec.md)** — o que tem de acontecer.
3. **[research.md](./research.md)** — as sete decisões e o que foi descartado junto.
4. **[contracts/setpresm.md](./contracts/setpresm.md)** — o corpo, campo a campo.

E tenha à mão **`docs/INTEGRA-14.2-REFERENCIA.md`**, que é a API inteira. **Confira ali antes de
afirmar que um campo não existe** — a 026 foi construída sobre três suposições sobre esta API, e as
três estavam erradas.

---

## As armadilhas desta fatia

**1. Não reescreva a 026.** Vínculo A/F/T, `trip_pre_sm`, o índice único, o cancelamento, o aviso de
divergência, a tela de conferência e o cliente da Integra **já existem** no `dev` e servem inteiros.
A tabela do plano diz o que sobrevive.

**2. `drizzle-kit generate` não serve aqui.** O journal tem 49 entradas e 27 snapshots: ele diffa
contra o `0024` e **recria tabelas de produção**. Migração escrita à mão, sempre. Isso já mordeu.

**3. Reuse `tokensDaEstacao`, não escreva outro normalizador.** A função nova (`ufECidadeDaEstacao`)
devolve o que aquela descarta, no mesmo arquivo e com a mesma separação. Dois normalizadores
divergem **em silêncio** — a estação simplesmente não casa, sem erro nenhum.

**4. Hora de São Paulo, nunca UTC.** A gerenciadora agenda escolta em hora local. Mandar UTC
desloca toda coleta em três horas, **passa em teste**, e só aparece na estrada.

**5. `subcontracted` não tem letra.** Ele significa "ainda não classificado" — 1.246 veículos e 405
motoristas estão assim. Chutar `A` mandaria informação errada para quem faz escolta, e o erro seria
invisível. Vira motivo de bloqueio.

**6. A credencial vive só no worker.** O cliente da Integra mora em `workers/lib/`, fora de
`packages/`, exatamente para o app web não conseguir importá-lo. Toda escrita é job.

**7. Renumerar a migração no merge**, nunca antes.

---

## Como rodar

```bash
pnpm install
pnpm --filter @brazil-tms/db migrate
pnpm vitest run packages/shared/src/domain/pre-sm-corpo.test.ts
pnpm lint && pnpm -r typecheck && pnpm test
```

O **`pnpm lint` da raiz** roda `eslint .` e cobre `scripts/`; o `pnpm -r lint` **não**. Rodar só o
segundo já deixou a CI vermelha.

---

## Como conferir sem gastar

A gerenciadora **cobra por solicitação** e não há homologação (`CodErro 100`, medido). Três camadas
antes de qualquer gasto:

| Camada | O que responde | Quando |
|---|---|---|
| teste puro | o casamento de nomes, o corpo, os motivos | etapas 2 e 3 |
| leitura real | as 518 rotas dela contra as nossas 134, com a aba já montada | etapas 1 e 4 |
| ensaio desligado | quantas viagens sairiam limpas num dia | etapa 5 |

`getRotas`, `getCliente` e `getTabela` são **consulta** — não criam nada e não custam.
Dá para carregar tudo, conferir as correspondências e olhar a aba com dados reais **antes de existir
botão que gaste**.

Só uma pergunta sobra para a criação real: **se a gerenciadora aceita o nosso corpo.**

---

## A virada (etapa 6)

Com o usuário presente, uma viagem escolhida, e o cancelamento à mão.

### Antes

- [ ] a rota e as duas cidades da viagem escolhida **confirmadas** na tela
- [ ] `getConsultaPreSMAberta` — guardar a lista de antes
- [ ] `getListaProgramacaoCargas` — guardar o status da programação daquela viagem

### Depois

| O que olhar | O que significa |
|---|---|
| uma Pré-SM nova em `getConsultaPreSMAberta` | a criação funcionou |
| a programação passa a avisar "já possui Pré-Solicitação em aberto" | **amarrou** — a integração serve |
| a programação continua igual e o botão dela ainda gera | **nasceu solta** — falar com a gerenciadora antes de seguir |

O segundo caso não é fracasso da aba: a fila, a lista do que falta e as pontes continuam valendo. É
o formato do corpo que muda, e ele mora num arquivo só.

---

## Pendências com dono

**Com a gerenciadora**, e nenhuma bloqueia as etapas 1 a 4:

**Uma só**: como o `setPreSM` amarra a Pré-SM à programação do eTorre? Não há campo de código de
programação em nenhum método de criação. Bloqueia só a etapa 5.

E uma menor, da mesma família: o `CNPJEmbarcador` é exigido na prática? A tela marcava como
obrigatório, o manual não.

### Já resolvidas, e como

**A conta ESCREVE.** `setCancelaPreSM` com o código `999999999` — fora da faixa real, que tem 8
dígitos — devolveu `CodErro 137 — não existe Pré-Solicitação cadastrada com esse código`. **Não** é
`103 — METODO NAO LIBERADO`, que é como a API recusa por permissão: o método executou, foi ao banco
procurar, e voltou. Só chega aí quem tem permissão. E não cancelou nada.

`CodFilial` = **9332** · `CodPerfilSeguranca` = **20785 (DDR SHOPEE)**, os dois de `getTabela`.

### Duas lições que essas respostas deixaram

**Um erro de parâmetro se parece com um limite da API.** `CodFilial` e `CodPerfilSeguranca` foram
dados como "sem fonte" por horas porque chamei com `Tabela` em vez de `NomeTabela`. O `CodErro 105`
devolve a lista de valores aceitos **truncada em 250 caracteres**, o que escondeu justamente
`FILIAIS` e `PERFIL_SEGURANCA`. Antes de concluir que algo não existe, confira o nome do campo.

**A própria API se documenta.** `getTabela(NomeTabela: "ERROS_WEBSERVICE")` devolve os 14 códigos de
erro — é assim que se descobre que existe um código específico para "método não liberado", e
portanto que dá para testar permissão sem criar nada. A tabela não é exaustiva: o `137` que apareceu
no teste não está nela.

**Do nosso lado**: as credenciais da Logae precisam ir ao `devops/config.env` da VM, **e** ao
`.env.local`. Só no segundo não segura — o próximo deploy regenera esse arquivo a partir do
primeiro. Ver `docs/OPERACAO.md`.
