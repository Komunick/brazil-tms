# Passagem de Turno no TMS

**Implementado em 26/08/2026.** Este documento registra o que a planilha *é* (lida do arquivo, não da tela),
o que o TMS já sabe responder sozinho, e as decisões que faltam.

Fonte: `PASSAGEM DE TURNO.xlsx`, exportada em 26/08/2026 da planilha
`1mzyU69_IaOnJDsRL_qIPbEcwnFJFDZiDMeDbX1t0vYs`.

---

## 1. O que a planilha é

Uma aba por dia — `24/08` a `31/08`, oito abas. Cada aba tem **dois turnos lado a lado**:

| | colunas | turno |
|---|---|---|
| esquerda | B–H | `T1 (7H ÀS 19h) — DIURNO` |
| direita | L–R | `T2 (19h às 7H) — NOTURNO` |

E dentro de cada turno, **cinco setores empilhados**, cada um com sua faixa `SETOR: …`, seu
`ASSISTENTE`, seu `SUPERVISOR`, seu `RESUMO DA OPERAÇÃO` e suas seções numeradas:

```
SETOR: PROGRAMAÇÃO   linha   9
SETOR: SPOT          linha 110
SETOR: EMISSÃO       linha 166
SETOR: GR            linha 210
SETOR: Monitoring    linha 257
```

Cinco setores × dois turnos × um dia = **dez blocos por dia**. É essa a unidade de tudo que segue.

### A estrutura de cada setor

Duas formas se repetem, e a diferença entre elas importa para a tela:

- **tabela** — uma linha por ocorrência (`1. ROTAS SEM ATRIBUIÇÃO/CONFIRMAÇÃO`);
- **cartão** — os campos empilhados verticalmente, um bloco por ocorrência, com a OCORRÊNCIA
  ocupando uma célula alta ao lado (`3. PONTO DE ATENÇÃO`, e quase tudo de GR e Monitoring).

O cartão existe porque a ocorrência é texto longo. Exemplo real, do Monitoring de 25/08:
*"Drive rodou boa parte da viagem em velocidade reduzida devid…"*. Numa tabela isso destrói a linha
— foi o mesmo motivo que levou o comentário da LH a virar popup na 029.

### Os setores, seus resumos e suas seções

**PROGRAMAÇÃO** — resumo: `No Show` · `Pendente de Confirmação` · `Sem Atribuição` ·
`ETA ORIGEM (DELAY)` · `Cancelamento`

| # | seção | forma | campos |
|---|---|---|---|
| 1 | ROTAS SEM ATRIBUIÇÃO/CONFIRMAÇÃO | tabela | LH · ORIGEM · DESTINO · ETA ORIGEM · **OCORRÊNCIA** |
| 3 | PONTO DE ATENÇÃO | cartão | LH · ORIGEM · DESTINO · ETA ORIGEM · MOTORISTA · OCORRÊNCIA |
| 4 | ROTAS CANCELADAS | tabela | LH · ROTA · ETA ORIGEM · MOTORISTA · OCORRÊNCIA |
| 4 | NO SHOW | cartão | MOTORISTA · ROTA · OCORRÊNCIA |
| 4 | MOTORISTA DISPONIVEL | tabela | MOTORISTA · **PERFIL** · TELEFONE · ROTA / REGIÃO |
| 5 | SOLICITAÇÃO DE BLOQUEIO DE MOTORISTA | cartão | MOTORISTA · ROTA · OCORRÊNCIA |

A numeração está quebrada na planilha — `1, 3, 4, 4, 4, 5`. Não há seção 2. É sintoma de planilha
copiada e editada à mão, e some sozinho quando as seções virarem estrutura.

**SPOT** — resumo: `Spot Aceito` · `Spot Não Aceito` · `Spot Aceito por outra 3PL` ·
`Tendência Aceita` · `Tendência Não Aceita` · `Tendência Aceita por outra 3PL`

