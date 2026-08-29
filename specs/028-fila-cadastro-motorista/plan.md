# Implementation Plan: Pré-cadastro de motorista parceiro

**Branch**: `dev` → fatia `028-fila-cadastro-motorista` · **Date**: 2026-08-29 · **Spec**: [spec.md](./spec.md)

**Prazo**: as etapas 1 e 2 precisam estar em produção **antes de 10/09/2026**. Faltam doze dias.

## O que manda neste plano

Um evento no dia 10, com mais de 50 motoristas e ninguém do escritório presente. **Só a captura tem
data.** Leitura da CNH, conferência, envio à gerenciadora e automação vêm depois e não podem
bloquear.

Por isso a ordem abaixo não é a ordem lógica do produto — é a ordem do risco.

## Technical Context

**Linguagem**: TypeScript strict · Next.js App Router · Postgres via Drizzle
**Armazenamento de arquivo**: Supabase Storage, bucket privado (fatia 025, já implementada)
**Frescor**: polling via TanStack Query — sem Realtime (constituição)
**Dependências novas no P1**: **nenhuma**. `zod`, `react-hook-form`, `@hookform/resolvers` e
`@radix-ui/react-dialog` já estão instalados
**Dependência nova no P2**: `@anthropic-ai/sdk`, escolhida pela fatia 021 em julho
**Fora deste repositório**: o formulário, que vive em `site-brazil-transports`. Este plano entrega
para lá **o contrato da rota**, não código

## Constitution Check

| Princípio | Situação | Justificativa |
|---|---|---|
| **I · Simplicity** | ✅ | Nenhuma abstração nova. Duas tabelas porque a spec exige histórico, não por antecipação |
| **II · Escopo de execução** | ✅ | P1 é captura. O resto está fatiado e nomeado, não absorvido |
| **III · Integridade do registro** | ⚠️ **atenção** | O descarte de um pré-cadastro **arquiva, não apaga** — ver decisão D6 |
| **IV · Autorização e segredos** | ⚠️ **atenção** | Uma rota **pública sem sessão** é tensão real com "o BFF é a única fonte de autorização". Ver decisão D4 |
| **V · Configuração sobre código** | ✅ | Filial e profissão são constantes de configuração, não literais espalhados |
| **VI · Spec-driven** | ✅ | Spec revisada pelo usuário antes deste plano |
| **Tecnologia** | ✅ | Sem Realtime, sem Edge Functions, sem Redis, sem serviço novo |

**As duas atenções estão resolvidas nas decisões abaixo, e nenhuma exige emenda à constituição.**

---

## As seis decisões, com o porquê

### D1 · Duas tabelas: o pré-cadastro e o envio

`driver_preregistrations` — **um por CPF em andamento**. Carrega o estado consolidado, o tipo (novo
ou atualização), o vínculo com `drivers` quando é atualização, e a situação.

`driver_preregistration_submissions` — **um por envio**, imutável. Carrega o que chegou naquela
submissão e os arquivos daquela vez.

**Por que não uma só**: a spec exige preservar o histórico quando o mesmo CPF envia de novo
(FR-016). Numa linha só, o segundo envio sobrescreveria o primeiro — e o princípio III diz que
histórico operacional é imutável.

É a mesma separação que o repositório já usa entre `portal_commands` (o pedido) e `trips` (o fato).

### D2 · A origem de cada campo vive num `jsonb`

Um objeto onde cada chave é o campo e o valor carrega `{ valor, origem }`. As origens são
`cnh · cep · digitado · declarado · existente`.

**Por que não uma coluna por campo**: seriam ~40 colunas, e mais 40 para a origem. A etapa 3
acrescenta catorze campos de uma vez; cada uma exigiria migração.

**Por que não uma tabela campo/valor**: consulta e escrita ficam caras para algo que sempre é lido
inteiro, junto com a linha.

O repositório já faz assim em `trips.customerFields` e `operational_fields`. A forma é garantida por
um esquema Zod em `shared`, como já acontece com os outros dois.

### D3 · Conter envios sem Redis: contagem no Postgres, com dois limites

A constituição proíbe Redis. A contagem sai da própria tabela de envios, que já tem a hora.

**Dois limites, porque o risco é diferente:**

| Chave | Limite | Por quê |
|---|---|---|
| Por **CPF** | apertado | Ninguém se cadastra dez vezes por engano |
| Por **origem** | folgado | Vinte pessoas num estande dividem o mesmo wi-fi |

**A origem é guardada como hash, nunca como IP.** Para conter repetição basta saber que é *a mesma*
origem; saber *qual* é dado pessoal que não precisamos ter.

### D4 · A rota pública, e a tensão com o princípio IV

O princípio diz que o BFF é a única fonte de autorização e que todo acesso é server-side por ele.
**Uma rota sem sessão não viola isso** — ela É o BFF, e continua sendo o único caminho até o banco.
O que muda é que a autorização deixa de ser "quem é você" e passa a ser "o que você pode fazer":

- só **escreve**, nunca lê
- escreve numa tabela que **não é** `drivers`
- **revalida tudo** no servidor, porque o navegador não é confiável
- a chave de serviço do Supabase continua **só no servidor** — o upload passa pela rota, não pelo
  cliente

