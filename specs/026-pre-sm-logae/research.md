# Research — 026 Pré-SM na Logae

Resolve os três riscos que a checklist da spec mandou o plano endereçar, mais as escolhas técnicas
que não estavam decididas. O levantamento de negócio e os números medidos estão em
`docs/PROPOSTA-PRE-SM.md` — aqui só o que é decisão de engenharia.

---

## R1 — Como validar a escrita sem ambiente de teste

**Decisão**: o caminho de escrita nasce **atrás de um interruptor desligado**, e a primeira criação
real é feita **à mão, por uma pessoa, numa viagem escolhida**, com o cancelamento pronto para
desfazer.

**Contexto medido (2026-08-25)**: o ambiente de homologação da Logae recusa o nosso acesso —
`CodErro 100 — USUARIO INVALIDO`. Só temos produção. Não é um detalhe de conveniência: **a
gerenciadora cobra por solicitação**, então cada tentativa malfeita custa dinheiro e mexe no sistema
de um fornecedor.

Três mecanismos, e os três precisam existir juntos:

1. **Interruptor por variável de ambiente.** Sem ela ligada, o trabalho roda até o último passo,
   registra o que *teria* mandado, e **não chama** a gerenciadora. Isso permite deployar a feature
   inteira em produção e observar o que ela decidiria, por dias, sem criar nada.
2. **Modo "só a primeira".** Um limite de quantas Pré-SM podem ser criadas automaticamente por dia,
   começando em zero — o que torna a criação um ato deliberado, viagem a viagem, enquanto ninguém
   confia no comportamento ainda.
3. **Cancelamento na tela desde o primeiro dia** (FR-017). Não é conveniência: é a única forma de
   desfazer. Por isso ele entra na mesma fatia da criação, e não numa seguinte.

**Alternativas descartadas**:

- *Pedir credenciais de homologação à Logae.* É o certo, e vale pedir — mas não dá para bloquear a
  feature numa resposta de terceiro sem prazo. Se vierem, viram o caminho preferencial.
- *Um dublê local da API.* Prova o nosso lado e **não prova o deles**, que é justamente o lado
  desconhecido. Um dublê escrito a partir do PDF concordaria com a nossa leitura do PDF — inclusive
  onde ela estiver errada. Serve para teste automatizado (ver R5), não para validação.
- *Criar e cancelar em produção como teste rotineiro.* Descartado como rotina: cancelar deixa
  rastro no sistema deles e pode ter custo. Aceito **uma vez**, na validação inicial, com o usuário
  sabendo.

---

## R2 — Abrir o `ownership_type` sem quebrar o CHECK

**Decisão**: acrescentar `agregado` e `terceiro` ao enum (decidido com o usuário — não criar campo
separado), **manter `subcontracted` como valor dormente**, e reescrever os três CHECKs numa migração
`--custom`.

**O obstáculo, verificado no código**: `ownership_type` é um `pgEnum` com `owned` | `subcontracted`,
usado em `vehicles`, `trailers` e `drivers`. As três tabelas têm o mesmo CHECK:

```sql
(ownership_type = 'subcontracted' AND carrier_id IS NOT NULL)
OR (ownership_type = 'owned' AND carrier_id IS NULL)
```

Ou seja: **quem é "de fora" é obrigado a ter transportadora**. Acrescentar `agregado` e `terceiro`
sem tocar no CHECK torna esses dois valores impossíveis de gravar — a linha não satisfaz nenhum dos
dois braços, e o banco recusa. A migração passaria e a feature quebraria no primeiro `update`.

**Postgres não remove valor de enum.** Então `subcontracted` **fica**, dormente, exatamente como
`validation_error`/`validated` ficaram no `trip_status` na 015. O precedente é do próprio
repositório, e a mesma técnica se aplica: os valores dormentes ficam fora do tipo TypeScript, e as
colunas são fixadas ao tipo restrito.

**A regra nova**, que preserva a intenção original sem impedir a divisão:

```sql
(ownership_type = 'owned' AND carrier_id IS NULL)
OR (ownership_type <> 'owned' AND carrier_id IS NOT NULL)
```

Ler: **frota própria não tem transportadora; todo o resto tem.** É o que o CHECK atual já diz — só
que escrito de um jeito que não enumera os valores de "o resto", e por isso não precisa mudar de
novo quando surgir um quarto.

**Os dados existentes**: os 1.246 veículos, as carretas e os 405 motoristas hoje `subcontracted`
**não são migrados em massa**. Ficam como estão até alguém classificá-los pelo uso (FR-010) — o que
significa que o código precisa tratar `subcontracted` como "ainda não classificado", e não como um
erro. Um mutirão de cadastro foi explicitamente descartado com o usuário.

**Alternativa descartada**: uma coluna nova `vinculo` só para a gerenciadora. Deixaria o CHECK
intocado, mas criaria dois campos querendo dizer quase a mesma coisa — e um dia alguém preenche um e
esquece o outro. O usuário escolheu o enum, e a razão é essa.