| # | seção | forma | campos |
|---|---|---|---|
| 1 | SPOTS ACEITOS | tabela | LH · ORIGEM · DESTINO · ETA ORIGEM · MOTORISTA |
| 2 | SPOT PERDIDO / ACEITO POR OUTRA 3PL | tabela | LH · ORIGEM · DESTINO · DATA CRIAÇÃO · OCORRÊNCIA |
| 1 | TENDÊNCIA ACEITA | tabela | idem SPOTS ACEITOS |
| 2 | TENDÊNCIA PERDIDO / ACEITO POR OUTRA 3PL | tabela | idem SPOT PERDIDO |

**EMISSÃO** — resumo: `LH sem CTe` · `CTe não emitido` · `CTe emitido` · `Viagem sem Adiantamento` ·
`Placas Divergentes`

| # | seção | forma | campos |
|---|---|---|---|
| 1 | EMISSÕES NÃO REALIZADAS | cartão | LH · ORIGEM · DESTINO · PERFIL · OCORRÊNCIA |
| 2 | ACORDO DE FRETE | cartão | LH · ORIGEM · DESTINO · VALOR · RESPONSÁVEL · OCORRÊNCIA |
| 3 | OCORRÊNCIAS PARA O PRÓXIMO TURNO | cartão | LH · ORIGEM · DESTINO · MOTORISTA · OCORRÊNCIA |

**GR** — resumo: `SM sem realização antes de 2h` · `Sem Espelhamento` · `Veículo sem SM` ·
`Cadastros Realizados (Motorista, Cavalo, Truck e Carreta)` · `Cadastros Pendentes (Motorista)` ·
`Cadastros Reprovados (Motorista)` · `Bloqueios` · `PR Acionados`

| # | seção | forma | campos |
|---|---|---|---|
| 1 | VIAGENS EM SITUAÇÃO CRÍTICA | cartão | LH · ORIGEM · DESTINO · OCORRÊNCIA |
| 2 | VIAGENS COM PENDÊNCIA DE RASTREAMENTO | tabela | LH · PLACA · ORIGEM · DESTINO · RESPONSÁVEL · **OCORRÊNCIA** |
| 3 | PRONTA RESPOSTA — ACIONAMENTOS | tabela | LH · PLACA · ORIGEM · DESTINO · HORÁRIO ACIONAMENTO · **OCORRÊNCIA** |

**Monitoring** — resumo: `Quebra de Veiculo` · `Retido no Posto Fiscal` · `EARLY` · `DELAY` ·
`ON TIME` · `Veiculo sem espelhamento`

| # | seção | forma | campos |
|---|---|---|---|
| 1 | VIAGENS EM SITUAÇÃO CRÍTICA | cartão | LH · ORIGEM · DESTINO · MOTORISTA · **OCORRÊNCIA** |
| 2 | ROTAS EM ACOMPANHAMENTO | cartão | ROTA · **ETA DESTINO** · MOTORISTA · OCORRÊNCIA |
| 3 | SOLICITAÇÃO DE BLOQUEIO DE MOTORISTA | cartão | MOTORISTA · ROTA · OCORRÊNCIA |

### As listas suspensas

Estão no arquivo, não na tela — só apareceram ao abrir o `.xlsx`. São a **taxonomia que a operação
já usa**, e não se inventa outra:

| campo | valores |
|---|---|
| OCORRÊNCIA · rotas sem atribuição | `Sem Confirmação` · `Sem Atribuição` |
| OCORRÊNCIA · rastreamento e PR (GR) | `Checklist não realizado` · `Sem rastreamento` · `Sem SM / motorista acionado` |
| ~~OCORRÊNCIA · crítica (Monitoring)~~ | **soltada em 27/08 a pedido do setor** — ver abaixo |
| STATUS · bonificação | `Recebido` · `Aguardando chave` (a planilha não trava; aqui trava) |
| ETA DESTINO | `EARLY` · `ON TIME` · `DELAY` |
| PERFIL | `CARRETA` · `TRUCK` |

Todo o resto da OCORRÊNCIA é texto livre.

**A ocorrência da viagem crítica do Monitoring passou a ser livre (27/08).** O conteúdo real ali é
prosa — o exemplo de 25/08 tem noventa caracteres — e nenhuma das quatro opções diria aquilo. A trava
obrigava a escolher um rótulo aproximado e jogava fora o que de fato aconteceu.

