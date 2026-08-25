# Proposta — a aba GR, onde a Pré-SM é feita

**Estado: proposta.** Nada implementado. Substitui o desenho central da fatia 026, que continua no
`dev` mas **não deve ser promovido** como está. Ver `specs/026-pre-sm-logae/`.

Escrito em 2026-08-25, depois de ver a tela da Logae ao vivo e receber a resposta deles.

---

## O que mudou, e por quê

A 026 foi escrita sem ninguém ter visto a tela onde a operação gera Pré-SM hoje. Duas coisas
apareceram quando vimos.

**A gerenciadora respondeu que tem de ser pelo `setPreSM`.** Perguntamos se a Pré-SM criada pela API
fica vinculada à programação que já está no eTorre; a resposta foi *"Tem que ser pelo setPreSM"*. A
026 usa `setPreSMdeModelo`, escolhido justamente para evitar o outro.

**E a criação não deve ser automática — deve ser uma fila.** Decisão do usuário: a LH atribuída cai
numa aba nova, **GR**, e é lá que a Pré-SM é feita.

## Por que a fila é melhor do que o automático

Três problemas do desenho anterior somem sozinhos.

**O `sem_dados` deixa de ser silêncio.** Hoje, uma viagem sem CPF vira uma linha que alguém precisa
ir procurar dentro da viagem. Na aba GR ela **é** a fila: aparece dizendo o que falta.

**O gasto ganha um dono.** A gerenciadora cobra por solicitação e não há homologação para nós. Uma
pessoa apertando "Enviar" é uma trava melhor do que o teto diário inventado na 026 — e resolve o
requisito de a primeira criação real ser deliberada.

**E o que não casou vira trabalho visível.** Rota sem `CodRota`, cidade sem IBGE, motorista sem
vínculo: tudo aparece na fila em vez de a viagem cair fora sem aviso.

## Como funciona

A aba lista as LHs **atribuídas que ainda não têm Pré-SM**, e mostra o que será enviado:

```
LT0Q8Q02EMND1  ·  BETIM → GUARUJÁ  ·  coleta 26/08 16:00
   PVY4J73 (agregado)  +  TYJ8C07 (—)   ·   MARCIO DE OLIVEIRA BARBOSA (agregado)
   ⚠ falta o vínculo da carreta                              [ Enviar Pré-SM ]
```

Com tudo resolvido, o botão fica disponível. Faltando algo, ele fica travado e a linha diz **o quê**,
com caminho para resolver. Depois de enviada, a linha mostra o código e o botão vira "Cancelar".

### As três decisões de uso (usuário, 25/08)

**Uma por uma, sem lote.** Cada envio é uma decisão consciente, e um engano custa uma solicitação —
não vinte. O lote pode entrar depois, se a fila crescer.

**A viagem FICA na aba depois de enviada**, numa seção de já enviadas, com o código e o botão de
cancelar. É onde se vê que a atribuição mudou depois de a escolta já estar contratada.

**A criação automática fica guardada, desligada.** O job da 026 continua no código com o interruptor
ausente. Quando a aba rodar por um tempo e houver confiança, dá para ligá-la só para as viagens sem
nada faltando.

---

## O que o `setPreSM` exige, e de onde sai

Conferido na referência extraída do manual (`docs/INTEGRA-14.2-REFERENCIA.md`).

| Campo | De onde sai | Situação |
|---|---|---|
| `PlacaVeiculo`, `PlacaCarreta1..3` | `portal_commands.plates` | **pronto** |
| `CPFMotorista1`, `CPFMotorista2` | cadastro de motoristas | **pronto** (81% têm CPF) |
| `VincVeiculo`, `VincMotorista1`, `VincCarreta1` | diálogo de atribuição | **pronto** (fatia 026) |
| `DataHoraChegada` / `DataHoraSaida` | janelas de coleta e entrega | **pronto** |
| `Tipo` (COLETA / ENTREGA) | a viagem tem os dois lados | **pronto** |
| `CodFilial` | `getCliente` | constante, falta buscar |
| `CodPerfilSeguranca` | `getTabela` — é o `DDR SHOPEE` da tela | constante, falta buscar |
| `CodIBGECidade` da coleta e da entrega | `getCidades` | **falta a ponte** |
| `CodRota` | `getRotas` | **falta a ponte** |

Só duas peças novas. As duas são o mesmo tipo de trabalho já feito na 026 para modelos.

### A ponte de cidade

Das 228 estações, **8 têm cidade preenchida** e 71 têm UF — medido em produção. Parece bloqueante e
não é: o nome da estação carrega os dois.

```
SOC_MG_BETIM                    → MG · Betim
LM HUB_TO_PALMAS                → TO · Palmas
SOC_PE_JABOATÃO DOS GUARARAPES  → PE · Jaboatão dos Guararapes
```

É o mesmo padrão que `tokensDaEstacao` já separa — hoje ele **descarta** tudo até a UF, para casar
nomes. Passa a guardar. Daí `getCidades` devolve o IBGE, uma pessoa confere, e vira tabela fixa:
**228 linhas, uma vez.** Estação nova entra pelo mesmo caminho.

### A ponte de rota

Com os dois IBGE em mãos, `getRotas(origem, destino)` devolve o `CodRota`. A tela de conferência da
026 continua servindo — muda o número na coluna, de `CodModelo` para `CodRota`. As mesmas ~80 rotas.

---

## O que sobrevive da 026

Quase tudo, e é por isso que isto é meia fatia e não uma nova.

**Sobrevive:** o vínculo A/F/T e sua migração · o job e o interruptor (guardados, desligados) · o
cancelamento (`setCancelaPreSM`) · o estado por viagem em `trip_pre_sm` · o aviso de divergência · o
índice único parcial · a tela de conferência de rotas · o cliente da Integra e seu tratamento de
`CodErro`.

**Morre:** o `setPreSMdeModelo` no cliente · o catálogo de 89 modelos (`getModelosPreSM`) e a carga
que o preenche.

**Muda:** o montador do corpo (`montarCorpoDaPreSM`) passa a montar o `setPreSM` completo.

---

## O que ainda não se sabe

**Como o `setPreSM` amarra à programação do eTorre.** A resposta da gerenciadora foi curta, e **não
há campo de código de programação no `setPreSM` também** — conferido na referência. Ou ele amarra
por placa e data, ou há algo que não reconhecemos.

Pergunta pendente para a Logae:

> No `setPreSM`, qual campo faz o vínculo com a programação do eTorre? Não encontramos um campo de
> código da programação — é pela placa e data da coleta?

**Isto não bloqueia a aba GR**, que é necessária de qualquer forma. Bloqueia só o formato exato do
corpo enviado — e é a diferença entre refazer certo e refazer duas vezes.
