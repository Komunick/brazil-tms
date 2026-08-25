# Proposta — criar a Pré-SM na Logae ao atribuir

**Estado: proposta. Nada implementado.** Escrita em 2026-08-25 a pedido, para decidir *se* e *como*
antes de escrever código. Os números vêm de medições em produção feitas no mesmo dia; onde eu chuto,
digo que estou chutando.

## O problema

Depois que a atribuição chega ao portal do cliente, alguém abre o sistema da Logae e cria a
solicitação de monitoramento **à mão** — redigitando motorista, placas e horário de coleta que já
foram digitados no TMS. É retrabalho, e é onde entra erro de digitação num dado que a escolta usa.

## O que a API da Logae oferece

A Integra 14.2 tem o ciclo inteiro da Pré-SM, não só a criação:

| Método | O que faz |
|---|---|
| `setPreSM` | Inclui ou altera uma pré-solicitação, com rota, coletas e entregas completas |
| **`setPreSMdeModelo`** | Cria a partir do código de um **modelo** já cadastrado |
| `getModelosPreSM` | Lista os modelos |
| `getPreSM` | Consulta uma Pré-SM pelo código |
| `setEfetivaPreSM` | Converte a Pré-SM em SM de verdade |
| `getStatusPreSM` | Status atual |
| `setCancelaPreSM` | Cancela uma ainda não efetivada |
| `getConsultaPreSMAberta` | Lista as que não foram efetivadas |

Endereço: `https://integra.logae.com.br/datasnap/rest/TWebService/"<metodo>"` — o nome do método vai
**entre aspas** na URL (`%22` quando escapado). Login e senha vão no corpo, junto com
`Ambiente` (`Producao`/`Homologacao`) e `TipoRetorno` (`JSON`/`XML`).

O retorno traz `CodErro` (zero = sem erro) e `MsgErro`.

## Por que `setPreSMdeModelo`, e não `setPreSM`

O `setPreSM` completo exige rota, coletas e entregas com **código IBGE de cada cidade**, cliente,
filial, agência e perfil de segurança. Isso é um espelho do cadastro da Logae que passaríamos a
manter — e que divergiria dentro de um mês.

O `setPreSMdeModelo` pede só o que muda a cada viagem, e **é exatamente o que a atribuição produz**:

| Campo que a Logae pede | De onde sai no TMS |
|---|---|
| `CodModelo` | o modelo da rota (ver abaixo) |
| `PlacaVeiculo` + `VincVeiculo` | placa do portal · **vínculo não temos** |
| `CPFMotorista1` + `VincMotorista1` | nosso cadastro, pelo id do portal · **vínculo não temos** |
| `CPFMotorista2` + `VincMotorista2` | 2º motorista (opcional) |
| `PlacaCarreta1..3` + vínculo | placas da carreta |
| `Chegada1aColeta` / `Saida1aColeta` | "ETA ORIGEM" e "CPT ORIGEM" |
| `Documentos` | opcional — não usaríamos no começo |

O encaixe mais forte é que a fila `portal_commands` **já carrega** `driver_id`, `second_driver_id` e
`plates`, gravados no mesmo instante em que a pessoa atribui. O gatilho não precisa inventar dado
nenhum: ele lê a ordem que já existe.

## O que foi medido em produção (2026-08-25)

**Os modelos já existem, e são nossos.** O `getModelosPreSM` devolveu **89** modelos cadastrados —
`JABOATÃO X RECIFE OLINDA`, `PALMAS X GOIANIA (AEROPORTO)`, `LOUVEIRA X CAMPINAS`,
`CAMPO MOURÃO X CURITIBA`. Cruzando com as 138 rotas que rodamos nos últimos 30 dias:

| | rotas | viagens |
|---|---|---|
| têm modelo | **81** | **3.789 (84%)** |
| sem modelo | 57 | 714 (16%) |

O casamento é por nome de estação, e precisa das mesmas tolerâncias do filtro de spot: sem acento,
sem o que está entre parênteses, com a sigla separada do número (`ARACAJU02` = `ARACAJU 02`) e com o
zero à esquerda descartado (`ARACAJU 02` = `ARACAJU 2`). Sem a última, 4 rotas e 233 viagens caíam
como "sem modelo" por causa de um zero — foi assim que eu errei a primeira contagem.

**Os dados da viagem estão lá.** Nas 4.097 viagens com motorista atribuído no portal nos últimos
7 dias:

| | |
|---|---|
| casaram com o nosso cadastro de motorista | 4.097 (100%) |
| têm CPF válido de 11 dígitos | **3.312 (81%)** |
| têm placa do portal | 4.097 (100%) |
| têm a janela de coleta | 4.097 (100%) |

## As três decisões que não são de programação

### 1. O vínculo A/F/T — o único bloqueio real

`VincVeiculo` e `VincMotorista1` são **obrigatórios**: `A` (agregado), `F` (frota/funcionário) ou
`T` (terceiro/autônomo). **Esse campo não existe no nosso cadastro**, e sem ele a chamada é recusada.