As listas do GR **ficam**: lá o campo classifica um MOTIVO de um conjunto fechado, e classificação em
texto livre vira quatro grafias da mesma coisa. A regra que separa as duas: **relato pede liberdade,
estado e motivo pedem lista** — e é por isso que o STATUS da bonificação virou lista mesmo a planilha
não travando.

### Uma diferença entre T1 e T2 que precisa de resposta

No setor GR os dois turnos **não** têm o mesmo resumo:

| T1 (diurno) | T2 (noturno) |
|---|---|
| SM sem realização antes de **2h** | SM sem realização antes de **24h** |
| **Bloqueios** | **Desbloqueios** |

`Bloqueios` × `Desbloqueios` parece deliberado — o noturno desbloqueia o que o diurno bloqueou.
`2h` × `24h` parece engano de cópia. **Pergunta em aberto para o setor GR**, e a resposta muda se o
contador é um só ou dois.

---

## 2. O que o TMS apura sozinho

É aqui que trazer isto para dentro vale mais do que copiar a planilha: parte do `RESUMO DA OPERAÇÃO`
é **contagem de coisa que já está no banco**, e hoje alguém conta à mão, de madrugada.

**Mas só parte.** A primeira versão deste documento marcava quinze contadores como apuráveis, por
otimismo. Conferindo coluna por coluna, **quatro** têm dado confiável atrás. Os outros onze
mostrariam ZERO com cara de número apurado — que é a pior saída possível num resumo de turno:
ninguém desconfia de um zero, e o erro só apareceria quando alguém agisse em cima dele.

### Os quatro que o TMS apura

| contador | de onde |
|---|---|
| No Show | `trip_programacao.status = NO_SHOW` (migração 0051) |
| Pendente de Confirmação | `trip_programacao.status` em `A_ENVIAR` ou `ENVIADO` |
| Sem Atribuição | `trips.current_status = received` — antes de `assigned` |
| Cancelamento | `trips.current_status = cancelled` |

Todos da Programação, recortados pela **janela de coleta planejada** que cai dentro do turno — o
mesmo campo que a Minha Programação usa para dizer o que é de hoje.

### Os que continuam digitados, e o que falta para promovê-los

| contador | o que falta |
|---|---|
| ETA ORIGEM (DELAY) · EARLY / ON TIME / DELAY | a chegada REAL. Existe em `trip_events`, mas depende de o portal ter publicado o marco — e uma viagem sem o evento seria contada como pontual, que é o erro mais caro possível aqui |
| Spot Aceito / Não Aceito | `spot_offers` guarda a oferta, não o desfecho; o vínculo com `trips` é nome de estação, não chave |
| Cadastros Pendentes / Reprovados | `resource_status` tem active/inactive/unavailable/maintenance/blocked — não tem "pendente" nem "reprovado". Contar `inactive` misturaria os dois: em 18/08, 70% do cadastro nasceu inativo por importação |
| Sem Espelhamento · Veículo sem SM | a gerenciadora monitora ~91 veículos e o portal tem 936 placas: ausência em `logae_positions` não distingue "sem espelhamento" de "fora da frota monitorada" |
| CTe · Adiantamento · Placas divergentes | o TMS não tem emissão |
| PR Acionados · Bloqueios · Quebra · Posto Fiscal | acontecem fora do sistema |

Cada uma dessas razões está gravada no campo `pendencia` do catálogo, e **aparece na tela** num ⓘ ao
lado do contador — explica a quem preenche por que conta à mão este e não aquele. O que parece
arbitrário é o que as pessoas param de respeitar.

Um teste (`bloco.test.ts`) cruza as duas listas nos dois sentidos: promover um contador sem
implementar a apuração, ou implementar sem promover, quebra a CI.

### O override

O contador apurado **continua aceitando valor digitado** — quem está no turno pode saber de algo que
o banco ainda não viu. Quando isso acontece o digitado vale e a tela mostra **os dois**, com o do
sistema riscado ao lado. Um resumo que discorda do banco em silêncio é pior que resumo nenhum.

---

## 3. Setor não é cargo

O TMS já tem `app_role` com oito valores (`admin`, `operations_manager`, `dispatcher`,
`control_tower`, `fleet_coordinator`, `finance`, `executive_viewer`, `customer_viewer`) e um
catálogo estático de permissões em `packages/shared/src/auth/permissions.ts`.