---

## R3 — Garantir "no máximo uma Pré-SM por viagem"

**Decisão**: **índice único no banco** sobre a viagem, mais o enfileiramento amarrado ao resultado
do encerramento da ordem — que já é idempotente.

**Por que precisa de banco, e não de verificação em código**: a gerenciadora cobra por solicitação.
Duas Pré-SM para a mesma viagem é escolta contratada em dobro. Um `select` antes do `insert` deixa
janela entre os dois; a fila pode reprocessar; e o worker pode rodar duas vezes o mesmo trabalho num
restart.

**O que já ajuda, e foi verificado no código**: `encerrarOrdemDoPortal` faz o UPDATE com
`WHERE status = 'sent'` e devolve se alguma linha mudou. Ou seja, **só um relato do robô consegue
encerrar a ordem** — os repetidos devolvem `false`. Enfileirar o trabalho apenas quando essa função
devolver `true` já elimina o caso comum.

O índice único é a garantia que sobra para o resto: restart do worker, reenfileiramento manual, ou
uma segunda ordem de `assign` na mesma viagem. Com ele, o pior desfecho vira "o insert falha e o
trabalho registra que já existia" — que é o comportamento correto.

**Sobre o que o índice cobre**: uma Pré-SM **cancelada** não deve impedir uma nova, senão uma criada
por engano trava a viagem para sempre. Então o único é **parcial**: vale só para os estados vivos
(pendente, criada), não para cancelada nem recusada.

**Alternativa descartada**: chave de idempotência enviada à gerenciadora. Seria o ideal, mas a
Integra 14.2 não oferece esse campo no `setPreSMdeModelo` — a única chave que ela expõe é o `Codigo`,
e ele serve para *alterar* uma existente, não para evitar a criação duplicada.

---

## R4 — De rota para modelo: onde mora a correspondência

**Decisão**: uma **tabela de correspondência** rota → código do modelo, alimentada por uma carga a
partir da própria gerenciadora, com o casamento por nome normalizado.

**Por que não casar por nome em tempo de execução**: o casamento tolera acento, parênteses, sigla
colada a número e zero à esquerda — regras que já erraram uma vez nesta mesma sessão (sem a última,
4 rotas e 233 viagens/mês caíam como "sem modelo"). Uma regra dessas rodando a cada criação é uma
regra que ninguém revisa. Guardada como linha de tabela, a correspondência pode ser **conferida por
uma pessoa** antes de valer, e corrigida quando o portal mudar a grafia de uma estação.

**A carga** consulta a gerenciadora, propõe as correspondências que o normalizador encontrar, e
grava. O que não casar fica de fora e aparece como "rota sem modelo" (FR-012) — que é o
comportamento pedido.

**Alternativa descartada**: guardar o código do modelo direto na tabela de rotas (`lanes`). Amarra
um dado de fornecedor ao nosso cadastro de malha, e o dia em que houver uma segunda gerenciadora a
coluna vira `codigo_modelo_logae`.

---

## R5 — Como testar sem chamar a gerenciadora

**Decisão**: o cliente da API fica atrás de uma interface fina; a lógica de decisão — o que montar,
quando recusar, o que dizer — é **pura** e testada sem rede. O cliente real é exercitado só na
validação manual de R1.

Segue o padrão que o repositório já usa em `packages/shared/src/domain/`: as regras de negócio são
funções puras com teste próprio (`portal-assignment.ts` é o exemplo mais próximo — mesma família de
problema, mesma separação).

O que fica coberto por teste automatizado:

- montar o corpo da Pré-SM a partir de uma viagem (campos, formatos de data, placas)
- decidir **não** criar, e qual é o motivo (sem CPF, sem modelo, sem vínculo)
- traduzir `ownership_type` para o vínculo que a gerenciadora espera
- o casamento rota → modelo, com as quatro tolerâncias

O que **não** fica: que a gerenciadora aceita o corpo. Isso só a validação manual responde, e é
honesto dizer isso no plano em vez de fingir cobertura.

---

## R6 — Onde ficam as credenciais

**Decisão**: variáveis de ambiente lidas **só no worker**, nunca no cliente, seguindo o que já vale
para o token do robô.

O login da Integra é de produção e dá acesso de escrita ao sistema de um fornecedor. Ele não pode
aparecer em código, em `NEXT_PUBLIC_*`, nem em resposta de rota. O `devops/config.env` é a fonte, e
o `gen-env.sh` o copia — com a lição já registrada em `docs/OPERACAO.md`: **corrigir só o
`.env.local` não segura**, porque o próximo deploy o regenera a partir do `config.env`.

O interruptor de R1 é uma variável separada da credencial: desligar a feature não pode exigir apagar
a senha, senão religar vira uma operação de risco.