O padrão de rota fora do shell já existe no grupo `(wall)`.

### D5 · A resposta idêntica, por construção e não por disciplina

A rota tem **um único ponto de saída**, devolvendo um literal fixo. A decisão sobre qual dos três
casos de CPF ocorreu acontece numa função interna que **não devolve nada para a resposta**.

E um teste afirma que os três casos produzem resposta **byte a byte idêntica**. É o teste que
transforma a regra em estrutura: sem ele, a primeira pessoa que acrescentar uma mensagem útil
reabre o vazamento sem perceber.

**O tempo também é canal.** A consulta ao CPF acontece nos três casos, sempre — não há caminho
curto para o CPF desconhecido.

### D6 · O descarte arquiva

O princípio III proíbe apagar registro auditável. Descartar um pré-cadastro **marca**, com autor e
data, e some da fila — mas a linha e os envios permanecem.

Isso também protege contra o engano: um descarte errado no meio de cinquenta se desfaz.

---

## As etapas

### Etapa 1 — A fundação e a rota que recebe · **P1, prazo 10/09**

Uma migração escrita à mão com as duas tabelas de D1. O validador de CPF em
`packages/shared/src/domain/cpf.ts`, sob teste. A rota pública com origem permitida, revalidação
completa, os dois limites de D3 e a resposta única de D5. O upload das fotos reusando a fatia 025.

**Entregável por si**: um envio feito por `curl` chega ao banco com as fotos.

**E o contrato publicado** (`contracts/pre-cadastro.md`) — é o que destrava quem vai escrever o
formulário do outro lado. Sai nesta etapa, não na última.

### Etapa 2 — A fila · **P1, prazo 10/09**

A tela interna, dentro do shell autenticado. Lista por ordem de chegada, distingue novo cadastro de
atualização cadastral, abre as fotos por link de curta duração, e arquiva com registro.

**Entregável por si**: com as etapas 1 e 2, o evento acontece. Tudo o mais é melhoria.

### Etapa 3 — A leitura da CNH · P2

`@anthropic-ai/sdk` no servidor, esquema validado, campo não lido fica vazio e assinalado. Herda as
decisões da fatia 021 e amplia de dois para catorze campos.

### Etapa 4 — A conferência · P2

Documento ao lado dos campos, origem em cada valor, atual × proposto para atualização cadastral. O
CEP resolve o endereço. O vínculo é confirmado aqui, nunca pelo motorista.

**A função `faltaAlgo`** nasce nesta etapa, em `packages/shared/src/domain/pre-cadastro-completo.ts`
— pura, testável, devolvendo **todos** os motivos que faltam e nunca o primeiro. É a mesma lição do
`pre-sm-corpo.ts` da 027.

### Etapa 5 — O envio à gerenciadora · P2

`setMotorista` com o bloco `Documentos`, seguido da solicitação de pesquisa. Credencial só no
worker, escrita sempre por job. O toxicológico marca a pendência manual.

### Etapa 6 — O envio automático · P3

Só depois de haver número real sobre quantos cadastros chegam limpos. Reusa `faltaAlgo`: se a lista
vier vazia e o interruptor estiver ligado, segue sozinho, com teto diário.

### Etapa 7 — O retorno da auditoria · P3

`getResultadoPesquisaConsulta` por job, com a situação aparecendo na fila.

---

## Estrutura de arquivos

```
packages/shared/src/domain/
  cpf.ts                        etapa 1 — validação, sob teste
  pre-cadastro.ts               etapa 1 — o esquema do jsonb e as origens
  pre-cadastro-completo.ts      etapa 4 — `faltaAlgo`, pura

packages/db/
  schema/driver-preregistrations.ts
  migrations/00XX_pre_cadastro.sql        À MÃO. Renumerar só no merge
  src/drivers/pre-cadastro.ts             gravar, deduplicar, listar, arquivar

apps/web/app/api/publico/pre-cadastro/route.ts    etapa 1 — a rota pública
apps/web/app/(shell)/parceiros/page.tsx           etapa 2 — a fila
apps/web/components/parceiros/…                   etapa 2 e 4

specs/028-fila-cadastro-motorista/contracts/pre-cadastro.md   etapa 1 — para o outro repositório
```

## O que NÃO se faz aqui

O formulário do site. Ele vive em `site-brazil-transports`, ainda não clonado nesta máquina. O que
este plano entrega para lá é o **contrato** — campos, formatos, respostas e erros.

## Riscos, e o que cada um custa

| Risco | Consequência | Mitigação |
|---|---|---|
| Foto grande em 4G de evento | cadastro perdido em silêncio | Teto no servidor com recusa clara; compressão é do formulário |
| Ninguém no estande | quem trava não tem saída | `FR-010a`: caminho de contato na tela final |
| Link público circula | lixo na fila | Não gasta nada: só a conferência envia |
| Formulário atrasa do outro lado | evento sem captura | O contrato sai na **etapa 1**, não no fim |
| A leitura da CNH não ficar boa | mais digitação | É P2. O evento não depende dela |