`SETOR` **não é** mais um desses. O papel diz *o que a pessoa pode fazer no TMS* — atribuir,
importar, cancelar. O setor diz *qual faixa da passagem de turno ela responde*. Um `dispatcher` pode
estar em PROGRAMAÇÃO ou em SPOT, e um `control_tower` em GR ou em Monitoring. Somar as duas coisas
num enum só multiplicaria os papéis por cinco e quebraria a matriz de permissões inteira.

Então: **um campo novo, ortogonal ao papel** — `users.setor`, com os cinco valores da planilha. Só
quem tem o setor edita a faixa daquele setor; todo mundo lê tudo. `admin` edita qualquer uma.

Fica uma pergunta: **uma pessoa pode ter mais de um setor?** No papel de hoje, cada faixa tem um
`ASSISTENTE` e um `SUPERVISOR` — dois nomes, um setor. Se for sempre um, o campo é simples; se
puder ser mais de um, vira tabela de vínculo. Não dá para descobrir isso lendo a planilha.

---

## 4. A linha do tempo

"Todo dia gera um relatório novo e o antigo fica registrado" — na planilha isso é uma aba por dia,
criada à mão, e por isso só existem oito.

No TMS o relatório do dia **não se cria**: ele já existe, vazio, porque a chave é
`(data, turno, setor)`. Quem abre a página no dia 27 encontra o bloco do seu setor pronto para
escrever. Não há botão de "gerar".

O que **fecha** é o turno: às 19h o T1 entrega ao T2, às 7h o T2 entrega ao T1. Depois de fechado o
bloco vira somente-leitura e entra na linha do tempo. Isso é o que dá sentido a
`3. OCORRÊNCIAS PARA O PRÓXIMO TURNO` — a seção existe justamente porque há uma entrega.

**Pergunta:** fechar é botão que alguém aperta, ou é a hora que fecha sozinho? O botão registra
quem entregou (que é o que a planilha tenta fazer com `ASSISTENTE` / `SUPERVISOR`); a hora não
esquece. Sugiro **botão, com fechamento automático de segurança** algumas horas depois — assim
ninguém deixa o turno aberto por três dias e ninguém perde o registro de quem passou.

Fuso `America/Sao_Paulo` para decidir a que turno pertence "agora" — nunca UTC. Às 19h de Brasília
o T1 fecha; em UTC isso é 22h e a virada cairia no dia errado.

---

## 5. O que fica fora

- Importar as oito abas que já existem. São oito dias de histórico de uma planilha em uso; o valor
  está no que vem daqui para frente. Se for para trazer, é tarefa separada e depois.
- Emissão de CTe e adiantamento — o TMS não tem isso, e os contadores de EMISSÃO continuam
  digitados até ter.
- Exportar de volta para Excel.

---

## 6. As decisões, e como ficaram

Tomadas com o usuário em 26/08:

| pergunta | resposta | onde ficou |
|---|---|---|
| Uma pessoa tem um setor ou vários? | **Um só** | `users.setor`, coluna simples. Vira tabela de vínculo se um dia mudar — o caminho é aditivo |
| Fechar o turno é botão ou hora? | **Botão, com trava automática depois** | `fecharBloco` no botão; o job `turno.fechar_atrasados` fecha o que passou de um dia, marcando `fechado_automaticamente` |
| GR: `2h` × `24h` é real ou engano? | **Não se sabe — pergunta em aberto com o GR** | os dois turnos guardam contadores próprios, como a planilha faz hoje. Um teste avisa se alguém "arrumar" isso sem perguntar |
| Os cinco setores são todos? | **São esses cinco** | lista fechada, com `CHECK` no banco |

### O que ficou pendente

**A pergunta do GR.** `Bloqueios` × `Desbloqueios` parece deliberado — o noturno desbloqueia o que o
diurno bloqueou. O `2h` × `24h` parece engano de cópia. Enquanto não há resposta, os dois turnos
guardam contadores independentes: se vier "era engano", some um dos dois e o outro continua com os
mesmos dados.

---

## 7. Como ficou, em arquivos