A tentação é derivar da transportadora. Medi, e **não funciona**: temos duas transportadoras, e a
que mais rodou nos últimos 30 dias chama-se `Transportes Parceiros (Demo)`, com **179 veículos em
viagem real**. O nome sugere semente de instalação, mas o uso diz que não é — vieram parar ali por
padrão, não por classificação. A outra, `Agregados`, com 162 veículos, essa sim casa com `A`. E 17
veículos rodaram sem transportadora nenhuma.

Então há três caminhos, e a escolha é do negócio:

- **(a)** Um campo novo `vinculo` em `vehicles` e `drivers`, preenchido uma vez. É o certo a longo
  prazo, e custa uma passada no cadastro.
- **(b)** Arrumar as transportadoras primeiro (a "(Demo)" deixa de ser lixo de semente e vira a
  classificação real) e derivar dela. Menos campo novo, mais limpeza.
- **(c)** Assumir `A` para todo mundo no começo. **Não recomendo**: um vínculo errado na SM é
  informação errada para quem faz escolta, e o erro fica silencioso.

### 2. Os 19% sem CPF

Sem `CPFMotorista1` a Pré-SM não sai. São 785 das 4.097 viagens medidas. O robô de motoristas já
preenche o CPF quando o portal libera (há cota de dados pessoais), então o número tende a melhorar
sozinho — mas a proposta precisa dizer o que fazer enquanto não melhora. Sugestão: **não criar, e
avisar na tela** que faltou o CPF daquele motorista, com link para o cadastro. Falhar em silêncio
seria repetir o defeito que a Minha Programação teve.

### 3. Os 16% sem modelo

Duas saídas: cadastrar os modelos que faltam na Logae (é trabalho de cadastro, não de código), ou
cair no `setPreSM` completo nessas rotas — o que traz de volta o espelho de cidades e IBGE.

Sugestão: **cadastrar os modelos**, e começar pelos doze de cima. Eles somam 641 das 714 viagens
sem modelo; as outras 45 rotas juntas dão 73 viagens no mês, e podem esperar.

| viagens/30d | origem | destino |
|---:|---|---|
| 125 | SOC_BA_SIMOES FILHO | SOC_PE_JABOATÃO DOS GUARARAPES |
| 116 | SOC_RJ_DUQUE DE CAXIAS | SOC_CE_ITAITINGA |
| 110 | SOC_SP_SÃO BERNARDO DO CAMPO | LM HUB_SP_GUARUJÁ |
| 84 | SOC_PE_JABOATÃO DOS GUARARAPES | LM Hub_PE_Recife_Imbiribeira |
| 49 | FM HUB_SE_ARACAJU02 | SOC_SP_SÃO BERNARDO DO CAMPO |
| 46 | LM HUB_MG_BELO HORIZONTE_02 | LM HUB_MG_BELO HORIZONTE_02 |
| 46 | SOC_RJ_DUQUE DE CAXIAS | LM HUB_MG_BELO HORIZONTE_02 |
| 18 | XPT_MG_LEOPOLDINA_03 | SOC_RJ_RIO DE JANEIRO (S. J. MERITI) |
| 13 | SOC_RJ_RIO DE JANEIRO (S. J. MERITI) | XPT_MG_CARATINGA |
| 13 | LM HUB_PE_RECIFE_OLINDA | SOC_PE_JABOATÃO DOS GUARARAPES |
| 11 | LM Hub_PE_Recife_Imbiribeira | SOC_PE_JABOATÃO DOS GUARARAPES |
| 10 | SOC_PE_JABOATÃO DOS GUARARAPES | SOC_BA_SIMOES FILHO |

Uma dessas merece olho antes de virar modelo: `LM HUB_MG_BELO HORIZONTE_02 → LM HUB_MG_BELO
HORIZONTE_02`, com origem igual ao destino em 46 viagens. Ou é dado errado no portal, ou é uma
operação interna que não precisa de SM.

## Como entraria no fluxo

O gatilho natural é o encerramento da ordem do portal: quando o robô de ações devolve `done` para uma
ordem de `assign`, a atribuição existe **dos dois lados** e todos os campos estão disponíveis. Antes
disso não — criar a Pré-SM de uma atribuição que o portal recusou geraria SM órfã.

Isso põe o trabalho no worker, não na rota do BFF: é chamada a sistema de terceiro, que pode demorar
ou cair, e a tela de quem atribui não deve esperar por ela. A fila do `pg-boss` já existe e já é
onde as ordens do portal vivem.

A Pré-SM ficaria **pré**, sem efetivar. `setEfetivaPreSM` é uma segunda decisão — e converter
automaticamente tiraria da operação a chance de conferir antes de a escolta começar a contar. Se
depois se provar que a conferência nunca muda nada, aí se automatiza.

O código da Pré-SM devolvido precisa ser guardado junto da viagem, senão não há como consultar
status, alterar ou cancelar depois.

## O que fica de fora

Documentos na Pré-SM, o segundo ajudante, faixa de temperatura, `setPreSM` completo, efetivação
automática, e qualquer coisa sobre SM já em andamento (`setCancelaSM`, `setFinalizaSM`).

## Próximo passo

Decidir o item 1 (o vínculo). Os outros dois têm sugestão e podem seguir com ela. Com o vínculo
resolvido, isto vira uma feature do Spec Kit — `/speckit-specify`, referenciando este documento.
