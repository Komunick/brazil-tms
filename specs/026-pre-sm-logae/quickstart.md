# Quickstart — 026 Pré-SM na Logae

## Antes de escrever código

Leia, nesta ordem: `docs/PROPOSTA-PRE-SM.md` (os números e o porquê), [spec.md](./spec.md) (o que
tem de acontecer), [research.md](./research.md) (as três decisões difíceis).

## As armadilhas desta fatia

**1. O CHECK recusa a migração.** Acrescentar `agregado`/`terceiro` ao enum sem reescrever os três
CHECKs de `vehicles`, `trailers` e `drivers` faz a feature quebrar no primeiro `update` — a migração
passa e o banco recusa a linha. Ver `data-model.md` §2.

**2. `subcontracted` não é erro.** Ele fica dormente e significa **"ainda não classificado"**. 1.246
veículos e 405 motoristas estão assim, e não serão migrados em massa — foi decisão. Tratar como erro
faria a tela acusar irregularidade em quase todo o cadastro.

**3. Duplicata custa dinheiro.** A gerenciadora cobra por solicitação. O índice único é **parcial**
(só `pendente` e `criada`) de propósito: se cobrisse tudo, uma Pré-SM cancelada travaria a viagem
para sempre.

**4. Não há ambiente de teste.** Homologação recusa o nosso login. A feature nasce **desligada** por
variável de ambiente; a primeira criação real é deliberada, com o usuário, e o cancelamento precisa
estar pronto antes.

**5. A credencial some no próximo deploy** se você a puser só no `.env.local`. Ela vai no
`devops/config.env`, que é a fonte do `gen-env.sh`. Essa lição já custou seis horas de alimentação
parada — está em `docs/OPERACAO.md`.

**6. Renumerar a migração no merge**, nunca antes.

## Como rodar

```bash
pnpm install
pnpm --filter @brazil-tms/db migrate      # depois de escrever a migração
pnpm vitest run packages/shared/src/domain/pre-sm.test.ts
pnpm --filter @brazil-tms/web lint && npx tsc --noEmit -p apps/web/tsconfig.json
```

O worker roda separado do app; um job novo precisa de restart dele para valer.

## Como conferir sem chamar a gerenciadora

Com o interruptor desligado, o trabalho roda inteiro e registra em `trip_pre_sm.payload_enviado` o
que **teria** mandado. Atribua uma viagem e leia essa linha: ela diz se o corpo está certo, se o
modelo casou e se o vínculo foi traduzido — tudo sem tocar no sistema deles.

É assim que se valida antes da virada.

## Variáveis novas

| variável | onde | para quê |
|---|---|---|
| `INTEGRA_LOGIN` / `INTEGRA_SENHA` | **worker apenas** | credencial de produção |
| `INTEGRA_PRE_SM_ATIVO` | worker | o interruptor; ausente ou `false` = não chama |
| `INTEGRA_PRE_SM_TETO_DIARIO` | worker | quantas por dia; começa em `0` |

Todas no `devops/config.env` **e** no `.env.local` — ver armadilha 5.