| camada | arquivo |
|---|---|
| o catálogo dos cinco setores | `packages/shared/src/domain/passagem-de-turno.ts` |
| a migração | `packages/db/migrations/0054_passagem_de_turno.sql` |
| as três tabelas | `packages/db/schema/passagem-de-turno.ts` |
| ler e escrever | `packages/db/src/passagem-de-turno/bloco.ts` |
| a guarda de setor | `apps/web/lib/passagem-de-turno/guarda.ts` |
| as rotas | `apps/web/app/api/passagem-de-turno/` |
| a tela | `apps/web/components/passagem-de-turno/` |
| a trava automática | `workers/jobs/turno/index.ts` |

---

## 8. O preenchimento automático (27/08)

Digitou a LH e saiu do campo: **origem, destino, ETA da coleta, motorista, placa, rota e perfil**
aparecem. Na planilha isso são seis campos copiados do portal, um por um.

### De onde sai cada campo

| campo | fonte |
|---|---|
| origem · destino | `locations.name` da viagem — ou as duas pontas de `spot_offers.route` |
| eta_origem | `planned_pickup_window_start`, formatado **em São Paulo pelo Postgres** |
| motorista | `drivers.name`, pela ordem de atribuição mais recente do portal |
| placa | `portal_commands.plates` |
| rota | `ORIGEM X DESTINO`, como a planilha escreve |
| perfil | `vehicles.vehicle_type` da primeira placa, traduzido por articulação |
| data_criacao | `spot_offers.created_at_portal` |
| telefone | `drivers.phone`, a partir do nome — e só quando casa com **um** motorista |

### Onde ele funciona

**Catorze das vinte seções** têm campo de LH e portanto ganham o preenchimento. As **seis** que não
ganham não são esquecimento: elas não partem de uma viagem.

| seção sem preenchimento | por quê |
|---|---|
| Programação · No show | parte do MOTORISTA, e um motorista tem muitas viagens |
| Programação · Motorista disponível | idem — mas ganha o **telefone** pelo nome |
| Programação · Bloqueio de motorista | idem |
| Monitoring · Rotas em acompanhamento | parte da ROTA, não de uma LH |
| Monitoring · Bloqueio de motorista | parte do motorista |
| Monitoring · Bonificação | é uma lista de pessoas, não de viagens |

### O que continua digitado, mesmo nas seções que preenchem

`ocorrência` (é o relato — o motivo de a seção existir) · `responsável` · `valor` do acordo de
frete · `horário do acionamento` · `ETA destino` (é julgamento: EARLY/ON TIME/DELAY).

### As três regras que mantêm isso confiável

**Nunca sobrescreve.** Só preenche campo VAZIO. O campo digitado é o que alguém decidiu, muitas
vezes de propósito diferente do cadastro — a origem que o motorista relatou, o destino que mudou por
telefone e ainda não voltou ao portal. Sobrescrever apagaria justamente o que o turno sabia e o
sistema não, no instante em que a pessoa sai do campo.

**Duas fontes, nesta ordem: viagem, depois oferta de spot.** Boa parte das LHs que o setor SPOT
registra são ofertas que nunca viraram viagem — a seção "spot perdido / aceito por outra 3PL" é
exatamente sobre elas. Procurar só em `trips` deixaria mudo o setor que mais digita.

**LH que não existe é dita na hora.** O campo ganha um anel vermelho e explica. Quase sempre é erro
de digitação, e uma ocorrência registrada na viagem errada é pior que ocorrência nenhuma. Nome de
motorista que não casa **não** avisa: homônimo é o normal, e a regra é recusar quando dois batem.

### Duas armadilhas que apareceram no caminho

**`unaccent` não existe neste banco.** A comparação de nome de motorista seria
`unaccent(lower(name)) = unaccent(lower($1))` — e nenhuma migração roda `CREATE EXTENSION`. A
consulta falharia em produção, no primeiro uso, como a da Programação falhou em 26/08. A dobra de
acento ficou em JavaScript, com teste.

**A ETA é formatada pelo Postgres, não pela tela.** `to_char(... at time zone 'America/Sao_Paulo')`.
Formatar no navegador usaria o relógio de quem abriu — e um notebook em UTC gravaria três horas a
menos numa anotação que outra pessoa vai ler noutro turno.
