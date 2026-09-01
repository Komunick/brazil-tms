# Quickstart: Aceite de oferta de spot direto no cartão

**Feature**: 030-aceite-de-spot · **Date**: 2026-09-01

Como exercitar esta fatia **sem aceitar nada de verdade**, e o que conferir em cada etapa.

---

## Regra número um

> **Aceitar é irreversível no portal do cliente.** Uma LH aceita não tem como ser desfeita do nosso
> lado. Nenhum passo abaixo dispara um aceite real, e nenhum passo novo deve.

O caminho de escrita é exercitado de dois jeitos, os dois seguros:

1. **Contra uma viagem que NÃO está `Pending`.** `impedimentoDaAcao` recusa antes de a ordem nascer —
   nada é gravado, nada chega ao robô, nada chega ao portal. Prova o guarda sem gastar.
2. **Pelo ensaio que já existe** (`apps/web/lib/spot/ensaio.ts`), que injeta uma oferta de mentira na
   mesma fila do cartão. Ele prova o desenho: os estados, os dois gestos, a grade, o recolher.

O primeiro aceite de verdade é decisão do usuário, com ele presente, numa oferta real que ele queira
pegar. Não é passo de implementação.

---

## Etapa 1 · A tabela

```bash
pnpm --filter @brazil-tms/db db:migrate
```

**Conferir**, e é o que mais falha nesta base:

```bash
grep -c "0062_dispensa_de_oferta" packages/db/migrations/meta/_journal.json   # tem de ser 1
```

Sem a entrada no journal, a migração é **pulada em silêncio** e o deploy responde sucesso. Já
aconteceu duas vezes neste repositório. O teste `packages/db/src/migrations-journal.test.ts` cobre os
dois sentidos — não desativar.

Depois de migrar, a tabela existe e está vazia. **Nada mudou para ninguém**, e é assim que tem de
ser: dá para parar aqui.

---

## Etapa 2 · A derivação

```bash
pnpm --filter @brazil-tms/shared test spot-decisao
```

O que os testes precisam afirmar, um por linha da tabela do `data-model.md`:

- sem viagem → `sem_viagem`, e `podeAceitar` é falso
- `Pending` sem ordem → `esperando`
- ordem `pending` ou `sent` → `enviado`
- última ordem `failed` e nenhuma aberta → `recusado`, carregando a mensagem
- `Accepted` → `aceito`, **em qualquer combinação das outras entradas**

O último é o mais importante: `Accepted` vence tudo. Uma viagem aceita com uma ordem falhada
pendurada continua sendo `aceito` — porque a verdade é do portal, e a ordem é só o nosso pedido.

Ninguém chama esta função ainda. Dá para parar aqui.

---

## Etapa 3 · A leitura

```bash
curl -s localhost:3000/api/spot-offers -H "cookie: …" | jq '.ofertas[0]'
```

**Conferir**:

- os campos antigos vieram todos, com os mesmos nomes
- `estado` está preenchido e nunca é `"aceito"`
- uma oferta com `estado: "sem_viagem"` tem `tripId: null` e `podeAceitar: false`

**E o que não pode acontecer**: o cartão de hoje continua se comportando exatamente como antes. Ele
ignora os campos novos. Se algo mudou na tela nesta etapa, algo saiu do lugar.

Medir de novo se a consulta continua barata (a referência é 2,5 ms):

```sql
explain (analyze, buffers) select … -- a consulta de readSpotOffersToday
```

---

## Etapa 4 · O cartão

Com o botão de ensaio, subir uma oferta de mentira e percorrer:

| conferir | esperado |
| --- | --- |
| o cartão fica | passa de 30 s e continua lá |
| um clique em Aceitar | abre a confirmação com o número da LH escrito; **nada foi enviado** |
| Voltar | volta ao estado de decisão, sem efeito |
| Ignorar | sai da tela; abrir noutra sessão mostra que continua lá para o colega |
| recarregar depois de ignorar | continua fora da sua tela |
| duas ofertas | dividem o espaço, lado a lado |
| cinco ofertas | todas legíveis, o conjunto rola dentro da camada |
| Recolher | vira pastilha com a contagem; uma oferta nova reabre |
| **digitar num campo atrás** | funciona — sem cortina, sem roubo de foco |

**A prova do FR-003 não é olhar**: é o Playwright que preenche e envia uma atribuição com os cartões
na tela. Se ele passar por acidente (porque não havia cartão), ele não prova nada — a asserção
precisa começar conferindo que há cartão.

**O guarda da cortina**: um teste que falha se `9999px` ou um fundo opaco de tela cheia voltarem ao
arquivo da camada. A cortina é fácil de reintroduzir sem perceber, porque ela "melhora o contraste".

---

## Etapa 5 · O Painel do dia

| conferir | esperado |
| --- | --- |
| o terceiro estado | oferta esperando decisão tem pontinho próprio, distinto de aceita e não aceita |
| a ação na linha | aceitar dali abre a mesma confirmação |
| **a mesma decisão** | aceitar pela linha muda o cartão noutra aba, e vice-versa |
| a oferta ignorada | **continua listada**, assinalada, e ainda aceitável |
| a correção do `aceito` | uma oferta cuja viagem está `Pending` NÃO é mais contada como aceita |

O último item é o que prova a correção do R9. Antes desta fatia, uma oferta com viagem recém-chegada
e ainda pendente aparecia como aceita no painel.

---

## Etapa 6 · Antes do PR

```bash
pnpm lint          # da RAIZ — `eslint .`. `pnpm -r lint` não cobre scripts/ e já deixou a CI vermelha
pnpm typecheck
pnpm test
pnpm --filter web test:e2e -- spot
```

---

## O que NÃO fazer

1. **Não gravar "aceita" em coluna nossa.** Se surgir a vontade, releia o R1: das 19 ofertas de dois
   dias, quase todas foram aceitas direto no portal. Uma cópia nossa diria "esperando" para sempre.
2. **Não criar rota de aceite por oferta.** O FR-009 proíbe, e a razão é que o guarda, o índice de
   ordem única e a auditoria moram todos no caminho que já existe.
3. **Não usar `drizzle-kit generate`.** O journal tem mais de sessenta entradas e ele diffa contra um
   snapshot antigo, recriando tabelas de produção.
4. **Não fazer o cartão sumir quando o `POST` responde sucesso.** Ordem aceita pelo robô não é viagem
   aceita pelo portal — 4 das 17 ordens voltaram recusadas.
5. **Não traduzir toda mensagem de erro do portal.** Código desconhecido mostra o texto cru. Um
   "não foi possível aceitar" genérico apaga a única pista do caso novo.
6. **Não guardar o recolhido.** Recolher guardado é o X de volta, com o agravante de sobreviver ao
   reinício.
7. **Não aceitar nada de verdade para testar.** Nem uma. Ver a regra número um.
