# Integra 14.2 — referência dos métodos (extraída do manual da Logae)

> **Gerado por extração**, não digitado à mão. A fonte é o PDF `Integra_14.2.html`
> (versão 14.0, 22/10/2025), convertido pelo `pdf2htmlEX`. O script de extração está em
> `scripts/integra-referencia/`.
>
> **Isto não substitui o manual em caso de dúvida.** A extração recupera as tabelas pela
> posição do texto na página, e o manual tem erros próprios — a resposta do
> `setPreSMdeModelo`, por exemplo, declara `setEfetivaPreSM` no campo `Metodo`.

Endereço: `https://integra.logae.com.br/datasnap/rest/TWebService/"<metodo>"` — o nome do
método vai **entre aspas** na URL (`%22` escapado). POST com JSON. Todo corpo leva
`Ambiente`, `Login`, `Senha` e `TipoRetorno`.

Toda resposta traz `CodErro` (**zero = sem erro**) e `MsgErro`, sob `result[0]`. O código
HTTP é sempre 200 — **o erro nunca está nele**.

Extraídos **53** dos **58** métodos que o índice do manual lista.

### Os que a extração NÃO recuperou

Ficam de fora porque a seção deles começa na mesma página da anterior, e o extrator
não tem como separar as duas. **Para estes, o manual é a única fonte:**

- `getCidades`
- `getDocumentoPesquisaConsulta`
- `getModelosPreSM`
- `setCliente`
- `setProprietario`
- `setRejeitarProgramacaoCargas`
- `setTrocaCarreta`

Estar nesta lista é o desfecho bom — o ruim seria aparecerem com os campos de outro
método, e é por isso que o extrator prefere omitir a adivinhar.

## Índice

- [`getPosicoes`](#getposicoes) — pág. 16
- [`getPosicoesCliente`](#getposicoescliente) — pág. 18
- [`getMensagens`](#getmensagens) — pág. 19
- [`getTabela`](#gettabela) — pág. 21
- [`getProprietario`](#getproprietario) — pág. 27
- [`getCliente`](#getcliente) — pág. 32
- [`getVeiculo`](#getveiculo) — pág. 37
- [`setVeiculo`](#setveiculo) — pág. 40
- [`getCarreta`](#getcarreta) — pág. 45
- [`setCarreta`](#setcarreta) — pág. 48
- [`getMotorista`](#getmotorista) — pág. 52
- [`setVeiculoEscolta`](#setveiculoescolta) — pág. 59
- [`setAgenteEscolta`](#setagenteescolta) — pág. 61
- [`getCadLocalizadores`](#getcadlocalizadores) — pág. 63
- [`getRotas`](#getrotas) — pág. 64
- [`GetRotograma`](#getrotograma) — pág. 67
- [`setPreSM`](#setpresm) — pág. 70
- [`setAgendamentoViagem`](#setagendamentoviagem) — pág. 86
- [`setSituacaoCargaViagem`](#setsituacaocargaviagem) — pág. 88
- [`getPreSM`](#getpresm) — pág. 89
- [`setEfetivaPreSM`](#setefetivapresm) — pág. 90
- [`getStatusViagem`](#getstatusviagem) — pág. 90
- [`setCancelaPreSM`](#setcancelapresm) — pág. 95
- [`getConsultaPreSMAberta`](#getconsultapresmaberta) — pág. 96
- [`getStatusPreSM`](#getstatuspresm) — pág. 98
- [`getStatusColetas`](#getstatuscoletas) — pág. 99
- [`getEventoFimViagem`](#geteventofimviagem) — pág. 101
- [`setCancelaSM`](#setcancelasm) — pág. 107
- [`setFinalizaSM`](#setfinalizasm) — pág. 108
- [`getImpressaoSM`](#getimpressaosm) — pág. 110
- [`setRevisaoPreSm`](#setrevisaopresm) — pág. 111
- [`setIncluirDocumentoViagem`](#setincluirdocumentoviagem) — pág. 122
- [`setPreSMdeModelo`](#setpresmdemodelo) — pág. 124
- [`setEngate`](#setengate) — pág. 128
- [`setTrocaMotorista`](#settrocamotorista) — pág. 130
- [`setTrocaVeiculo`](#settrocaveiculo) — pág. 132
- [`setConjunto`](#setconjunto) — pág. 136
- [`setSolicitacaoPesquisaConsulta`](#setsolicitacaopesquisaconsulta) — pág. 144
- [`setSolicitacaoPesquisaConsultaConjunto`](#setsolicitacaopesquisaconsultaconjunto) — pág. 147
- [`getResultadoPesquisaConsulta`](#getresultadopesquisaconsulta) — pág. 150
- [`getResultadoPesquisaConsultaConjunto`](#getresultadopesquisaconsultaconjunto) — pág. 153
- [`getGerarResultadoCheckList`](#getgerarresultadochecklist) — pág. 157
- [`setIncluirCheckList`](#setincluirchecklist) — pág. 158
- [`getHistoricoTestes`](#gethistoricotestes) — pág. 161
- [`getOcorrenciasLogisticas`](#getocorrenciaslogisticas) — pág. 162
- [`setProgramacaoCargas`](#setprogramacaocargas) — pág. 163
- [`getProgramacaoCargas`](#getprogramacaocargas) — pág. 172
- [`getListaProgramacaoCargas`](#getlistaprogramacaocargas) — pág. 176
- [`setAceitarProgramacaoCargas`](#setaceitarprogramacaocargas) — pág. 180
- [`setEventos`](#seteventos) — pág. 181
- [`setCancelamentoProgramacaoCargas`](#setcancelamentoprogramacaocargas) — pág. 181
- [`setFaixaTemperatura`](#setfaixatemperatura) — pág. 182
- [`getKMRodado`](#getkmrodado) — pág. 184

---

## getPosicoes

Página 16 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | Formato dos dados retornados: ‘JSON’ ou ‘XML’ |
| `TipoConsulta` | T — texto | 9 | **sim** | Opções ‘Primeiras’: buscar as primeiras 500 posições encontradas no banco limitado a 72 horas ‘Proximas’: buscar as próximas 500 posições depois da posição informada no campo ‘CodUltPosicao’ ‘Ultimas’: buscar somente a última posição de todos os veículos ativos no ‘grid’ |
| `CodUltPosicao` | T — texto | 18 | não | Código da última posição conhecida pelo cliente. O webservice vai retornar as posições subsequentes. Opcionalmente o cliente pode informar zero neste campo e deixar a cargo da Gerenciadora o controle automático da próxima posição |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getPosicoes’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Posicoes` | R — registro |  | lista | Conjunto de N registros agrupando campos de informação das posições |
| &nbsp;&nbsp;`CodPosicao` | I — inteiro | 18 | **sim** | Código da posição (sequencial, controle interno Gerenciadora) |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo (AAA-9999) |
| &nbsp;&nbsp;`CodTerminal` | T — texto | 10 | não | Número do terminal da tecnologia |
| &nbsp;&nbsp;`TipoRastreador` | T — texto | 2 | não | Tipo RA=Rastreador, LP=Localizador |
| &nbsp;&nbsp;`DataHoraPos` | DH — data e hora | 29 | **sim** | Data e hora da posição, foi quando a tecnologia recebeu do veículo |
| &nbsp;&nbsp;`DistUltPosicao` | N — numérico | 15 | não | Distância em km da última posição |
| &nbsp;&nbsp;`Ignicao` | T — texto | 1 | não | Ignição L=Ligado, D=Desligado |
| &nbsp;&nbsp;`Latitude` | N — numérico | 15 | **sim** | Posição latitudinal do veículo naquele momento |
| &nbsp;&nbsp;`Longitude` | N — numérico | 15 | **sim** | Posição longitudinal do veículo naquele momento |
| &nbsp;&nbsp;`PosReferencia` | T — texto | 100 | não | Distância em relação a um ponto de referência |
| &nbsp;&nbsp;`Velocidade` | I — inteiro | 3 | não | Velocidade da posição atual em KM/h |
| &nbsp;&nbsp;`VeloMediaCalc` | I — inteiro | 3 | não | Velocidade média calculada entre a posição atual e a anterior |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade da posição |
| &nbsp;&nbsp;`UF` | T — texto | 2 | não | UF da posição |
| &nbsp;&nbsp;`País` | T — texto | 2 | não | Sigla do país da posição |

---

## getPosicoesCliente

Página 18 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CNPJ` | T — texto | 14 | **sim** | CNPJ ou CPF do Proprietário |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getPosicoesCliente’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `PosicoesCliente` | R — registro |  | lista | Conjunto de N registros agrupando campos de informação das posições |
| &nbsp;&nbsp;`CodPosicao` | I — inteiro | 18 | **sim** | Código da posição (sequencial, controle interno Gerenciadora) |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo (AAA-9999) |
| &nbsp;&nbsp;`CodTerminal` | T — texto | 20 | não | Número do terminal da tecnologia |
| &nbsp;&nbsp;`DataHoraPos` | DH — data e hora | 29 | **sim** | Data e hora do recebimento da posição |
| &nbsp;&nbsp;`Ignicao` | T — texto | 1 | não | Ignição L=Ligado, D=Desligado |
| &nbsp;&nbsp;`Latitude` | N — numérico | 15 | **sim** | Posição latitudinal do veículo naquele momento |
| &nbsp;&nbsp;`Longitude` | N — numérico | 15 | **sim** | Posição longitudinal do veículo naquele momento |
| &nbsp;&nbsp;`PosReferencia` | T — texto | 100 | não | Referência da posição |
| &nbsp;&nbsp;`Velocidade` | I — inteiro | 3 | não | Velocidade da posição atual em KM/h |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Cidade da posição atual |
| &nbsp;&nbsp;`UF` | T — texto | 2 | não | UF da posição atual |
| &nbsp;&nbsp;`Pais` | T — texto | 2 | não | País da posição atual |

---

## getMensagens

Página 19 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `TipoConsulta` | T — texto | 9 | **sim** | Opções ‘Primeiras’: buscar as primeiras 500 mensagens encontradas no banco limitado a 72 horas ‘Proximas’: buscar as próximas 500 mensagens depois da mensagem informada no campo ‘CodUltMensagem’ |
| `CodUltMensagem` | T — texto | 9 | não | Código da última mensagem conhecida pelo cliente. O webservice vai retornar as mensagens subsequentes. Opcionalmente o cliente pode informar zero (0) neste campo para deixar a cargo da Gerenciadora o controle da próxima mensagem |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getMensagens’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Mensagens` | R — registro |  | lista | Conjunto de N registros agrupando campos de informação das mensagens |
| &nbsp;&nbsp;`CodMensagem` | I — inteiro | 18 | **sim** | Código da mensagem (sequencial, controle interno Gerenciadora) |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo (AAA-9999) |
| &nbsp;&nbsp;`CodTecnologia` | N — numérico | 8 | não | Código da tecnologia, tabela em anexo |
| &nbsp;&nbsp;`CodTerminal` | T — texto | 20 | não | Número do terminal da tecnologia |
| &nbsp;&nbsp;`DataHoraMsg` | DH — data e hora | 29 | **sim** | Data e hora do recebimento da mensagem |
| &nbsp;&nbsp;`Latitude` | N — numérico | 15 | **sim** | Posição latitudinal do veículo naquele momento |
| &nbsp;&nbsp;`Longitude` | N — numérico | 15 | **sim** | Posição longitudinal do veículo naquele momento |
| &nbsp;&nbsp;`NrMacro` | N — numérico | 8 | não | Conforme tabela MACROS.xls que será fornecida pela Gerenciadora |
| &nbsp;&nbsp;`Texto` | T — texto | 2850 | não | Texto da mensagem/macro |
| &nbsp;&nbsp;`DescTecnologia` | T — texto | 50 | não | Descrição da tecnologia do veículo |
| &nbsp;&nbsp;`CodModelo` | I — inteiro | 8 | não | Código do modelo da tecnologia do veículo |
| &nbsp;&nbsp;`DescModelo` | T — texto | 100 | não | Descrição do modelo da tecnologia do veículo |

---

## getTabela

Página 21 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | Formato dos dados retornados: ‘JSON’ ou ‘XML’ |
| `FiltroCidade` | T — texto | 100 | não | Filtro: parte do nome da cidade |
| `FiltroEstado` | T — texto | 100 | não | Filtro: parte do nome do estado |
| `FiltroPais` | T — texto | 2 | não | Filtro: sigla do país com 2 dígitos (BR, AR, ...) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getCidades’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela ‘ERROS_WEBSERVICE’. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro quando ocorrer |
| `Cidades` | R — registro |  | SM | Conjunto de cidades cadastradas |
| &nbsp;&nbsp;`CodIBGE` | I — inteiro | 7 | **sim** | Código IBGE |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | **sim** | Nome da Cidade |
| &nbsp;&nbsp;`Estado` | T — texto | 100 | **sim** | Nome do Estado |
| &nbsp;&nbsp;`UF` | T — texto | 2 | **sim** | Sigla do Estado |
| &nbsp;&nbsp;`Pais` | T — texto | 2 | **sim** | Sigla do País |

---

## getProprietario

Página 27 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| &nbsp;&nbsp;`Login` | T — texto | 11 | **sim** | Login do usuário |
| &nbsp;&nbsp;`Senha` | T — texto | 12 | **sim** | Senha do usuário |
| &nbsp;&nbsp;`TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| &nbsp;&nbsp;`Proprietario` | R — registro |  | **sim** | Registro com os dados do proprietário |
| &nbsp;&nbsp;`Razao` | T — texto | 100 | **sim** | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do proprietário |
| &nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | **sim** | CNPJ do proprietário, se for uma pessoa física informar o CPF |
| &nbsp;&nbsp;`IE` | T — texto | 20 | não | Inscrição Estadual |
| &nbsp;&nbsp;`RG` | T — texto | 15 | não | RG do proprietário quando for pessoa física |
| &nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 | não | Órgão emissor do RG |
| &nbsp;&nbsp;`Endereco` | T — texto | 200 | **sim** | Endereço do proprietário |
| &nbsp;&nbsp;`Numero` | T — texto | 5 | **sim** | Número do endereço |
| &nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Nome do bairro |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade |
| &nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP |
| &nbsp;&nbsp;`Telefone` | T — texto | 15 | **sim** | Telefone |
| &nbsp;&nbsp;`Email` | T — texto | 100 | não | Email Data de nascimento do Proprietário |
| `DataNascimento` |  |  |  |  |
| &nbsp;&nbsp;`NomeMae` | T — texto | 100 | não | Nome da mãe do proprietário |
| &nbsp;&nbsp;`CodProfissao` | I — inteiro | 8 | não | Código da profissão. Pode ser obitido consumindo o método getTabelas |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getProprietario’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Proprietario` | R — registro |  | **sim** | Registro com os dados do proprietário |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código do proprietário no banco de dados da Gerenciadora |
| &nbsp;&nbsp;`Razao` | T — texto | 100 | **sim** | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do proprietário |
| &nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | **sim** | CNPJ do proprietário, se for uma pessoa física informar o CPF |
| &nbsp;&nbsp;`IE` | T — texto | 20 | não | Inscrição Estadual |
| &nbsp;&nbsp;`RG` | T — texto | 15 | não | RG do proprietário quando for pessoa física |
| &nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 | não | Órgão emissor do RG |
| &nbsp;&nbsp;`Endereco` | T — texto | 200 | **sim** | Endereço do proprietário |
| &nbsp;&nbsp;`Numero` | T — texto | 5 | **sim** | Número do endereço |
| &nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Nome do bairro |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade |
| &nbsp;&nbsp;`UF` | T — texto | 2 | não | Sigla da Unidade de Federação |
| &nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla do País |
| &nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP |
| &nbsp;&nbsp;`Telefone` | T — texto | 15 | **sim** | Telefone |
| &nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;`NomeMae` | T — texto | 100 | não | Nome mãe do proprietário cadastrado |
| &nbsp;&nbsp;`DataNascimento` | I — inteiro | 8 | não | Data de nascimento |
| &nbsp;&nbsp;`CodProfissao` | I — inteiro | 8 | não | Código da profissão |
| &nbsp;&nbsp;`DescProfissao` | T — texto | 100 | não | Descrição da profissão |

---

## getCliente

Página 32 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Cliente` | R — registro |  | **sim** | Registro com os dados do Cliente |
| &nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | não | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora. Server de chave para atualização do cadastro. |
| &nbsp;&nbsp;`Pessoa` | T — texto | 4 | **sim** | Definição do tipo da pessoa Júridica (J) Física (F) Outros (O) para caso de CNPJ/ CPF estrangeiro |
| &nbsp;&nbsp;`Razao` | T — texto | 100 | **sim** | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do cliente |
| &nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | **sim** | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país |
| &nbsp;&nbsp;`Endereco` | T — texto | 200 | **sim** | Endereço do cliente |
| &nbsp;&nbsp;`Numero` | T — texto | 5 | **sim** | Número do endereço |
| &nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Nome do bairro |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade (se não for informado, o sistema vai pesquisar a cidade no banco da Gerenciadora pelo nome) |
| &nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP |
| &nbsp;&nbsp;`Telefone` | T — texto | 15 | **sim** | Telefone |
| &nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;`Latitude` | N — numérico | 15 | **sim** | Localização latitudinal do endereço do cliente |
| &nbsp;&nbsp;`Longitude` | N — numérico | 15 | **sim** | Localização longitudinal do endereço do cliente |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade, para pesquisa por nome caso não seja informado o CodIBGECidade |
| &nbsp;&nbsp;`UF` | T — texto | 100 | não | Unidade de Federação (Estado), para pesquisa pelo nome ou sigla da UF caso não seja informado o CodIBGECidade. Nos países do exterior, caso não tenha o nome do Estado, pode ser informada a sigla do País |
| &nbsp;&nbsp;`Pais` | T — texto | 60 | não | Nome ou sigla do País, para pesquisa caso não tenha sido informado o CodIBGECidade. Pode ser informado o nome ou a Sigla de 2 (dois) dígitos |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setCliente’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Proprietario` | R — registro |  | **sim** | Registro com os dados do proprietário |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código do proprietário no banco de dados da Gerenciadora |
| &nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | **sim** | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora. Obrigatório. Server de chave para atualização do cadastro. |
| &nbsp;&nbsp;`Razao` | T — texto | 100 | **sim** | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do proprietário |
| &nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | **sim** | CNPJ do proprietário, se for uma pessoa física informar o CPF |
| &nbsp;&nbsp;`IE` | T — texto | 20 | não | Inscrição Estadual |
| &nbsp;&nbsp;`RG` | T — texto | 15 | não | RG do proprietário quando for pessoa física |
| &nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 | não | Órgão emissor do RG |
| &nbsp;&nbsp;`Endereco` | T — texto | 200 | **sim** | Endereço do proprietário |
| &nbsp;&nbsp;`Numero` | T — texto | 5 | **sim** | Número do endereço |
| &nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Nome do bairro |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade |
| &nbsp;&nbsp;`UF` | T — texto | 2 | não | Sigla da Unidade de Federação |
| &nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla do País |
| &nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP |
| &nbsp;&nbsp;`Telefone` | T — texto | 15 | **sim** | Telefone |
| &nbsp;&nbsp;`Email` | T — texto | 100 | não | Email XML <?xml version="1.0" encoding="ISO-8859-1"?> <retCliente> <Ambiente>Homologacao</Ambiente> <Metodo>setCliente</Metodo> <Login>usuario</Login> <CodErro>107</CodErro> <MsgErro>O CADASTRO JA EXISTE</MsgErro> <Cliente> <Codigo>1234</Codigo> <CodigoCliente>9876</CodigoCliente> <Razao>RAZAO DO CLIENTE</Razao> <Fantasia>NOME FANTASIA</Fantasia> <CNPJ>00088888888888</CNPJ> <Endereco>RUA ABC </Endereco> <Numero>123</Numero> <Complemento>EDIFICIO A</Complemento> <Bairro>CENTRO</Bairro> <CodIBGECidade>4204301</CodIBGECidade> <Cidade>CONCORDIA</Cidade> <UF>SC</UF> <Pais>BR</Pais> <CEP>89.700-000</CEP> <Telefone>(049) 3444-0000</Telefone> <Email>email@gmail.com</Email> <Latitude>-43.89894</Latitude> <Longitude>-43.32344</Longitude> </Cliente> </retCliente> |

---

## getVeiculo

Página 37 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Placa` | T — texto | 8 | **sim** | Placa do Veículo (AAA-9999) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getVeiculo’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Veiculo` | R — registro |  | **sim** | Registro com os dados do Veículo |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo (AAA-9999) |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade de emplacamento do veículo |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome cidade emplacamento |
| &nbsp;&nbsp;`UF` | T — texto | 2 | não | Sigla UF emplacamento |
| &nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla País emplacamento |
| &nbsp;&nbsp;`Renavam` | T — texto | 20 | não | Número do Renavam do veículo |
| &nbsp;&nbsp;`Chassi` | T — texto | 50 | não | Chassi do veículo |
| &nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento do veículo |
| &nbsp;&nbsp;`NumeroANTT` | T — texto | 20 | não | Número do cadastro do veículo na ANTT |
| &nbsp;&nbsp;`NumeroFrota` | T — texto | 20 | não | Número da frota, controle cliente |
| &nbsp;&nbsp;`CodTipoVeiculo` | I — inteiro | 9 | **sim** | Código do tipo do veículo conforme tabela TIPOS_VEICULO |
| &nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 | não | Código do tipo de carroceria do veículo conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | **sim** | Código da marca do veículo conforme tabela MARCAS_VEICULO |
| &nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor do veículo conforme tabela CORES |
| &nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação |
| &nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo |
| &nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 | **sim** | CNPJ ou CPF do proprietário do veículo |
| &nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Possui rastreador (S ou N) |
| &nbsp;&nbsp;`TecnoRasPrincipal` | I — inteiro | 9 | não | Código da tecnologia do rastreador principal conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasPrincipal` | I — inteiro | 9 | não | Código do modelo do rastreador principal conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`TermiRasPrincipal` | T — texto | 10 | não | Número do terminal do rastreador principal |
| &nbsp;&nbsp;`TecnoRasSecundario` | I — inteiro | 9 | não | Código da tecnologia do rastreador secundário conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasSecundario` | I — inteiro | 9 | não | Código do modelo do rastreador secundário conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasSecundario` | T — texto | 10 | não | Número do terminal do rastreador secundário |
| &nbsp;&nbsp;`CodigoFipe` | T — texto | 20 | não | Código da Tabela FIPE do veículo |
| &nbsp;&nbsp;`MesReferenciaFipe` | T — texto | 30 | não | Mês de referência da consulta FIPE |
| &nbsp;&nbsp;`ValorFipe` | N — numérico | 15 | não | Valor FIPE no mês de referência |
| `CaracteristicaCarroceria` |  |  |  | Descrição da caracteristica da carroceriado veicuilo |
| &nbsp;&nbsp;`CodCaracteCarroceria` | N — numérico | 5 | não | Código do cadastro de carroceria |
| &nbsp;&nbsp;`Dispositivos` | R — registro |  | lista | Lista de dispositivos do rastreador instalados no veículo |
| &nbsp;&nbsp;`CNPJArrendatario` | T — texto | 14 | não | CNPJ ou CPF do Arrendatário |
| &nbsp;&nbsp;`DescTipoCarga` | T — texto | 150 | não | Descrição do tipo da carga |
| &nbsp;&nbsp;`Capacidade` | N — numérico | 9 | não | Diferença entre o peso bruto total (PBT) e o peso do veículo (Tara). |
| &nbsp;&nbsp;`PesoBruto` | N — numérico | 9 | não | Capacidade máxima que o veículo pode suportar, somando a Tara (T) e a Lotação (L) |
| &nbsp;&nbsp;`CodigoTipoEixo` | I — inteiro | 4 | não | Código do Tipo de Eixo que o veículo possui |
| &nbsp;&nbsp;`DescTipoEixo` | T — texto | 150 | não | Descrição do Tipo de Eixo que o veículo possui que e representado pelo código do tipo de eixo |
| &nbsp;&nbsp;`Eixos` | I — inteiro | 2 | não | Quantidade de eixos que o veículo tem |
| &nbsp;&nbsp;`CodigoEquipFrig` | I — inteiro | 4 | não | Código do equipamento frigorífico |
| &nbsp;&nbsp;`DescEquipFrig` | T — texto | 150 | não | Descrição do equipamento frigorífico |
| &nbsp;&nbsp;`ModeloFrigorifico` | T — texto | 100 | não | Modelo do equipamento frigorifico |
| &nbsp;&nbsp;`AnoEquipFrig` | I — inteiro | 4 | não | Ano do equipamento frigorifico |
| &nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do dispositivo conforme tabela DISPOSITIVOS_VEICULO |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 | não | Descrição do dispositivo conforme tabela DISPOSTIVOS_VEICULO |

---

## setVeiculo

Página 40 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 |  | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 |  | Login do usuário |
| `Senha` | T — texto | 12 |  | Senha do usuário |
| `TipoRetorno` | T — texto | 4 |  | ‘JSON’ ou ‘XML’ |
| `Veiculo` | R — registro |  |  | Registro com os dados do Veículo |
| &nbsp;&nbsp;`Placa` | T — texto | 8 |  | Placa do veículo Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 |  | Código IBGE da cidade de emplacamento do veículo |
| &nbsp;&nbsp;`Renavam` | T — texto | 20 |  | Número do Renavam do veículo |
| &nbsp;&nbsp;`Chassi` | T — texto | 50 |  | Chassi do veículo |
| &nbsp;&nbsp;`DataEmissao` | D — data | 10 |  | Data de emissão do documento do veículo |
| &nbsp;&nbsp;`NumeroANTT` | T — texto | 20 |  | Número do cadastro do veículo na ANTT |
| &nbsp;&nbsp;`NumeroFrota` | T — texto | 20 |  | Número da frota controle do cliente |
| &nbsp;&nbsp;`CodTipoVeiculo` | I — inteiro | 9 |  | Código do tipo do veículo conforme tabela TIPOS_VEICULO |
| &nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 |  | Código do tipo de carroceria do veículo conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;`CodMarca` | I — inteiro | 9 |  | Código da marca do veículo conforme tabela MARCAS_VEICULO |
| &nbsp;&nbsp;`CodCor` | I — inteiro | 9 |  | Código da cor do veículo conforme tabela CORES |
| &nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 |  | Ano de fabricação |
| &nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 |  | Ano do modelo |
| &nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 |  | CNPJ ou CPF do proprietário do veículo |
| &nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 |  | Possui rastreador (S ou N) |
| &nbsp;&nbsp;`TecnoRasPrincipal` | I — inteiro | 9 |  | Código da tecnologia do rastreador principal conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasPrincipal` | I — inteiro | 9 |  | Código do modelo do rastreador principal conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`TermiRasPrincipal` | T — texto | 10 |  | Número do terminal do rastreador principal |
| &nbsp;&nbsp;`TecnoRasSecundario` | I — inteiro | 9 |  | Código da tecnologia do rastreador secundário conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasSecundario` | I — inteiro | 9 |  | Código do modelo do rastreador secundário conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasSecundario` | T — texto | 10 |  | Número do terminal do rastreador secundário |
| &nbsp;&nbsp;`CNPJArrendatario` | T — texto | 14 |  | CNPJ ou CPF do arrendatário |
| &nbsp;&nbsp;`CodigoTipoCarga` | I — inteiro | 9 |  | Código do tipo da carga |
| &nbsp;&nbsp;`DescTipoCarga` | T — texto | 150 |  | Descrição do tipo da carga (Conforme tabela de Tipo de Carga) |
| &nbsp;&nbsp;`Capacidade` | N — numérico |  |  | Capacidade do veículo |
| &nbsp;&nbsp;`PesoBruto` | N — numérico |  |  | Peso bruto do veículo |
| &nbsp;&nbsp;`CodigoTipoEixo` | I — inteiro | 9 |  | Código do tipo do Eixo |
| &nbsp;&nbsp;`DescTipoEixo` | T — texto | 150 |  | Descrição do tipo do Eixo (Conforme tabela de Tipo Eixos) |
| &nbsp;&nbsp;`Eixos` | I — inteiro | 9 |  | Quantidade de Eixos do veículo |
| &nbsp;&nbsp;`CodigoEquipFrig` | I — inteiro | 9 |  | Código do equipamento frigorífico |
| &nbsp;&nbsp;`DescEquipFrig` | T — texto | 150 |  | Descrição do equipamento frigorífico |
| &nbsp;&nbsp;`ModeloFrigorifico` | T — texto | 100 |  | Descrição do modelo frigorífico |
| &nbsp;&nbsp;`AnoEquipFrig` | N — numérico |  |  | Ano do equipamento frigorífico |
| &nbsp;&nbsp;`Dispositivos` | R — registro |  |  | Lista de dispositivos do rastreador instalados no veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 |  | Código do dispositivo conforme tabela DISPOSITIVOS_VEICULO |
| &nbsp;&nbsp;`Documentos` | R — registro |  |  |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 |  | Descrição/Título do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 3 |  | PDF,XLSX,XLS,DOC,DOCX,PNG,JPEG,JPG |
| &nbsp;&nbsp;&nbsp;&nbsp;`Documento` | T — texto |  |  | Documento convertido para Base64 |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setVeiculo’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Veiculo` | R — registro |  | **sim** | Registro com os dados do Veículo |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo (AAA-9999) |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade de emplacamento do veículo |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome cidade emplacamento |
| &nbsp;&nbsp;`UF` | T — texto | 2 | não | Sigla UF emplacamento |
| &nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla País emplacamento |
| &nbsp;&nbsp;`Renavam` | T — texto | 20 | não | Número do Renavam do veículo |
| &nbsp;&nbsp;`Chassi` | T — texto | 50 | não | Chassi do veículo |
| &nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento do veículo |
| &nbsp;&nbsp;`NumeroANTT` | T — texto | 20 | não | Número do cadastro do veículo na ANTT |
| &nbsp;&nbsp;`NumeroFrota` | T — texto | 20 | não | Número da frota controle do cliente |
| &nbsp;&nbsp;`CodTipoVeiculo` | I — inteiro | 9 | **sim** | Código do tipo do veículo conforme tabela TIPOS_VEICULO |
| &nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 | não | Código do tipo de carroceria do veículo conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | **sim** | Código da marca do veículo conforme tabela MARCAS_VEICULO |
| &nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor do veículo conforme tabela CORES |
| &nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação |
| &nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo |
| &nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 | **sim** | CNPJ ou CPF do proprietário do veículo |
| &nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Possui rastreador (S ou N) |
| &nbsp;&nbsp;`TecnoRasPrincipal` | I — inteiro | 9 | não | Código da tecnologia do rastreador principal conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasPrincipal` | I — inteiro | 9 | não | Código do modelo do rastreador principal conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`TermiRasPrincipal` | T — texto | 10 | não | Número do terminal do rastreador principal |
| &nbsp;&nbsp;`TecnoRasSecundario` | I — inteiro | 9 | não | Código da tecnologia do rastreador secundário conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasSecundario` | I — inteiro | 9 | não | Código do modelo do rastreador secundário conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`ModelRasSecundario` | T — texto | 10 | não | Número do terminal do rastreador secundário |
| &nbsp;&nbsp;`CNPJArrendatario` | T — texto | 14 | não | CNPJ ou CPF do Arrendatário |
| &nbsp;&nbsp;`DescTipoCarga` | T — texto | 150 | não | Descrição do tipo da carga |
| &nbsp;&nbsp;`Capacidade` | N — numérico | 9 | não | Diferença entre o peso bruto total (PBT) e o peso do veículo (Tara). |
| &nbsp;&nbsp;`PesoBruto` | N — numérico | 9 | não | Capacidade máxima que o veículo pode suportar, somando a Tara (T) e a Lotação (L) |
| &nbsp;&nbsp;`CodigoTipoEixo` | I — inteiro | 4 | não | Código do Tipo de Eixo que o veículo possui |
| &nbsp;&nbsp;`DescTipoEixo` | T — texto | 150 | não | Descrição do Tipo de Eixo que o veículo possui que e representado pelo código do tipo de eixo |
| &nbsp;&nbsp;`Eixos` | I — inteiro | 2 | não | Quantidade de eixos que o veículo tem |
| &nbsp;&nbsp;`CodigoEquipFrig` | I — inteiro | 4 | não | Código do equipamento frigorífico |
| &nbsp;&nbsp;`DescEquipFrig` | T — texto | 150 | não | Descrição do equipamento frigorífico |
| &nbsp;&nbsp;`ModeloFrigorifico` | T — texto | 100 | não | Modelo do equipamento frigorifico |
| &nbsp;&nbsp;`AnoEquipFrig` | I — inteiro | 4 | não | Ano do equipamento frigorifico |
| &nbsp;&nbsp;`Dispositivos` | R — registro |  | lista | Lista de dispositivos do rastreador instalados no veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do dispositivo conforme tabela DISPOSITIVOS_VEICULO |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 | não | Descrição do dispositivo conforme tabela DISPOSTIVISO_VEICULO |

---

## getCarreta

Página 45 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Placa` | T — texto | 8 | **sim** | Placa da Carreta (AAA-9999) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getCarreta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Carreta` | R — registro |  | **sim** | Registro com os dados da Carreta |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo (AAA-9999) |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade de emplacamento da carreta |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome cidade emplacamento |
| &nbsp;&nbsp;`UF` | T — texto | 2 | não | Sigla UF emplacamento |
| &nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla País emplacamento |
| &nbsp;&nbsp;`Renavam` | T — texto | 20 | não | Número do Renavam da carreta |
| &nbsp;&nbsp;`Chassi` | T — texto | 50 | não | Chassi da carreta |
| &nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento da carreta |
| &nbsp;&nbsp;`NumeroANTT` | T — texto | 20 | não | Número do cadastro da carreta na ANTT |
| &nbsp;&nbsp;`NumeroFrota` | T — texto | 20 | não | Número da frota controle do cliente |
| &nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 | não | Código do tipo de carreta conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | **sim** | Código da marca da carreta conforme tabela MARCAS_CARRETA |
| &nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor da carreta conforme tabela CORES |
| &nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação |
| &nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo |
| &nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 | **sim** | CNPJ ou CPF do proprietário do veículo |
| &nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Possui rastreador (S ou N) |
| &nbsp;&nbsp;`TecnologiaRastreador` | I — inteiro | 9 | não | Código da tecnologia do rastreador conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModeloRastreador` | I — inteiro | 9 | não | Código do modelo do rastreador conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`TerminalRastreador` | T — texto | 10 | não | Número do terminal do rastreador |
| &nbsp;&nbsp;`DescTipoCarga` | T — texto | 150 | não | Descrição do tipo da carga |
| &nbsp;&nbsp;`Capacidade` | N — numérico | 9 | não | Diferença entre o peso bruto total (PBT) e o peso do veículo (Tara). |
| &nbsp;&nbsp;`PesoBruto` | N — numérico | 9 | não | Capacidade máxima que o veículo pode suportar, somando a Tara (T) e a Lotação (L) |
| &nbsp;&nbsp;`CodigoTipoEixo` | I — inteiro | 4 | não | Código do Tipo de Eixo que o veículo possui |
| &nbsp;&nbsp;`DescTipoEixo` | T — texto | 150 | não | Descrição do Tipo de Eixo que o veículo possui que e representado pelo código do tipo de eixo |
| &nbsp;&nbsp;`Eixos` | I — inteiro | 2 | não | Quantidade de eixos que o veículo tem |
| &nbsp;&nbsp;`CodigoEquipFrig` | I — inteiro | 4 | não | Código do equipamento frigorífico |
| &nbsp;&nbsp;`DescEquipFrig` | T — texto | 150 | não | Descrição do equipamento frigorífico |
| &nbsp;&nbsp;`ModeloFrigorifico` | T — texto | 100 | não | Modelo do equipamento frigorifico |
| &nbsp;&nbsp;`AnoEquipFrig` | I — inteiro | 4 | não | Ano do equipamento frigorifico |
| &nbsp;&nbsp;`CNPJArrendatario` | T — texto | 14 | não | CNPJ ou CPF do Arrendatário |
| &nbsp;&nbsp;`Dispositivos` | R — registro |  | lista | Lista de dispositivos do rastreador instalados na carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do dispositivo conforme tabela DISPOSITIVOS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 | não | Descrição do dispositivo conforme tabela DISPOSTIVISO_CARRETA |
| &nbsp;&nbsp;`Documentos` | R — registro |  | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 | **sim** | Descrição/Título do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 3 | **sim** | PDF,XLSX,XLS,DOC,DOCX,PNG,JPEG,JPG |
| &nbsp;&nbsp;&nbsp;&nbsp;`Documento` | T — texto |  | **sim** | Documento convertido para Base64 |

---

## setCarreta

Página 48 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 |  | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 |  | Login do usuário |
| `Senha` | T — texto | 12 |  | Senha do usuário |
| `TipoRetorno` | T — texto | 4 |  | ‘JSON’ ou ‘XML’ |
| `Carreta` | R — registro |  |  | Registro com os dados da Carreta |
| &nbsp;&nbsp;`Placa` | T — texto | 8 |  | Placa do veículo Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 |  | Código IBGE da cidade de emplacamento da carreta |
| &nbsp;&nbsp;`Renavam` | T — texto | 20 |  | Número do Renavam da carreta |
| &nbsp;&nbsp;`Chassi` | T — texto | 50 |  | Chassi da carreta |
| &nbsp;&nbsp;`DataEmissao` | D — data | 10 |  | Data de emissão do documento da carreta |
| &nbsp;&nbsp;`NumeroANTT` | T — texto | 20 |  | Número do cadastro da carreta na ANTT |
| &nbsp;&nbsp;`NumeroFrota` | T — texto | 20 |  | Número da frota controle do cliente |
| &nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 |  | Código do tipo de carreta conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;`CodMarca` | I — inteiro | 9 |  | Código da marca da carreta conforme tabela MARCAS_CARRETA |
| &nbsp;&nbsp;`CodCor` | I — inteiro | 9 |  | Código da cor da carreta conforme tabela CORES |
| &nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 |  | Ano de fabricação |
| &nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 |  | Ano do modelo |
| &nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 |  | CNPJ ou CPF do proprietário do veículo |
| &nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 |  | Possui rastreador (S ou N) |
| &nbsp;&nbsp;`TecnologiaRastreador` | I — inteiro | 9 |  | Código da tecnologia do rastreador conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModeloRastreador` | I — inteiro | 9 |  | Código do modelo do rastreador conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`TerminalRastreador` | T — texto | 10 |  | Número do terminal do rastreador |
| &nbsp;&nbsp;`CNPJArrendatario` | T — texto | 14 |  | CNPJ ou CPF do arrendatário |
| &nbsp;&nbsp;`CodigoTipoCarga` | I — inteiro | 9 |  | Código do tipo da carga |
| &nbsp;&nbsp;`DescTipoCarga` | T — texto | 150 |  | Descrição do tipo da carga (Conforme tabela de Tipo de Carga) |
| &nbsp;&nbsp;`Capacidade` | N — numérico |  |  | Capacidade do veículo |
| &nbsp;&nbsp;`PesoBruto` | N — numérico |  |  | Peso bruto do veículo |
| &nbsp;&nbsp;`CodigoTipoEixo` | I — inteiro | 9 |  | Código do tipo do Eixo |
| &nbsp;&nbsp;`DescTipoEixo` | T — texto | 150 |  | Descrição do tipo do Eixo (Conforme tabela de Tipo Eixos) |
| &nbsp;&nbsp;`Eixos` | I — inteiro | 9 |  | Quantidade de Eixos do veículo |
| &nbsp;&nbsp;`CodigoEquipFrig` | I — inteiro | 9 |  | Código do equipamento frigorífico |
| &nbsp;&nbsp;`DescEquipFrig` | T — texto | 150 |  | Descrição do equipamento frigorífico |
| &nbsp;&nbsp;`ModeloFrigorifico` | T — texto | 100 |  | Descrição do modelo frigorífico |
| &nbsp;&nbsp;`AnoEquipFrig` | N — numérico |  |  | Ano do equipamento frigorífico |
| &nbsp;&nbsp;`Dispositivos` | R — registro |  |  | Lista de dispositivos do rastreador instalados na carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 |  | Código do dispositivo conforme tabela DISPOSITIVOS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 |  | Descrição do dispositivo conforme tabela DISPOSTIVISO_CARRETA |
| &nbsp;&nbsp;`Documentos` | R — registro |  |  |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 |  | Descrição/Título do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 3 |  | PDF,XLSX,XLS,DOC,DOCX,PNG,JPEG,JPG |
| &nbsp;&nbsp;&nbsp;&nbsp;`Documento` | T — texto |  |  | Documento convertido para Base64 |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getCarreta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Carreta` | R — registro |  | **sim** | Registro com os dados da Carreta |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo (AAA-9999) |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade de emplacamento da carreta |
| &nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome cidade emplacamento |
| &nbsp;&nbsp;`UF` | T — texto | 2 | não | Sigla UF emplacamento |
| &nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla País emplacamento |
| &nbsp;&nbsp;`Renavam` | T — texto | 20 | não | Número do Renavam da carreta |
| &nbsp;&nbsp;`Chassi` | T — texto | 50 | não | Chassi da carreta |
| &nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento da carreta |
| &nbsp;&nbsp;`NumeroANTT` | T — texto | 20 | não | Número do cadastro da carreta na ANTT |
| &nbsp;&nbsp;`NumeroFrota` | T — texto | 20 | não | Número da frota controle do cliente |
| &nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 | não | Código do tipo de carreta conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | **sim** | Código da marca da carreta conforme tabela MARCAS_CARRETA |
| &nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor da carreta conforme tabela CORES |
| &nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação |
| &nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo |
| &nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 | **sim** | CNPJ ou CPF do proprietário do veículo |
| &nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Possui rastreador (S ou N) |
| &nbsp;&nbsp;`TecnologiaRastreador` | I — inteiro | 9 | não | Código da tecnologia do rastreador conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;`ModeloRastreador` | I — inteiro | 9 | não | Código do modelo do rastreador conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;`TerminalRastreador` | T — texto | 10 | não | Número do terminal do rastreador |
| &nbsp;&nbsp;`CNPJArrendatario` | T — texto | 14 | não | CNPJ ou CPF do Arrendatário |
| &nbsp;&nbsp;`DescTipoCarga` | T — texto | 150 | não | Descrição do tipo da carga |
| &nbsp;&nbsp;`Capacidade` | N — numérico | 9 | não | Diferença entre o peso bruto total (PBT) e o peso do veículo (Tara). |
| &nbsp;&nbsp;`PesoBruto` | N — numérico | 9 | não | Capacidade máxima que o veículo pode suportar, somando a Tara (T) e a Lotação (L) |
| &nbsp;&nbsp;`CodigoTipoEixo` | I — inteiro | 4 | não | Código do Tipo de Eixo que o veículo possui |
| &nbsp;&nbsp;`DescTipoEixo` | T — texto | 150 | não | Descrição do Tipo de Eixo que o veículo possui que e representado pelo código do tipo de eixo |
| &nbsp;&nbsp;`Eixos` | I — inteiro | 2 | não | Quantidade de eixos que o veículo tem |
| &nbsp;&nbsp;`CodigoEquipFrig` | I — inteiro | 4 | não | Código do equipamento frigorífico |
| &nbsp;&nbsp;`DescEquipFrig` | T — texto | 150 | não | Descrição do equipamento frigorífico |
| &nbsp;&nbsp;`ModeloFrigorifico` | T — texto | 100 | não | Modelo do equipamento frigorifico |
| &nbsp;&nbsp;`AnoEquipFrig` | I — inteiro | 4 | não | Ano do equipamento frigorifico |
| &nbsp;&nbsp;`Dispositivos` | R — registro |  | lista | Lista de dispositivos do rastreador instalados na carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do dispositivo conforme tabela DISPOSITIVOS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 | não | Descrição do dispositivo conforme tabela DISPOSTIVISO_CARRETA |

---

## getMotorista

Página 52 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 |  | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 |  | Login do usuário |
| `Senha` | T — texto | 12 |  | Senha do usuário |
| `TipoRetorno` | T — texto | 4 |  | ‘JSON’ ou ‘XML’ |
| `Motorista` | R — registro |  |  | Registro com os dados do Motorista |
| &nbsp;&nbsp;`CPF` | T — texto | 11 |  | CPF do motorista |
| &nbsp;&nbsp;`Nome` | T — texto | 100 |  | Nome do motorista |
| &nbsp;&nbsp;`Apelido` | T — texto | 30 |  | Apelido do motorista |
| &nbsp;&nbsp;`Sexo` | T — texto | 2 |  | Sexo (F ou M) |
| &nbsp;&nbsp;`RG` | T — texto | 15 |  | RG do motorista |
| &nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 |  | Órgão emissor do RG |
| &nbsp;&nbsp;`DataEmissRG` | D — data | 10 |  | Data de emissão do RG |
| &nbsp;&nbsp;`CodProfissao` | I — inteiro | 9 |  | Código da profissão conforme tabela PROFISSOES (30=Motorista) |
| &nbsp;&nbsp;`NumFormCNH` | I — inteiro | 15 |  | Número de formulário da CNH |
| &nbsp;&nbsp;`NumRegCNH` | I — inteiro | 11 |  | Número de registro da CNH Obs: Campo pode ser enviado com zeros a esquerda desde que enviado entre aspas simples ‘00123456789’ |
| &nbsp;&nbsp;`NumSegurCNH` | T — texto | 11 |  | Número de segurança da CNH |
| &nbsp;&nbsp;`NumRenachCNH` | T — texto | 15 |  | Número Renach da CNH |
| &nbsp;&nbsp;`UFEmissCNH` | T — texto | 2 |  | Sigla da UF de emissão da CNH |
| &nbsp;&nbsp;`DataEmissCNH` | D — data | 10 |  | Data de emissão da CNH |
| &nbsp;&nbsp;`DataVencCNH` | D — data | 10 |  | Data de vencimento da CNH |
| &nbsp;&nbsp;`CategoriaCNH` | T — texto | 2 |  | Categoria da CNH |
| &nbsp;&nbsp;`DtPrimEmissCNH` | D — data | 10 |  | Data de emissão da primeira CNH |
| &nbsp;&nbsp;`PossuiMOPP` | T — texto | 1 |  | Possuí MOPP (curso transporte produtos perigosos) (S ou N) |
| &nbsp;&nbsp;`DtVencMOPP` | D — data | 10 |  | Data de vencimento do MOPP |
| &nbsp;&nbsp;`CodIBGECidadeNatal` | I — inteiro | 7 |  | Código IBGE da cidade de nascimento |
| &nbsp;&nbsp;`DataNascimento` | D — data | 10 |  | Data de nascimento |
| &nbsp;&nbsp;`NomeMae` | T — texto | 100 |  | Nome da mãe |
| &nbsp;&nbsp;`Endereco` | T — texto | 200 |  | Endereço de residência do motorista |
| &nbsp;&nbsp;`Numero` | T — texto | 15 |  | Número do endereço |
| &nbsp;&nbsp;`Complemento` | T — texto | 50 |  | Complemento |
| &nbsp;&nbsp;`Bairro` | T — texto | 100 |  | Nome do bairro |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 |  | Código IBGE da cidade de residência |
| &nbsp;&nbsp;`CEP` | T — texto | 10 |  | CEP (89.700-000) |
| &nbsp;&nbsp;`Telefone` | T — texto | 15 |  | Telefone de contato |
| &nbsp;&nbsp;`Celular` | T — texto | 15 |  | Número de celular de contato |
| &nbsp;&nbsp;`Radio` | T — texto | 15 |  | Número do rádio |
| &nbsp;&nbsp;`SenhaMotorista` | T — texto | 10 |  | Senha do motorista |
| &nbsp;&nbsp;`PaisEndereco` | T — texto | 100 |  | Pais do endereço do condutor (necessário informar na ausência do código ibge do endereço) |
| &nbsp;&nbsp;`UFEndereco` | T — texto | 2 |  | UF do endereço do condutor (necessário informar na ausência do código ibge do endereço) |
| &nbsp;&nbsp;`CidadeEndereco` | T — texto | 100 |  | Cidade do endereço do condutor (necessário informar na ausência do código ibge do endereço) |
| &nbsp;&nbsp;`PaisNatal` | T — texto | 100 |  | Pais de naturalidade do condutor (necessário informar na ausência do código ibge de naturalidade) |
| &nbsp;&nbsp;`UFNatal` | T — texto | 2 |  | UF de naturalidade do condutor (necessário informar na ausência do código ibge de naturalidade) |
| &nbsp;&nbsp;`CidadeNatal` | T — texto | 100 |  | Cidade de naturalidade do condutor (necessário informar na ausência do código ibge de naturalidade) |
| `Escolaridade` |  |  |  | Grau de escolaridade cadastrado para o cpf |
| `EstadoCivil` |  |  |  | Estado civil cadastrado para o cpf |
| &nbsp;&nbsp;`Documentos` | R — registro |  |  |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 |  | Descrição/Título do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 3 |  | PDF,XLSX,XLS,DOC,DOCX,PNG,JPEG,JPG |
| &nbsp;&nbsp;&nbsp;&nbsp;`Documento` | T — texto |  |  | Documento convertido para Base64 |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getMotorista’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Motorista` | R — registro |  | **sim** | Registro com os dados do Motorista |
| &nbsp;&nbsp;`Código` | I — inteiro | 9 | não | Código do motorista no sistema da Gerenciadora |
| &nbsp;&nbsp;`CPF` | T — texto | 11 | **sim** | CPF do motorista |
| &nbsp;&nbsp;`Nome` | T — texto | 100 | **sim** | Nome do motorista |
| &nbsp;&nbsp;`Apelido` | T — texto | 30 | não | Apelido do motorista |
| &nbsp;&nbsp;`Sexo` | T — texto | 2 | **sim** | Sexo (F ou M) |
| &nbsp;&nbsp;`RG` | T — texto | 15 | não | RG do motorista |
| &nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 | não | Órgão emissor do RG |
| &nbsp;&nbsp;`DataEmissRG` | D — data | 10 | não | Data de emissão do RG |
| &nbsp;&nbsp;`CodProfissao` | I — inteiro | 9 | **sim** | Código da profissão conforme tabela PROFISSOES (30=Motorista) |
| &nbsp;&nbsp;`NumFormCNH` | T — texto | 15 | não | Número de formulário da CNH |
| &nbsp;&nbsp;`NumRegCNH` | T — texto | 11 | não | Número de registro da CNH |
| &nbsp;&nbsp;`NumSegurCNH` | T — texto | 11 | não | Número de segurança da CNH |
| &nbsp;&nbsp;`NumRenachCNH` | T — texto | 15 | não | Número Renach da CNH |
| &nbsp;&nbsp;`UFEmissCNH` | T — texto | 2 | **sim** | Sigla da UF de emissão da CNH |
| &nbsp;&nbsp;`DataEmissCNH` | D — data | 10 | não | Data de emissão da CNH |
| &nbsp;&nbsp;`DataVencCNH` | D — data | 10 | não | Data de vencimento da CNH |
| &nbsp;&nbsp;`CategoriaCNH` | T — texto | 2 | não | Categoria da CNH |
| &nbsp;&nbsp;`DtPrimEmissCNH` | D — data | 10 | não | Data de emissão da primeira CNH |
| &nbsp;&nbsp;`PossuiMOPP` | T — texto | 1 | não | Possuí MOPP (curso transporte produtos perigosos) (S ou N) |
| &nbsp;&nbsp;`DtVencMOPP` | D — data | 10 | não | Data de vencimento do MOPP |
| &nbsp;&nbsp;`CodIBGECidadeNatal` | I — inteiro | 7 | **sim** | Código IBGE da cidade de nascimento |
| &nbsp;&nbsp;`DataNascimento` | D — data | 10 | **sim** | Data de nascimento |
| &nbsp;&nbsp;`NomeMae` | T — texto | 100 | não | Nome da mãe |
| &nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço de residência do motorista |
| &nbsp;&nbsp;`Numero` | T — texto | 15 | não | Número do endereço |
| &nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento |
| &nbsp;&nbsp;`Bairro` | T — texto | 100 | não | Nome do bairro |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade de residência |
| &nbsp;&nbsp;`CEP` | T — texto | 10 | não | CEP (89.700-000) |
| &nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone de contato |
| &nbsp;&nbsp;`Celular` | T — texto | 15 | **sim** | Número de celular de contato |
| &nbsp;&nbsp;`Radio` | T — texto | 15 | não | Número do rádio |
| &nbsp;&nbsp;`Escolaridade` | T — texto | 100 | não | Grau de escolaridade cadastrado para o cpf |
| &nbsp;&nbsp;`EstadoCivil` | T — texto | 100 | não | Estado civil cadastrado para o cpf |

---

## setVeiculoEscolta

Página 59 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Veiculo` | R — registro |  | **sim** | Informações do veículo de escolta |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 9 | **sim** | Código IBGE da cidade onde esta registrado o veículo |
| &nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | **sim** | Código da marca conforme tabela de marcas |
| &nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor conforme tabela de cores |
| &nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação do veículo |
| &nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo do veículo |
| &nbsp;&nbsp;`CNPJEmpresa` | N — numérico | 14 | **sim** | CNPJ da empresa de escolta |
| &nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Veículo possui rastreador (S/N) |
| &nbsp;&nbsp;`TecnologiaRastreador` | I — inteiro | 9 | não | Código da tecnologia do rastreador conforme tabela |
| &nbsp;&nbsp;`ModeloRastreador` | I — inteiro | 9 | não | Código do modelo do rastreador conforme tabela |
| &nbsp;&nbsp;`TerminalRastreador` | T — texto | 20 | não | Número do terminal do rastreador |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setVeiculoEscolta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Veiculo` | R — registro |  | **sim** | Informações do veículo de escolta |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 9 | **sim** | Código IBGE da cidade onde esta registrado o veículo |
| &nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | **sim** | Código da marca conforme tabela de marcas |
| &nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor conforme tabela de cores |
| &nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação do veículo |
| &nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo do veículo |
| &nbsp;&nbsp;`CNPJEmpresa` | N — numérico | 14 | **sim** | CNPJ da empresa de escolta |
| &nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Veículo possui rastreador (S/N) |
| &nbsp;&nbsp;`TecnologiaRastreador` | I — inteiro | 9 | não | Código da tecnologia do rastreador conforme tabela |
| &nbsp;&nbsp;`ModeloRastreador` | I — inteiro | 9 | não | Código do modelo do rastreador conforme tabela |
| &nbsp;&nbsp;`TerminalRastreador` | T — texto | 20 | não | Número do terminal do rastreador |

---

## setAgenteEscolta

Página 61 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Agente` | R — registro |  | **sim** | Informações do agente de escolta |
| &nbsp;&nbsp;`CPF` | N — numérico | 11 | **sim** | CPF do agente |
| &nbsp;&nbsp;`Nome` | T — texto | 100 | **sim** | Nome do agente |
| &nbsp;&nbsp;`Sexo` | T — texto | 1 | **sim** | Sexo (M/F) |
| &nbsp;&nbsp;`RG` | N — numérico | 20 | **sim** | RG do agente |
| &nbsp;&nbsp;`DataEmissRG` | D — data | 10 | **sim** | Data de emissão do RG |
| &nbsp;&nbsp;`PaisNacionalidade` | T — texto | 2 | **sim** | Sigla do país de nacionalidade (BR, AR, PY...) |
| &nbsp;&nbsp;`DataNascimento` | D — data | 10 | **sim** | Data de nascimento |
| &nbsp;&nbsp;`Endereco` | T — texto | 100 | **sim** | Endereço |
| &nbsp;&nbsp;`Numero` | T — texto | 10 | **sim** | Número do endereço |
| &nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento |
| &nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Bairro |
| &nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 9 | **sim** | Código IBGE da cidade |
| &nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP |
| &nbsp;&nbsp;`Telefone` | T — texto | 20 | não | Telefone |
| &nbsp;&nbsp;`Celular` | T — texto | 20 | não | Celular |
| &nbsp;&nbsp;`Radio` | T — texto | 20 | não | Radio |
| &nbsp;&nbsp;`CNPJEmpresa` | N — numérico | 14 | **sim** | CNPJ da empresa de escolta |

### Retorno

_(sem campos extraídos)_

---

## getCadLocalizadores

Página 63 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getCadLocalizadores’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Localizadores` | R — registro |  | M | Lista de localizadores |
| &nbsp;&nbsp;`CodTerminal` | T — texto | 20 | **sim** | Número de identificação do localizador |
| &nbsp;&nbsp;`CodTecnologia` | I — inteiro | 6 | **sim** | Código da tecnologia no cadastro da Gerenciadora |
| &nbsp;&nbsp;`NomeTecnologia` | T — texto | 50 | **sim** | Nome da tecnologia no cadastro da Gerenciadora |
| &nbsp;&nbsp;`CodModelo` | I — inteiro | 6 | **sim** | Código do modelo do localizador na Gerenciadora |
| &nbsp;&nbsp;`NomeModelo` | T — texto | 50 | **sim** | Nome do modelo do localizador na Gerenciadora |
| &nbsp;&nbsp;`DataInclusao` | DH — data e hora | 29 | não | Data/hora de inclusão do localizador na base |
| &nbsp;&nbsp;`DataValidade` | D — data | 10 | não | Data de validade da isca/localizador XML <?xml version="1.0" encoding="ISO-8859-1"?> <retCadLocalizadores> <Ambiente>Homologacao</Ambiente> <Metodo>getCliente</Metodo> <Login>****</Login> <CodErro>0</CodErro> <Localizadores> <Localizador> <CodTerminal>******</CodTerminal> <CodTecnologia>1</CodTecnologia> <NomeTecnologia>AUTOTRAC</NomeTecnologia> <CodModelo>5</CodModelo> <NomeModelo>OBC 4</NomeModelo> <Ativo>S</Ativo> </Localizador> <Localizador> <CodTerminal>******</CodTerminal> <CodTecnologia>7</CodTecnologia> <NomeTecnologia>SASCAR</NomeTecnologia> <CodModelo>182</CodModelo> <NomeModelo>CONTING?NCIA</NomeModelo> <Ativo>S</Ativo> </Localizador> </Localizadores> </retCadLocalizadores> 5. Rotas |

---

## getRotas

Página 64 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Codigo` | I — inteiro | 9 | não | Código da rota na base da Gerenciadora, caso já possua o código e quiser consultar os dados da rota |
| `CodIBGECidadeOrigem` | I — inteiro | 9 | **sim** | Código IBGE da cidade de origem |
| `CodIBGECidadeDestino` | I — inteiro | 9 | **sim** | Código IBGE da cidade de destino Atenção: se não informar CodIBGECidadeOrigem e CodIBGECidadeDestino então todas as rotas do cliente serão listadas sem detalhamento |
| `DevolverKML` | T — texto | 1 | **sim** | Devolver o KML da rota (S, N). KML é um formato de arquivo da Google usado para exibir dados geográficos. Neste caso irá conter todas as coordenadas (latitude, longitude) por onde passa a rota. |
| `DetalharRota` | T — texto | 1 | não | Detalhar a rota com informação das cidades, rodovias, locais de parada, etc. |
| `CriarSeNaoExistir` | T — texto | 1 | não | Criar uma rota se nenhuma existir entre a cidade de origem e destino. Informe S para sim e N para não. |
| `Polyline` | T — texto |  | não | Polyline representando a rota |
| `PontosPassagem` | R — registro |  | lista | Lista de pontos de passagem da rota e ou clientes. No máximo 25 registros. Devem estar na sua devida ordem de passagem pela rota. Se informar pontos de passagem, obrigatoriamente, deve informar a cidade de origem e destino. |
| &nbsp;&nbsp;`Latitude` | N — numérico | 15 | **sim** | Posição latitudinal do ponto de passagem |
| &nbsp;&nbsp;`Longitude` | N — numérico | 15 | **sim** | Posição longitude do ponto de passagem |
| &nbsp;&nbsp;`Raio` | I — inteiro | 9 | não | Raio do alvo (se não informar, o sistema assume 500 metros) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getRotas’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Rotas` | R — registro |  | lista | ‘N’ registro com os dados das rotas encontradas |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código da rota |
| &nbsp;&nbsp;`Descricao` | T — texto | 400 | **sim** | Descrição da rota, cidade origem, cidade destino |
| &nbsp;&nbsp;`CodIBGECidadeOrigem` | I — inteiro | 9 | não | Código IBGE da cidade de origem |
| &nbsp;&nbsp;`CidadeOrigem` | T — texto | 100 | não | Nome/UF da cidade de origem |
| &nbsp;&nbsp;`CodIBGECidadeDestino` | I — inteiro | 9 | não | Código IBGE da cidade de destino |
| &nbsp;&nbsp;`CidadeDestino` | T — texto | 100 | não | Nome/UF da cidade de destino |
| &nbsp;&nbsp;`Polyline` | T — texto |  | não | Polyline representando a rota |
| &nbsp;&nbsp;`KMDistancia` | N — numérico | 9 | não | Quilometragem total da rota |
| &nbsp;&nbsp;`Cidades` | R — registro |  | lista | Cidades percorridas pela rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGE` | I — inteiro | 9 | não | Código IBGE |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade |
| &nbsp;&nbsp;&nbsp;&nbsp;`Estado` | T — texto | 100 | não | Nome do Estado |
| &nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 2 | não | UF |
| &nbsp;&nbsp;&nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla do País |
| &nbsp;&nbsp;`Rodovias` | R — registro |  | lista | Rodovias percorridas pela rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`Nome` | T — texto | 100 | não | Nome da rodovia |
| &nbsp;&nbsp;`KML` | T — texto |  | não | XML com os pontos geográficos pecorridos pela rota |
| &nbsp;&nbsp;`PerfisSeguranca` | R — registro |  | lista | Lista de perfis de segurança vs. locais de parada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do perfil de segurança |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 | não | Descricao do perfil de segurança |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`LocaisParada` | R — registro |  | lista | Lista de locais de parada permitidos na rota e vinculados ao perfil |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do local de parada, cadastro Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 150 | não | Descricao do local de parada |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome/UF da cidade de parada |

---

## GetRotograma

Página 67 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodSolicitacao` | I — inteiro | 9 | não | Código da solicitação de monitoramento – caso informe o código não é necessário informar a placa |
| `Placa` | I — inteiro | 9 | não | Placa em que a rota está associada – caso informe a placa não é necessário informar o código de solicitação |
| `RetornaParadasFiscais` | T — texto | 1 | **sim** | Devolver as paradas fiscais da rota (pedágio, policia, balança) – S/N |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getRotas’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `ItinerarioRodovias` | R — registro |  | lista | Rodovias percorridas pela rota |
| &nbsp;&nbsp;`Nome` | I — inteiro | 9 | **sim** | Descrição da Rodovia |
| &nbsp;&nbsp;`ItinerarioCidades` | R — registro |  | lista | Cidades percorridas pela rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGE` | I — inteiro | 9 | não | Código IBGE |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade |
| &nbsp;&nbsp;&nbsp;&nbsp;`Estado` | T — texto | 100 | não | Nome do Estado |
| &nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 2 | não | UF |
| &nbsp;&nbsp;&nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla do País |
| &nbsp;&nbsp;`PontosParada` | R — registro |  | lista | Postos e pontos fiscais cadastrados para a rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`Código` | T — texto | 100 | não | Código do local |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descrição` |  |  |  | Nome do local |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` |  |  |  | Cidade e uf do local |
| &nbsp;&nbsp;&nbsp;&nbsp;`Latitude` |  |  |  | Latitude da georreferencia |
| &nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | T — texto |  | não | Longitude da georreferencia |

---

## setPreSM

Página 70 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `PreSM` | R — registro |  | **sim** | Registro com os dados da pré-solicitação de monitoramento |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código da pré-solicitação de monitoramento, informar somente para alterar os dados de uma viagem, se estiver incluindo informar zero ou deixar em branco |
| &nbsp;&nbsp;`GeraApenasSigaverde` | T — texto | 1 | não | Paramentro para gerar somente o cálculo do crédito de carbono. Usar: S – Para SIM N – Para NÃO |
| &nbsp;&nbsp;`Operacao` | T — texto |  | não | Operação da viagem |
| &nbsp;&nbsp;`Responsavel` | T — texto |  | não | Responsavel da viagem |
| &nbsp;&nbsp;`Engate` | R — registro |  | **sim** | Registro com os dados da guia engate |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodFilial` | I — inteiro | 9 | **sim** | Código da filial |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodAgencia` | I — inteiro | 9 | não | Código da agencia do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | **sim** | Placa do veículo Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincVeiculo` | T — texto | 1 | **sim** | Vinculo do veículo (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPerfilSeguranca` | I — inteiro | 9 | **sim** | Código do perfil de segurança |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista1` | T — texto | 11 | **sim** | CPF do 1º motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincMotorista1` | T — texto | 1 | **sim** | Vinculo do 1º motorista (A=agregado, F=funcionário, T=autônomo) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista2` | T — texto | 11 | não | CPF do 2º motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincMotorista2` | T — texto | 1 | não | Vinculo do 1º motorista (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFAjudante` | T — texto | 11 | não | CPF do ajudante |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincAjudante` | T — texto | 1 | não | Vinculo do 1º motorista (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta1` | T — texto | 8 | não | Placa da carreta 1 Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincCarreta1` | T — texto | 1 | não | Vinculo da carreta 1 (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta2` | T — texto | 8 | não | Placa da carreta 2 Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincCarreta2` | T — texto | 1 | não | Vinculo da carreta 2 (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta3` | T — texto | 8 | não | Placa da carreta 3 Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincCarreta3` | T — texto | 1 | não | Vinculo da carreta 3 (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodFaixaTemperatura` | I — inteiro | 9 | não | Codigo da faixa de temperatura |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJTransportador` | T — texto | 14 | não | CNPJ do Transportador |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJEmbarcador` | T — texto | 14 | não | CNPJ do Embarcador |
| &nbsp;&nbsp;&nbsp;&nbsp;`NaoConfigurarVeiculo` | T — texto | 1 | não | Informe ‘S’ para não iniciar o processo de configuração do veículo terceiro imediatamente (S, N) |
| &nbsp;&nbsp;&nbsp;&nbsp;`InfAdicionais` | R — registro |  | não | ‘N’ registro com os dados das informações adicionais |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Cogido da informação adicionar pode ser obtido no método getTabela (INFORMACOES_ADICIONAIS_PRE_SM) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao` | T — texto | 200 | **sim** | Informação trazida pelo código que pode ser texto, data ou número, caso tipo seja invalido retornara mensagem de erro. Campo Codigo: <= 10 - Numero (com aspas) =11 - Data formato SQL outros - Texto |
| &nbsp;&nbsp;&nbsp;&nbsp;`Gestor` | T — texto | 250 | não | Informar quem é o o responsável pela viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;`ContatoContratante` | R — registro |  | não | Informar quem é o responsável pela viagem (nome/identificação). |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Prioridade` | T — texto | 3 | não | Prioridade atribuída ao contratante. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Contato` | T — texto | 11 | não | CPF do contratante (usuário ativo com liberação para filial/empresa). |
| &nbsp;&nbsp;`Detalhamento` | R — registro |  | **sim** | Registro com os dados guia detalhamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`ColetasEntregas` | R — registro |  | SM | ‘N’ registro com os dados das coletas/entregas Atenção: é obrigatório informar pelo menos uma coleta e uma entrega |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 20 | **sim** | Tipo: COLETA, ENTREGA, TROCAMOTORISTA, TROCANOTAFISCAL, EMISSAODOCUMENTO, MANUTENCAO, ADUANA, PASSAGEMMATRIZ, PERNOITE, FIMVIAGEMFILIAL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 9 | **sim** | Código IBGE da cidade onde vai ocorrer a coleta ou entrega |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cliente` | R — registro |  | não | Registro com os dados do Cliente. Não obrigatório. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | não | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora. Pode passar somente este campo se os dados do cliente já foram cadastrados anteriormente pelo método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país Se houver integração do cliente através deste método se faz necessário informar o CNPJ (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | não | Nome do bairro |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade Se houver integração do cliente através deste método se faz necessário informar o código IBGE (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | não | CEP |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a latitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 |  | Localização longitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a longitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade, para pesquisa por nome caso não seja informado o CodIBGECidade |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 100 | não | Unidade de Federação (Estado), para pesquisa pelo nome ou sigla da UF caso não seja informado o CodIBGECidade. Nos países do exterior, caso não tenha o nome do Estado, pode ser informada a sigla do País |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Pais` | T — texto | 60 | não | Nome ou sigla do País, para pesquisa caso não tenha sido informado o CodIBGECidade. Pode ser informado o nome ou a Sigla de 2 (dois) dígitos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataHoraChegada` | DH — data e hora | 29 | **sim** | Data e hora da chegada no local |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataHoraSaida` | DH — data e hora | 29 | **sim** | Data e hora de saída do local |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao` | T — texto | 500 | não | Observação a cargo do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM. (Para enviar uma solicitação de monitoramento sem produto / viagem vazia, informar o CodProduto = 999999999 ou NCMProduto = 99999999) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`NCMProduto` | T — texto | 8 | não | Código NCM do produto, não precisa informar se optar por informar o código do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | lista | ‘N’ registro com os dados dos documentos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | BIP, CHASSI, LOADNUMBER, CTE, CTRC, LACRE, MANIFESTO, MIC, NOTAFISCAL, PEDIDO, CARGA, MINUTA, INVOICE, OT, PAGAMENTO, DI, CONTAINER ,CRT, OUTROS, SHIPMENT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | Número ou chave do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Peso` | N — numérico | 15 | não | Peso da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`PesoCubado` | N — numérico | 15 | não | Peso cubado da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Volume` | N — numérico | 15 | não | Volume da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cubagem` | N — numérico | 15 | não | Metros cúbicos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CentroCusto` | T — texto | 20 | não | Nome ou classificação do centro de custos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | D — data | 10 | não | Data de agendamento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`ValorServico` | N — numérico | 15 | não | Valor do serviço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao1` | T — texto | 500 | não | Observação livre 1 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao2` | T — texto | 500 | não | Observação livre 2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao3` | T — texto | 500 | não | Observação livre 3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Remetente` | T — texto | 500 | não | Cliente do cliente que vai ser o remetente da viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | N — numérico | 15 | não | Código do cadastro do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | N — numérico | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa estrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 500 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Destinatario` |  |  |  | Cliente do cliente que vai ser o Destinatario da viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | N — numérico | 15 | não | Código do cadastro do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | N — numérico | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa estrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 500 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tomador` |  |  |  | Cliente do cliente que vai ser o Tomador da viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | N — numérico | 15 | não | Código do cadastro do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | N — numérico | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa estrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 500 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;`Rota` | R — registro |  | **sim** | Dados da guia rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodRota` | I — inteiro | 9 | **sim** | Código da rota conforme cadastro da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`LocaisParada` | R — registro |  | lista | Lista de locais de parada permitidos conforme a rota e a apólice. |
| &nbsp;&nbsp;&nbsp;&nbsp;`Polyline` | T — texto |  | não | Polyline representando a rota |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código do local de parada que pode ser obtido consumindo o método getRotas |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodMotivo` | I — inteiro | 9 | **sim** | Código do motivo da parada. Pode ser obitido consumindo o método getTabelas |
| &nbsp;&nbsp;&nbsp;&nbsp;`PontosPassagem` | R — registro |  | lista | Lista de pontos de passagem da rota. No máximo 25 registros. Se forem informados pontos de passagem, obrigatoriamente, devem englobar os locais de coleta e entrega. Devem estar na sua devida ordem de passagem pela rota) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | **sim** | Posição latitudinal do ponto de passagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 | **sim** | Posição longitude do ponto de passagem |
| &nbsp;&nbsp;`CheckList` | R — registro |  | **sim** | Dados da checklist |
| `SolicitarCheckList` |  |  |  | Tipo de checklist que será solicitado automaticamente caso não seja encontrado um anterior aprovado. Opções: NAO, NORMAL, EXPRESSO |
| &nbsp;&nbsp;&nbsp;&nbsp;`TipoEquipamento` | T — texto | 6 | não | Tipo de equipamento. Opções: SATHIB ou GPRS |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | DH — data e hora | 29 | não | Data de agendamento do checklist |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeContato` | T — texto | 150 | não | Nome do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`FoneContato` | T — texto | 15 | não | Fone do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`EmailContato` | T — texto | 100 | não | Email do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`FoneMotorista` | T — texto | 20 | não | Fone do motorista |
| &nbsp;&nbsp;`LiberacaoEngate` | R — registro |  | não | Dados da guia liberação de engate |
| &nbsp;&nbsp;&nbsp;&nbsp;`SolicitarPesquisa` | T — texto | 10 | não | Tipo de pesquisa que será solicitada automaticamente caso não seja encontrada uma pesquisa anterior. Opções: NAO, NORMAL, EXPRESSA |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqVeiculo` | T — texto | 350 | não | Dados da pesquisa sobre o veículo executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqMotorista1` | T — texto | 350 | não | Dados da pesquisa sobre o motorista 1 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqMotorista2` | T — texto | 350 | não | Dados da pesquisa sobre o motorista 2 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqAjudante` | T — texto | 350 | não | Dados da pesquisa sobre o ajudante executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqCarreta1` | T — texto | 350 | não | Dados da pesquisa sobre a carreta 1 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqCarreta2` | T — texto | 350 | não | Dados da pesquisa sobre a carreta 2 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqCarreta3` | T — texto | 350 | não | Dados da pesquisa sobre a carreta 3 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;`LocalizadorAvulso` | R — registro |  | lista | ‘N’ registros com dados de localizador avulso |
| &nbsp;&nbsp;&nbsp;&nbsp;`TerminalTecnologia` | T — texto | 10 | não | Número do terminal da tecnologia |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTecnologia` | I — inteiro | 9 | não | Código da tecnologia conforme tabela |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodModelo` | I — inteiro | 9 | não | Código do modelo da tecnologia conforme tabela |
| &nbsp;&nbsp;`EscoltaArmada` | R — registro |  | não | Dados da guia escolta armada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | ‘N’ registros com dados dos veículos da escolta Placas dos veículos de escolta pré-cadastrados no sistema da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Agentes` | R — registro |  | não | ‘N’ registros com dados dos agentes da escolta CPF dos agentes pré-cadastrados no sistema da Gerenciadora |
| &nbsp;&nbsp;`EscoltaVelada` | R — registro |  | não | Dados da guia escolta velada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | ‘N’ registros com dados dos veículos da velada Placas dos veículos de escolta pré-cadastrados no sistema da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Agentes` | R — registro |  | não | ‘N’ registros com dados dos agentes da escolta CPF dos agentes pré-cadastrados no sistema da Gerenciadora |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setPreSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `PreSM` | R — registro |  | **sim** | Registro com os dados da pré-solicitação de monitoramento |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 |  | Código da pré-solicitação de monitoramento, informar somente para alterar os dados de uma viagem, se estiver incluindo deixar em branco |
| &nbsp;&nbsp;`GeraApenasSigaverde` | T — texto | 1 | não | Paramentro para gerar somente o cálculo do crédito de carbono. Usar: S – Para SIM N – Para NÃO |
| &nbsp;&nbsp;`Compensacao` | N — numérico | 15 | não | Valor em dólar da compensação necessária da viagem |
| &nbsp;&nbsp;`TCO2` | N — numérico | 15 | não | Tonelada de CO2 compativel |
| &nbsp;&nbsp;`Engate` | R — registro |  | **sim** | Registro com os dados da guia engate |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodEmpresa` | I — inteiro | 9 | **sim** | Código da empresa |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodFilial` | I — inteiro | 9 | **sim** | Código da filial |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | **sim** | Placa do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodProprietario` | I — inteiro | 9 | não | Código do proprietário do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincVeiculo` | T — texto | 1 | **sim** | Vinculo do veículo (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTecnologiaRast` | I — inteiro | 9 | não | Código da tecnologia do rastreador |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodModeloRast` | I — inteiro | 9 | não | Código do modelo do rastreador |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumTerminalTecno` | T — texto | 20 | não | Número do terminal tecnologia |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumTerminalIntegra` | I — inteiro | 10 | não | Número do terminal integração |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTecnologiaRast2` | I — inteiro | 9 | não | Código tecnologia rastreador secundário |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodModeloRast2` | I — inteiro | 9 | não | Código modelo rastreador secundário |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumTerminalTecno2` | T — texto | 20 | não | Número do terminal tecnologia de secundário |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumTerminalIntegra2` | I — inteiro | 10 | não | Número do terminal integração de secundário |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPerfilSeguranca` | I — inteiro | 9 | **sim** | Código do perfil de segurança |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodMotorista1` | I — inteiro | 9 | **sim** | Código do 1º motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista1` | I — inteiro | 11 | não | CPF do 1º motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeMotorista1` | T — texto | 100 | não | Nome do 1º motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincMotorista1` | T — texto | 1 | **sim** | Vinculo do 1º motorista (A=agregado, F=funcionário, T=autônomo) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodMotorista2` | I — inteiro | 9 | não | Código do 2º motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista2` | I — inteiro | 11 | não | CPF do 2º motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeMotorista2` | T — texto | 100 | não | Nome do 2º motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincMotorista2` | T — texto | 1 | não | Vinculo do 1º motorista (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodAjudante` | I — inteiro | 9 | não | Código do ajudante |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFAjudante` | I — inteiro | 11 | não | CPF do ajudante |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeAjudante` | T — texto | 100 | não | Nome do ajudante |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincAjudante` | T — texto | 1 | não | Vinculo do 1º motorista (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta1` | T — texto | 8 | não | Placa da carreta 1 |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincCarreta1` | T — texto | 1 | não | Vinculo da carreta 1 (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta2` | T — texto | 8 | não | Placa da carreta 2 |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincCarreta2` | T — texto | 1 | não | Vinculo da carreta 2 (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta3` | T — texto | 8 | não | Placa da carreta 3 |
| &nbsp;&nbsp;&nbsp;&nbsp;`VincCarreta3` | T — texto | 1 | não | Vinculo da carreta 3 (A, F, T) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodFaixaTemperatura` | I — inteiro | 9 | não | Codigo da faixa de temperatura |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJTransportador` | T — texto | 14 | não | CNPJ do transportador |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJEmbarcador` | T — texto | 14 | não | CNPJ do Embarcador |
| &nbsp;&nbsp;&nbsp;&nbsp;`Gestor` | T — texto | 250 | não | Informar quem é o o responsável pela viagem |
| &nbsp;&nbsp;`Detalhamento` | R — registro |  | **sim** | Registro com os dados guia detalhamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`ColetasEntregas` | R — registro |  | SM | ‘N’ registro com os dados das coletas/entregas |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 20 | **sim** | Tipo: COLETA, ENTREGA, TROCAMOTORISTA, TROCANOTAFISCAL, EMISSAODOCUMENTO, MANUTENCAO, ADUANA, PASSAGEMMATRIZ, PERNOITE, FIMVIAGEMFILIAL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 9 | **sim** | Código IBGE da cidade onde vai ocorrer a coleta ou entrega |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cliente` | R — registro |  | não | Registro com os dados do Cliente. Não obrigatório. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | não | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | não | Nome do bairro |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | não | CEP |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 | não | Localização longitudinal do endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`NCMProduto` | T — texto | 8 | não | Código NCM do produto, não precisa informar se optar por informar o código do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | lista | ‘N’ registro com os dados dos documentos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | BIP, CHASSI, LOADNUMBER, CTE, CTRC, LACRE, MANIFESTO, MIC, NOTAFISCAL, PEDIDO, CARGA |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | Número ou chave do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Peso` | N — numérico | 15 | não | Peso da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`PesoCubado` | N — numérico | 15 | não | Peso cubado da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Volume` | N — numérico | 15 | não | Volume da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cubagem` | N — numérico | 15 | não | Metros cúbicos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CentroCusto` | T — texto | 20 | não | Nome ou classificação do centro de custos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | D — data | 10 | não | Data de agendamento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`ValorServico` | N — numérico | 15 | não | Valor do serviço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao1` | T — texto | 500 | não | Observação livre 1 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao2` | T — texto | 500 | não | Observação livre 2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao3` | T — texto | 500 | não | Observação livre 3 |
| &nbsp;&nbsp;`Rota` | R — registro |  | **sim** | Dados da guia rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodRota` | I — inteiro | 9 | **sim** | Código da rota conforme cadastro da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | I — inteiro | 400 | não | Descrição da rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidadeOrigem` | I — inteiro | 7 | não | Código IBGE da cidade de origem |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidadeDestino` | I — inteiro | 7 | não | Código IBGE da cidade de destino |
| &nbsp;&nbsp;&nbsp;&nbsp;`LocaisParada` | R — registro |  | lista | Lista de locais de parada permitidos conforme a rota e a apólice. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código do local de parada que pode ser obtido consumindo o método getRotas |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodMotivo` | I — inteiro | 9 | não | Código do motivo da parada. Pode ser obitido consumindo o método getTabelas |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descrição` | T — texto | 150 | não | Descrição do local de parada |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 60 | não | Cidade/UF do local de parada |
| &nbsp;&nbsp;`CheckList` | R — registro |  | **sim** | Dados da checklist |
| &nbsp;&nbsp;&nbsp;&nbsp;`SolicitarCheckList` | T — texto | 10 | não | Tipo de checklist que será solicitado automaticamente caso não seja encontrado um anterior aprovado. Opções: NAO, NORMAL, EXPRESSA |
| &nbsp;&nbsp;&nbsp;&nbsp;`TipoEquipamento` | T — texto | 6 | não | Tipo de equipamento. Opções: SATHIB ou GPRS |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | DH — data e hora | 29 | não | Data de agendamento do checklist |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeContato` | T — texto | 150 | não | Nome do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`FoneContato` | T — texto | 15 | não | Fone do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`EmailContato` | T — texto | 100 | não | Email do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`FoneMotorista` | T — texto | 20 | não | Fone do motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`Resultado` | T — texto | 250 | não | Resultado da aprovação do checklist |
| &nbsp;&nbsp;`LiberacaoEngate` | R — registro |  | não | Dados da guia liberação de engate |
| &nbsp;&nbsp;&nbsp;&nbsp;`SolicitarPesquisa` | T — texto | 10 | não | Tipo de pesquisa que será solicitada automaticamente caso não seja encontrada uma pesquisa anterior. Opções: NAO, NORMAL, EXPRESSA |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPesqVeiculo` | I — inteiro | 9 | não | Código da pesquisa |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataValidadePesq` | D — data | 10 | não | Data de validade da pesquisa |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqVeiculo` | T — texto | 350 | não | Dados da pesquisa sobre o veículo executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPesqMotorista1` | I — inteiro | 9 | não | Código da pesquisa |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataValidadePesqMot1` | D — data | 10 | não | Data de validade da pesquisa |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqMotorista1` | T — texto | 350 | não | Dados da pesquisa sobre o motorista 1 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPesqMotorista2` | I — inteiro | 9 | não | Código da pesquisa |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataValidadePesqMot2` | D — data | 10 | não | Data de validade da pesquisa |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqMotorista2` | T — texto | 350 | não | Dados da pesquisa sobre o motorista 2 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPesqAjudante` | I — inteiro | 9 | não | Código da pesquisa Data de validade da pesquisa |
| `DataValidadePesqAjudante` |  |  |  |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqAjudante` | T — texto | 350 | não | Dados da pesquisa sobre o ajudante executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPesqCarreta1` | I — inteiro | 9 | não | Código da pesquisa Data de validade da pesquisa |
| `DataValidadePesqCarreta1` |  |  |  |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqCarreta1` | T — texto | 350 | não | Dados da pesquisa sobre a carreta 1 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPesqCarreta2` | I — inteiro | 9 | não | Código da pesquisa Data de validade da pesquisa |
| `DataValidadePesqCarreta2` |  |  |  |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqCarreta2` | T — texto | 350 | não | Dados da pesquisa sobre a carreta 2 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodPesqCarreta3` | I — inteiro | 9 | não | Código da pesquisa Data de validade da pesquisa |
| `DataValidadePesqCarreta3` |  |  |  |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosPesqCarreta3` | T — texto | 350 | não | Dados da pesquisa sobre a carreta 3 executada por terceiros e informada pelo cliente |
| &nbsp;&nbsp;`LocalizadorAvulso` | R — registro |  | lista | ‘N’ registros com dados de localizador avulso |
| &nbsp;&nbsp;&nbsp;&nbsp;`TerminalTecnologia` | T — texto | 10 | não | Número do terminal da tecnologia |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTecnologia` | I — inteiro | 9 | não | Código da tecnologia conforme tabela |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodModelo` | I — inteiro | 9 | não | Código do modelo da tecnologia conforme tabela |
| &nbsp;&nbsp;`EscoltaArmada` | R — registro |  | não | Dados da guia escolta armada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | ‘N’ registros com dados dos veículos da escolta Placa do veículo de escolta pré-cadastrada no sistema da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Agentes` | R — registro |  | não | ‘N’ registros com dados dos agentes da escolta CPF do agente pré-cadastrado no sistema da Gerenciadora |
| &nbsp;&nbsp;`EscoltaVelada` | R — registro |  | não | Dados da guia escolta velada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | ‘N’ registros com dados dos veículos da velada Placa do veículo de escolta pré-cadastrada no sistema da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Agentes` | R — registro |  | não | ‘N’ registros com dados dos agentes da escolta CPF do agente pré-cadastrado no sistema da Gerenciadora |
| &nbsp;&nbsp;`Status` | R — registro |  | não | Status de aprovado das guias (“S” para sem inconsistências, “N” para guia que apresenta alguma inconsistência, e “I” para item não obrigatório segunda a apólice). Nem todas as inconsistências são impeditivas de efetivação da Pré-SM. |
| &nbsp;&nbsp;&nbsp;&nbsp;`Engate` | T — texto | 1 | **sim** | Guia Engate aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Detalhamento` | T — texto | 1 | **sim** | Guia Detalhamento aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Rota` | T — texto | 1 | **sim** | Guia Rota aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`TesteRastreador` | T — texto | 1 | **sim** | Guia Checklist aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`LiberacaoEngate` | T — texto | 1 | **sim** | Guia Liberação Engate aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`LocalizadorSecundario` | T — texto | 1 | **sim** | Guia Localizador Secundário aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`LocalizadorAvulso` | T — texto | 1 | **sim** | Guia Localizador Avulso aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`EscoltaVelada` | T — texto | 1 | **sim** | Guia Escolta Velada aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`EscoltaArmada` | T — texto | 1 | **sim** | Guia Escolta Armada aprovada (S, N ou I) |
| &nbsp;&nbsp;`Inconsistencias` | R — registro |  | lista | Lista de inconsistências encontradas na validação da Pré-SM |
| &nbsp;&nbsp;&nbsp;&nbsp;`Guia` | T — texto | 30 | **sim** | Identificação da Guia |
| &nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | não | Identificação do Tipo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Identificacao` | T — texto | 30 | não | Placa, CPF, conforme o tipo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 | não | Descrição, Nome, conforme o tipo |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodAlerta` | I — inteiro | 9 | não | Código da mensagem de alerta, cadastro Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`MsgAlerta` | T — texto | 250 | não | Texto da mensagem de alerta/inconsistência |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataInicial` | DH — data e hora | 29 | não | Conforme o tipo de inconsistência, exemplo data inicial de uma liberação de exceção |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataFinal` | DH — data e hora | 29 | não | Conforme o tipo de inconsistência, exemplo data final de uma liberação de exceção |
| &nbsp;&nbsp;`Operacao` | T — texto |  | não | Operação da viagem |
| &nbsp;&nbsp;`Responsavel` | T — texto |  | não | Responsavel da viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;`Motivos` | R — registro |  | lista | Lista de motivos da inconsistência (essa lista pode ser gerada conforme o tipo de inconsistência) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Código` | I — inteiro | 9 | não | Código do motivo |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Motivos` | T — texto | 250 | não | Descrição do motivo |

---

## setAgendamentoViagem

Página 86 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `DadosAgendamento` | R — registro |  | **sim** | Registro com os dados da pré-solicitação de monitoramento |
| &nbsp;&nbsp;`CodSolicitacao` | I — inteiro |  | **sim** | Codigo da viagem |
| &nbsp;&nbsp;`Previsaochegada` | DH — data e hora | 12 | **sim** | Data com a previsão de chegada no cliente |
| &nbsp;&nbsp;`Ordem` | I — inteiro |  | não | Número da ordem a entrega(Caso não colocar ira buscar da última) |
| &nbsp;&nbsp;`StatusAgendamento` | T — texto | 40 | não | Status do agendamento |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Método` | T — texto | 50 | **sim** | Retorno do metodo enviado |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 9 | **sim** | Codigo do erro retornado na requisição |
| `MsgErro` | T — texto | 500 | **sim** | Texto com o erro contido na requisição |
| `DadosAgendamento` | R — registro |  | **sim** | Registro com os dados da pré-solicitação de monitoramento |
| &nbsp;&nbsp;`CodSolicitacao` | I — inteiro |  | **sim** | Codigo da viagem |
| &nbsp;&nbsp;`Previsaochegada` | D — data |  | **sim** | Data com a previsão de chegada no cliente |
| &nbsp;&nbsp;`Ordem` | I — inteiro |  | não | Numero da ordem a entrega(Caso não colocar ira buscar da ultima) |
| &nbsp;&nbsp;`StatusAgendamento` | T — texto |  | não | Status do agendamento |

---

## setSituacaoCargaViagem

Página 88 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `DadosCarga` | R — registro |  | **sim** | Registro dos dados da carga |
| &nbsp;&nbsp;`CodSolicitacao` | I — inteiro |  | **sim** | Código da solicitação de monitoramento |
| &nbsp;&nbsp;`CodStatusCarga` | I — inteiro |  | **sim** | Código do status da carga a ser atualizado buscar no getTabelas: (STATUS_CARGA_VIAGEM) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Método` | T — texto | 50 | **sim** | Retorno do metodo enviado |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 9 | **sim** | Codigo do erro retornado na requisição |
| `MsgErro` | T — texto | 500 | **sim** | Texto com o erro contido na requisição |
| `DadosAgendamento` | R — registro |  | **sim** | Registro com os dados da pré-solicitação de monitoramento |
| &nbsp;&nbsp;`CodSolicitacao` | I — inteiro |  | **sim** | Codigo da viagem |
| &nbsp;&nbsp;`Previsaochegada` | D — data |  | **sim** | Data com a previsão de chegada no cliente |
| &nbsp;&nbsp;`Ordem` | I — inteiro |  | não | Numero da ordem a entrega(Caso não colocar ira buscar da ultima) |
| &nbsp;&nbsp;`StatusAgendamento` | T — texto |  | não | Codigo do status do agendamentobuscar no getTabelas(STATUS_AGENDAMENTO) |

---

## getPreSM

Página 89 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodPreSolicitacao` | I — inteiro | 9 | não | Código da pré-solicitação de monitoramento retornado no momento da inclusão com o método setPreSM |
| `PlacaVeiculo` | I — inteiro | 9 | não | Opcionalmente pode informar a placa do veículo ao invés do CodPreSolicitacao. Se informar a placa, o sistema vai procurar por uma a Pré-SM em aberto. |

### Retorno

_(sem campos extraídos)_

---

## setEfetivaPreSM

Página 90 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodPreSolicitacao` | I — inteiro | 9 | **sim** | Código da pré-solicitação de monitoramento |
| `JaPassouRaioOrigem` | T — texto | 1 | **sim** | Se já passou pelo raio de origem (S, N) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setEfetivaPreSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `CodPreSolicitacao` | I — inteiro | 9 | **sim** | Código da pré-solicitação de monitoramento |
| `CodSolicitacao` | I — inteiro | 9 | **sim** | Se efetivou e não devolveu nenhum erro, este campo vai estar preenchido com o código da solicitação de monitoramento |

---

## getStatusViagem

Página 90 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Documentos` | T — texto | 500 | não | Array de documentos onde todos os documentos devem bater com a viagem desejada. Documentos presentes em qualquer coleta ou entrega da viagem (não obrigatório quando informado código de viagem ou código da pre sm) |
| `CodSolicitacao` | I — inteiro | 9 | não | código da viagem para busca (não obrigatório quando informado documento, placa do veículo ou código da pré-sm) |
| `CodPreSolicitacao` | I — inteiro | 9 | não | Código da pre sm para busca (não obrigatório quando informado documento, placa do veículo ou código da viagem) |
| `Placa` | T — texto | 8 | não | Placa do veículo para busca (não obrigatório quando informado documento, código da viagem ou código da pré-sm) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setPreSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `SM` | R — registro |  | **sim** | Registro com os dados da solicitação de monitoramento |
| &nbsp;&nbsp;`CodSolicitacao` | I — inteiro | 9 |  | Código da solicitação de monitoramento |
| &nbsp;&nbsp;`CodFilial` | I — inteiro | 9 | **sim** | Código da filial |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | **sim** | Placa do veículo atual |
| &nbsp;&nbsp;`VincVeiculo` | T — texto | 1 | **sim** | Vinculo do veiculo (A=agregado, F=funcionário, T=autônomo) |
| &nbsp;&nbsp;`CodPerfilSeguranca` | I — inteiro | 9 | **sim** | Código do perfil de segurança |
| &nbsp;&nbsp;`CodRota` | I — inteiro | 9 | **sim** | código da rota da viagem |
| &nbsp;&nbsp;`PlacaCarreta1Atual` | T — texto | 8 | **sim** | Placa da carreta1 atual da viagem |
| &nbsp;&nbsp;`PlacaCarreta1Original` | T — texto | 8 | **sim** | Placa da carreta1 original do lançamento da viagem |
| &nbsp;&nbsp;`VincCarreta1` | T — texto | 1 | **sim** | Vinculo da carreta1(A=agregado, F=funcionário, T=autônomo) |
| &nbsp;&nbsp;`CpfMotorista1Atual` | I — inteiro | 11 | **sim** | Cpf do motorista atual da viagem |
| &nbsp;&nbsp;`CpfMotorista1Original` | I — inteiro | 11 | **sim** | Cpf do motorista original do lançamento da viagem |
| &nbsp;&nbsp;`VincMotorista1` | T — texto | 1 | **sim** | Vinculo do motorista (A=agregado, F=funcionário, T=autônomo) |
| &nbsp;&nbsp;`CnpjClienteDest` | I — inteiro | 14 | **sim** | Cnpj do cliente de origem |
| &nbsp;&nbsp;`CnpjClienteOrig` | I — inteiro | 14 | **sim** | Cnpj do cliente de destino |
| &nbsp;&nbsp;`StatusViagem` | T — texto | 2 | **sim** | Status atual da viagem: AB-Em Aberto CI-Cancelada depois do Inicio CA-Cancelada ainda em Aberta FI-Finalizada pelo Usuario FS-Finalizada pelo Sistema IN-Iniciada manualmente IS-Iniciada pelo Sistema |
| &nbsp;&nbsp;`DataHoraPrevIni` | DH — data e hora | 29 | **sim** | Previsão para inicio da viagem |
| &nbsp;&nbsp;`DataHoraPrevFim` | DH — data e hora | 29 | **sim** | Previsão para fim da viagem |
| &nbsp;&nbsp;`DataHoraRealIni` | DH — data e hora | 29 | **sim** | Início real da viagem |
| &nbsp;&nbsp;`DataHoraUltPosicao` | DH — data e hora | 29 | **sim** | Data e hora da posição atual |
| &nbsp;&nbsp;`LatitudeUltPosicao` | N — numérico | 15 | **sim** | Latitude da última posição |
| &nbsp;&nbsp;`LongitudeUltPosicao` | N — numérico | 15 | **sim** | Longitude da última posição |
| &nbsp;&nbsp;`RefUltPosicao` | T — texto | 250 | **sim** | Referencia da ultima posição |
| &nbsp;&nbsp;&nbsp;&nbsp;`ColetasEntregas` | R — registro |  | **sim** | ‘N’ registro com os dados das coletas/entregas |
| &nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 20 | **sim** | Tipo: COLETA, ENTREGA, TROCAMOTORISTA, TROCANOTAFISCAL, EMISSAODOCUMENTO, MANUTENCAO, ADUANA, PASSAGEMMATRIZ, PERNOITE, FIMVIAGEMFILIAL |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 9 | **sim** | Código IBGE da cidade onde vai ocorrer a coleta ou entrega |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cliente` | R — registro |  | não | Registro com os dados do Cliente. Não obrigatório. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | não | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | não | Nome do bairro |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | não | CEP |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 | não | Localização longitudinal do endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`NCMProduto` | T — texto | 8 | não | Código NCM do produto, não precisa informar se optar por informar o código do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | lista | ‘N’ registro com os dados dos documentos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | BIP, CHASSI, LOADNUMBER, CTE, CTRC, LACRE, MANIFESTO, MIC, NOTAFISCAL, PEDIDO, CARGA |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | Número ou chave do documento |

---

## setCancelaPreSM

Página 95 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodPreSolicitacao` | I — inteiro | 9 | **sim** | Código da pré-solicitação de monitoramento |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setCancelaPreSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `CodPreSolicitacao` | I — inteiro | 9 | **sim** | Código da pré-solicitação de monitoramento |
| `Cancelou` | T — texto | 3 | **sim** | Se o cancelamento obteve sucesso (SIM, NAO) |

---

## getConsultaPreSMAberta

Página 96 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Placa` | T — texto | 8 | não | Placa do veículo, deixar em branco para consultar todas Deve-se analisar as máscaras das placas conforme tabela 12 |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getConsultaPreSMAberta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `PreSMs` | R — registro |  | não |  |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código da pré-solicitação de monitoramento |
| &nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo |
| &nbsp;&nbsp;`Data` | DH — data e hora | 29 | **sim** | Data/hora de inclusão da Pré-SM |
| &nbsp;&nbsp;`DataPrevInicio` | DH — data e hora | 29 | não | Data de previsão de ínicio da viagem |
| &nbsp;&nbsp;`DataPrevFim` | DH — data e hora | 29 | não | Data de previsão de término da viagem |
| &nbsp;&nbsp;`CodIBGECidadeOrigem` | I — inteiro | 9 | não | Código IBGE da cidade de origem |
| &nbsp;&nbsp;`CidadeOrigem` | T — texto | 100 | não | Nome / UF da cidade de origem |
| &nbsp;&nbsp;`CodIBGECidadeDestino` | I — inteiro | 9 | não | Código IBGE da cidade de destino |
| &nbsp;&nbsp;`CidadeDestino` | T — texto | 100 | não | Nome / UF da cidade de destino |
| &nbsp;&nbsp;`CNPJClienteOrig` | T — texto | 14 | não | CNPJ do cliente de origem |
| &nbsp;&nbsp;`RazaoClienteOrig` | T — texto | 60 | não | Razão/nome do cliente de origem |
| &nbsp;&nbsp;`CNPJClienteDest` | T — texto | 14 | não | CNPJ do cliente de destino |
| &nbsp;&nbsp;`RazaoClienteDest` | T — texto | 60 | não | Razão/nome do cliente de destino |

---

## getStatusPreSM

Página 98 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodPreSolicitacao` | I — inteiro | 9 | **sim** | Código da Pré-Solicitação de Monitoramento |
| `Placa` | T — texto | 8 | não | Placa do veículo |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getStatusPreSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `CodPreSolicitacao` | I — inteiro | 9 | **sim** | Código da pré-solicitação de monitoramento |
| `ChegouOrigem` | T — texto | 3 | **sim** | Já chegou na origem da viagem, primeira coleta (SIM, NAO) |
| `DataChegadaOrigem` | DH — data e hora | 29 | não | Data/Hora que o veículo chegou no raio de origem |
| `SaiuOrigem` | T — texto | 3 | **sim** | Já saiu da origem da viagem, primeira coleta (SIM, NAO) |
| `DataSaidaOrigem` | DH — data e hora | 29 | não | Data/Hora que o veículo saiu do raio de origem |
| `HoraPosicaoAtual` | DH — data e hora | 29 | não | Data/hora da posição atual do veículo |
| `CidadeUltimaPosicao` | T — texto | 90 | não | Nome da cidade da última posição |
| `CodCidadeIbge` | T — texto | 10 | não | Código IBGE da cidade da última posição |
| `UFUltimaPosicao` | T — texto | 2 | não | UF da última posição |
| `DistanciaOrigem` | T — texto | 50 | não | Distância da última posição até a origem da viagem |
| `PrevisaoSegundos` | T — texto | 50 | não | Previsão de chegada na origem em segundos |
| `PrevisaoFormatada` | T — texto | 50 | não | Previsão de chegada na origem dd/hh/mm |
| `EmViagem` | T — texto | 3 | não | Se o veículo está em viagem (SIM/NÃO) |
| `ViagemPeloCliente` | T — texto | 3 | não | Se o veículo está em viagem pelo cliente (SIM/NÃO) |

---

## getStatusColetas

Página 99 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodPreSolicitacao` | I — inteiro | 9 | **sim** | Código da Pré-Solicitação de Monitoramento ▪ Exemplo de Requisição |
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getStatusPreSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `CodPreSolicitacao` | I — inteiro | 9 | **sim** | Código da pré-solicitação de monitoramento |
| `ChegouOrigem` | T — texto | 3 | **sim** | Já chegou na origem da viagem, primeira coleta (SIM, NAO) |
| `DataChegadaOrigem` | DH — data e hora | 29 | não | Data/Hora que o veículo chegou no raio de origem |
| `SaiuOrigem` | T — texto | 3 | **sim** | Já saiu da origem da viagem, primeira coleta (SIM, NAO) |
| `DataSaidaOrigem` | DH — data e hora | 29 | não | Data/Hora que o veículo saiu do raio de origem |
| `HoraPosicaoAtual` | DH — data e hora | 29 | não | Data/hora da posição atual do veículo |
| `CidadeUltimaPosicao` | T — texto | 90 | não | Nome da cidade da última posição |
| `CodCidadeIbge` | T — texto | 10 | não | Código IBGE da cidade da última posição |
| `UFUltimaPosicao` | T — texto | 2 | não | UF da última posição |
| `DistanciaOrigem` | T — texto | 50 | não | Distância da última posição até a origem da viagem |
| `PrevisaoSegundos` | T — texto | 50 | não | Previsão de chegada na origem em segundos |
| `PrevisaoFormatada` | T — texto | 50 | não | Previsão de chegada na origem dd/hh/mm |
| `EmViagem` | T — texto | 3 | não | Se o veículo está em viagem (SIM/NÃO) |
| `ViagemPeloCliente` | T — texto | 3 | não | Se o veículo está em viagem pelo cliente (SIM/NÃO) ▪ Exemplo de Retorno XML <?xml version="1.0" encoding="ISO-8859-1"?> <retStatusColetas> <Ambiente>Homologacao</Ambiente> <Metodo>getStatusColetas</Metodo> <Login>login</Login> <CodErro>0</CodErro> <CodPreSolicitacao>5045988</CodPreSolicitacao> <Coletas> <Coleta> <CodColeta>16033219</CodColeta> <Ordem>1</Ordem> <ChegouOrigem>NAO</ChegouOrigem> <SaiuOrigem>NAO</SaiuOrigem> <CodCidadeIbge>0</CodCidadeIbge> </Coleta> </Coletas> </retStatusColetas> |

### Retorno

_(sem campos extraídos)_

---

## getEventoFimViagem

Página 101 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodPreSolicitacao` | I — inteiro | 9 | não | Código da Pré-Solicitação de Monitoramento |
| `CodSolicitacao` | I — inteiro | 9 | não | Código da Solicitação de Monitoramento |
| `DataInicial` | D — data | 10 | não | Data inicial do evento de fim de viagem |
| `DataFinal` | D — data | 10 | não | Data final do evento de fim de viagem |
| `StatusViagem` | T — texto | 1 | não | T: Todas, F: Finalizadas, A: Andamento, AB: Efetivada em aberto |
| `CNPJRemDest` | T — texto | 14 | não | CNPJ do remetente ou destinatário da viagem |
| `Placa` | T — texto | 8 | não | Filtro opcional por placa |

### Retorno

_(sem campos extraídos)_

---

## setCancelaSM

Página 107 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodSolicitacao` | I — inteiro | 9 | **sim** | Código da Solicitação de Monitoramento |
| `Motivo` | T — texto | 500 | **sim** | Descrição do motivo do cancelamento |
| `Forcado` | T — texto | 3 | não | Cancelamento forçado: não necessita da autorização manual do supervisor encarregado do rastreamento (informar SIM ou NÃO) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setCancelaSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `CodSolicitacao` | I — inteiro | 9 | **sim** | Código da solicitação de monitoramento |
| `Cancelou` | T — texto | 3 | **sim** | Se aceitou o pedido de cancelamento (SIM, NAO) |

---

## setFinalizaSM

Página 108 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodSolicitacao` | I — inteiro | 9 | **sim** | Código da Solicitação de Monitoramento |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setFinalizaSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `CodSolicitacao` | I — inteiro | 9 | **sim** | Código da solicitação de monitoramento |
| `Finalizou` | T — texto | 3 | **sim** | Se finalizou a viagme com sucesso (SIM/NÃO) |

---

## getImpressaoSM

Página 110 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodSolicitacao` | I — inteiro | 9 | **sim** | Código da Solicitação de Monitoramento Se imprime os locais de coleta/entrega (S/N) |
| `ImprimeColetasEntregas` |  |  |  |  |
| `ImprimeLocaisParada` | T — texto | 1 | **sim** | Se imprime os locais de parada da viagem (S/N) |
| `ImprimeRota` | T — texto | 1 | **sim** | Se imprime a descrição da rota (S/N) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getImpressaoSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `CodSolicitacao` | I — inteiro | 9 | **sim** | Código da Solicitação de Monitoramento Se imprime os locais de coleta/entrega (S/N) |
| `ImprimeColetasEntregas` |  |  |  |  |
| `ImprimeLocaisParada` | T — texto | 1 | **sim** | Se imprime os locais de parada da viagem (S/N) |
| `ImprimeRota` | T — texto | 1 | **sim** | Se imprime a descrição da rota (S/N) |
| `CodSolicitacao` | I — inteiro | 9 | **sim** | Código da solicitação de monitoramento |
| `URL` | T — texto | 250 | **sim** | URL do arquivo PDF contendo a impressão da Viagem |

---

## setRevisaoPreSm

Página 111 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `SM` | R — registro |  | **sim** | Registro com os dados da solicitação de monitoramento a ser revisado |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código solicitação de monitoramento que deseja revisar |
| &nbsp;&nbsp;`Detalhamento` | R — registro |  | **sim** | Registro com os dados guia detalhamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`ColetasEntregas` | R — registro |  | SM | ‘N’ registro com os dados das coletas/entregas Atenção: é obrigatório informar pelo menos uma coleta e uma entrega |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 20 | **sim** | Tipo: COLETA, ENTREGA, TROCAMOTORISTA, TROCANOTAFISCAL, EMISSAODOCUMENTO, MANUTENCAO, ADUANA, PASSAGEMMATRIZ, PERNOITE, FIMVIAGEMFILIAL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 9 | **sim** | Código IBGE da cidade onde vai ocorrer a coleta ou entrega |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cliente` | R — registro |  | não | Registro com os dados do Cliente. Não obrigatório. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | não | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora. Pode passar somente este campo se os dados do cliente já foram cadastrados anteriormente pelo método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país Se houver integração do cliente através deste método se faz necessário informar o CNPJ (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | não | Nome do bairro |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade Se houver integração do cliente através deste método se faz necessário informar o código IBGE (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | não | CEP |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a latitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 |  | Localização longitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a longitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade, para pesquisa por nome caso não seja informado o CodIBGECidade |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 100 | não | Unidade de Federação (Estado), para pesquisa pelo nome ou sigla da UF caso não seja informado o CodIBGECidade. Nos países do exterior, caso não tenha o nome do Estado, pode ser informada a sigla do País |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Pais` | T — texto | 60 | não | Nome ou sigla do País, para pesquisa caso não tenha sido informado o CodIBGECidade. Pode ser informado o nome ou a Sigla de 2 (dois) dígitos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataHoraChegada` | DH — data e hora | 29 | **sim** | Data e hora da chegada no local |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataHoraSaida` | DH — data e hora | 29 | **sim** | Data e hora de saída do local |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao` | T — texto | 500 | não | Observação a cargo do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM. (Para enviar uma solicitação de monitoramento sem produto / viagem vazia, informar o CodProduto = 999999999 ou NCMProduto = 99999999) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`NCMProduto` | T — texto | 8 | não | Código NCM do produto, não precisa informar se optar por informar o código do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | lista | ‘N’ registro com os dados dos documentos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | BIP, CHASSI, LOAD NUMBER, CTE, CTRC, LACRE, MANIFESTO, MIC, NOTA FISCAL, PEDIDO |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | Número ou chave do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Peso` | N — numérico | 15 | não | Peso da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`PesoCubado` | N — numérico | 15 | não | Peso cubado da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Volume` | N — numérico | 15 | não | Volume da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cubagem` | N — numérico | 15 | não | Metros cúbicos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CentroCusto` | T — texto | 20 | não | Nome ou classificação do centro de custos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | D — data | 10 | não | Data de agendamento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`ValorServico` | N — numérico | 15 | não | Valor do serviço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao1` | T — texto | 500 | não | Observação livre 1 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao2` | T — texto | 500 | não | Observação livre 2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao3` | T — texto | 500 | não | Observação livre 3 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Remetente` | T — texto | 500 | não | Cliente do cliente que vai ser o remetente da viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | N — numérico | 15 | não | Código do cadastro do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | N — numérico | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa estrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 500 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Destinatario` |  |  |  | Cliente do cliente que vai ser o Destinatario da viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | N — numérico | 15 | não | Código do cadastro do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | N — numérico | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa estrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 500 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tomador` |  |  |  | Cliente do cliente que vai ser o Tomador da viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | N — numérico | 15 | não | Código do cadastro do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | N — numérico | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa estrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 500 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | DH — data e hora | 29 | não | Data de agendamento do checklist |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeContato` | T — texto | 150 | não | Nome do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`FoneContato` | T — texto | 15 | não | Fone do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`EmailContato` | T — texto | 100 | não | Email do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`FoneMotorista` | T — texto | 20 | não | Fone do motorista |
| &nbsp;&nbsp;`LocalizadorAvulso` | R — registro |  | lista | ‘N’ registros com dados de localizador avulso |
| &nbsp;&nbsp;&nbsp;&nbsp;`TerminalTecnologia` | T — texto | 10 | não | Número do terminal da tecnologia |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTecnologia` | I — inteiro | 9 | não | Código da tecnologia conforme tabela |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodModelo` | I — inteiro | 9 | não | Código do modelo da tecnologia conforme tabela |
| &nbsp;&nbsp;`EscoltaArmada` | R — registro |  | não | Dados da guia escolta armada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | ‘N’ registros com dados dos veículos da escolta Placas dos veículos de escolta pré-cadastrados no sistema da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Agentes` | R — registro |  | não | ‘N’ registros com dados dos agentes da escolta CPF dos agentes pré-cadastrados no sistema da Gerenciadora |
| &nbsp;&nbsp;`EscoltaVelada` | R — registro |  | não | Dados da guia escolta velada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | ‘N’ registros com dados dos veículos da velada Placas dos veículos de escolta pré-cadastrados no sistema da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Agentes` | R — registro |  | não | ‘N’ registros com dados dos agentes da escolta CPF dos agentes pré-cadastrados no sistema da Gerenciadora |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setPreSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `SM` | R — registro |  | **sim** | Registro com os dados da solicitação de monitoramento |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código da solicitação de monitoramento |
| &nbsp;&nbsp;`Detalhamento` | R — registro |  | **sim** | Registro com os dados guia detalhamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`ColetasEntregas` | R — registro |  | SM | ‘N’ registro com os dados das coletas/entregas |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 20 | **sim** | Tipo: COLETA, ENTREGA, TROCAMOTORISTA, TROCANOTAFISCAL, EMISSAODOCUMENTO, MANUTENCAO, ADUANA, PASSAGEMMATRIZ, PERNOITE, FIMVIAGEMFILIAL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 9 | **sim** | Código IBGE da cidade onde vai ocorrer a coleta ou entrega |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cliente` | R — registro |  | não | Registro com os dados do Cliente. Não obrigatório. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | não | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | não | Nome do bairro |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | não | CEP |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 | não | Localização longitudinal do endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`NCMProduto` | T — texto | 8 | não | Código NCM do produto, não precisa informar se optar por informar o código do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | lista | ‘N’ registro com os dados dos documentos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | BIP, CHASSI, LOADNUMBER, CTE, CTRC, LACRE, MANIFESTO, MIC, NOTAFISCAL, PEDIDO, CARGA |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | Número ou chave do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Peso` | N — numérico | 15 | não | Peso da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`PesoCubado` | N — numérico | 15 | não | Peso cubado da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Volume` | N — numérico | 15 | não | Volume da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cubagem` | N — numérico | 15 | não | Metros cúbicos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CentroCusto` | T — texto | 20 | não | Nome ou classificação do centro de custos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | D — data | 10 | não | Data de agendamento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`ValorServico` | N — numérico | 15 | não | Valor do serviço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao1` | T — texto | 500 | não | Observação livre 1 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao2` | T — texto | 500 | não | Observação livre 2 |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Observacao3` | T — texto | 500 | não | Observação livre 3 |
| &nbsp;&nbsp;`Rota` | R — registro |  | **sim** | Dados da guia rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodRota` | I — inteiro | 9 | **sim** | Código da rota conforme cadastro da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | I — inteiro | 400 | não | Descrição da rota |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidadeOrigem` | I — inteiro | 7 | não | Código IBGE da cidade de origem |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidadeDestino` | I — inteiro | 7 | não | Código IBGE da cidade de destino |
| &nbsp;&nbsp;&nbsp;&nbsp;`LocaisParada` | R — registro |  | lista | Lista de locais de parada permitidos conforme a rota e a apólice. |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código do local de parada que pode ser obtido consumindo o método getRotas |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodMotivo` | I — inteiro | 9 | não | Código do motivo da parada. Pode ser obitido consumindo o método getTabelas |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descrição` | T — texto | 150 | não | Descrição do local de parada |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 60 | não | Cidade/UF do local de parada |
| &nbsp;&nbsp;`CheckList` | R — registro |  | **sim** | Dados da checklist |
| &nbsp;&nbsp;&nbsp;&nbsp;`SolicitarCheckList` | T — texto | 10 | não | Tipo de checklist que será solicitado automaticamente caso não seja encontrado um anterior aprovado. Opções: NAO, NORMAL, EXPRESSA |
| &nbsp;&nbsp;&nbsp;&nbsp;`TipoEquipamento` | T — texto | 6 | não | Tipo de equipamento. Opções: SATHIB ou GPRS |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | DH — data e hora | 29 | não | Data de agendamento do checklist |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeContato` | T — texto | 150 | não | Nome do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`FoneContato` | T — texto | 15 | não | Fone do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`EmailContato` | T — texto | 100 | não | Email do contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`FoneMotorista` | T — texto | 20 | não | Fone do motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`Resultado` | T — texto | 250 | não | Resultado da aprovação do checklist |
| &nbsp;&nbsp;`LocalizadorAvulso` | R — registro |  | lista | ‘N’ registros com dados de localizador avulso |
| &nbsp;&nbsp;&nbsp;&nbsp;`TerminalTecnologia` | T — texto | 10 | não | Número do terminal da tecnologia |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTecnologia` | I — inteiro | 9 | não | Código da tecnologia conforme tabela |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodModelo` | I — inteiro | 9 | não | Código do modelo da tecnologia conforme tabela |
| &nbsp;&nbsp;`EscoltaArmada` | R — registro |  | não | Dados da guia escolta armada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | ‘N’ registros com dados dos veículos da escolta Placa do veículo de escolta pré-cadastrada no sistema da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Agentes` | R — registro |  | não | ‘N’ registros com dados dos agentes da escolta CPF do agente pré-cadastrado no sistema da Gerenciadora |
| &nbsp;&nbsp;`EscoltaVelada` | R — registro |  | não | Dados da guia escolta velada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | ‘N’ registros com dados dos veículos da velada Placa do veículo de escolta pré-cadastrada no sistema da Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`Agentes` | R — registro |  | não | ‘N’ registros com dados dos agentes da escolta CPF do agente pré-cadastrado no sistema da Gerenciadora |
| &nbsp;&nbsp;`Status` | R — registro |  | não | Status de aprovado das guias (“S” para sem inconsistências, “N” para guia que apresenta alguma inconsistência, e “I” para item não obrigatório segunda a apólice). Nem todas as inconsistências são impeditivas de efetivação da Pré-SM. |
| &nbsp;&nbsp;&nbsp;&nbsp;`Engate` | T — texto | 1 | **sim** | Guia Engate aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Detalhamento` | T — texto | 1 | **sim** | Guia Detalhamento aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Rota` | T — texto | 1 | **sim** | Guia Rota aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`TesteRastreador` | T — texto | 1 | **sim** | Guia Checklist aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`LiberacaoEngate` | T — texto | 1 | **sim** | Guia Liberação Engate aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`LocalizadorSecundario` | T — texto | 1 | **sim** | Guia Localizador Secundário aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`LocalizadorAvulso` | T — texto | 1 | **sim** | Guia Localizador Avulso aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`EscoltaVelada` | T — texto | 1 | **sim** | Guia Escolta Velada aprovada (S, N ou I) |
| &nbsp;&nbsp;&nbsp;&nbsp;`EscoltaArmada` | T — texto | 1 | **sim** | Guia Escolta Armada aprovada (S, N ou I) |
| &nbsp;&nbsp;`Inconsistencias` | R — registro |  | lista | Lista de inconsistências encontradas na validação da Pré-SM |
| &nbsp;&nbsp;&nbsp;&nbsp;`Guia` | T — texto | 30 | **sim** | Identificação da Guia |
| &nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | não | Identificação do Tipo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Identificacao` | T — texto | 30 | não | Placa, CPF, conforme o tipo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 | não | Descrição, Nome, conforme o tipo |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodAlerta` | I — inteiro | 9 | não | Código da mensagem de alerta, cadastro Gerenciadora |
| &nbsp;&nbsp;&nbsp;&nbsp;`MsgAlerta` | T — texto | 250 | não | Texto da mensagem de alerta/inconsistência |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataInicial` | DH — data e hora | 29 | não | Conforme o tipo de inconsistência, exemplo data inicial de uma liberação de exceção |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataFinal` | DH — data e hora | 29 | não | Conforme o tipo de inconsistência, exemplo data final de uma liberação de exceção |
| &nbsp;&nbsp;&nbsp;&nbsp;`Motivos` | R — registro |  | lista | Lista de motivos da inconsistência (essa lista pode ser gerada conforme o tipo de inconsistência) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Código` | I — inteiro | 9 | não | Código do motivo |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Motivos` | T — texto | 250 | não | Descrição do motivo |

---

## setIncluirDocumentoViagem

Página 122 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML |
| `ViagemDocumentos` | R — registro |  | **sim** | Dados viagem e dos documentos que serão inserido |
| &nbsp;&nbsp;`CodSolicitacao` | I — inteiro | 9 | **sim** | Código da solicitação de monitoramento |
| &nbsp;&nbsp;`Documentos` | R — registro | 8 | **sim** | Array de documentos |
| &nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | Tipo do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | Número do documento |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 25 | **sim** | "setIncluirDocumentoViagem" |
| `CodErro` | I — inteiro | 3 | **sim** | Codigo do tipo de erro |
| `MsgErro` | T — texto | 100 | **sim** | Mensagem contendo o tipo de erro |
| `ViagemDocumentos` | R — registro |  | **sim** | Contem o codigo da solicitação e os documentos |
| &nbsp;&nbsp;`CodSolicitacao` | I — inteiro | 9 | **sim** | Código da solicitação de moniteramento |
| &nbsp;&nbsp;`Documentos` | T — texto | 8 | **sim** | Array com tipo e numero de cada documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | Tipos dos documentos já existentes |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | (Número do documento a ser inserido 7. Viagens de Modelo |

---

## setPreSMdeModelo

Página 124 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Modelo` | R — registro |  | **sim** | Código do modelo e informações variáveis |
| &nbsp;&nbsp;`CodModelo` | I — inteiro | 9 | **sim** | Código do modelo de Pré-SM |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | **sim** | Placa do veículo/cavalo Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`VincVeiculo` | T — texto | 1 | **sim** | Vínculo do veículo (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`CPFMotorista1` | T — texto | 11 | não | CPF do motorista principal |
| &nbsp;&nbsp;`VincMotorista1` | T — texto | 1 | **sim** | Vínculo do motorista 1 (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`CPFMotorista2` | T — texto | 11 | não | CPF do 2º motorista |
| &nbsp;&nbsp;`VincMotorista2` | T — texto | 1 | não | Vínculo do motorista 2 (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`CPFAjudante` | T — texto | 11 | não | CPF do Ajudante |
| &nbsp;&nbsp;`VincAjudante` | T — texto | 1 | não | Vínculo do ajudante (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`PlacaCarreta1` | T — texto | 8 | não | Placa da carreta Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`VincCarreta1` | T — texto | 1 | não | Vínculo da carreta (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`PlacaCarreta2` | T — texto | 8 | não | Placa da 2ª carreta Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`VincCarreta2` | T — texto | 1 | não | Vínculo da carreta (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`PlacaCarreta3` | T — texto | 8 | não | Placa da 3ª carreta Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`VincCarreta3` | T — texto | 1 | não | Vínculo do carreta (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`Chegada1aColeta` | DH — data e hora | 29 | **sim** | Data e hora de chegada na 1ª coleta |
| &nbsp;&nbsp;`Saida1aColeta` | DH — data e hora | 29 | **sim** | Data e hora de saída da 1ª coleta |
| &nbsp;&nbsp;`Documentos` | R — registro |  | lista | ‘N’ registro com os dados dos documentos |
| &nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | BIP, CHASSI, LOAD NUMBER, CTE, CTRC, LACRE, MANIFESTO, MIC, NOTA FISCAL, PEDIDO, MINUTA |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | Número ou chave do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Peso` | N — numérico | 15 | não | Peso da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;`PesoCubado` | N — numérico | 15 | não | Peso cubado da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;`Volume` | N — numérico | 15 | não | Volume da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cubagem` | N — numérico | 15 | não | Metros cúbicos |
| &nbsp;&nbsp;&nbsp;&nbsp;`CentroCusto` | T — texto | 20 | não | Nome ou classificação do centro de custos |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | D — data | 10 | não | Data de agendamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`ValorServico` | N — numérico | 15 | não | Valor do serviço |
| &nbsp;&nbsp;&nbsp;&nbsp;`Observacao1` | T — texto | 500 | não | Observação livre 1 |
| &nbsp;&nbsp;&nbsp;&nbsp;`Observacao2` | T — texto | 500 | não | Observação livre 2 |
| &nbsp;&nbsp;&nbsp;&nbsp;`Observacao3` | T — texto | 500 | não | Observação livre 3 |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Modelo` | R — registro |  | **sim** | Código do modelo e informações variáveis |
| &nbsp;&nbsp;`CodModelo` | I — inteiro | 9 | **sim** | Código do modelo de Pré-SM |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | **sim** | Placa do veículo/cavalo |
| &nbsp;&nbsp;`VincVeiculo` | T — texto | 1 | **sim** | Vínculo do veículo (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`CodMotorista1` | I — inteiro | 9 | não | Código do motorista principal |
| &nbsp;&nbsp;`CPFMotorista1` | T — texto | 11 | não | CPF do motorista principal |
| &nbsp;&nbsp;`VincMotorista1` | T — texto | 1 | **sim** | Vínculo do motorista 1 (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`CodMotorista2` | I — inteiro | 9 | não | Código do 2º motorista |
| &nbsp;&nbsp;`CPFMotorista2` | T — texto | 11 | não | CPF do 2º motorista |
| &nbsp;&nbsp;`VincMotorista2` | T — texto | 1 | não | Vínculo do motorista 2 (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`CodAjudante` | I — inteiro | 9 | não | Código do ajudante |
| &nbsp;&nbsp;`CPFAjudante` | T — texto | 11 | não | CPF do Ajudante |
| &nbsp;&nbsp;`VincAjudante` | T — texto | 1 | não | Vínculo do ajudante (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`PlacaCarreta1` | T — texto | 8 | não | Placa da carreta |
| &nbsp;&nbsp;`VincCarreta1` | T — texto | 1 | não | Vínculo da carreta (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`PlacaCarreta2` | T — texto | 8 | não | Placa da 2ª carreta |
| &nbsp;&nbsp;`VincCarreta2` | T — texto | 1 | não | Vínculo da carreta (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`PlacaCarreta3` | T — texto | 8 | não | Placa da 3ª carreta |
| &nbsp;&nbsp;`VincCarreta3` | T — texto | 1 | não | Vínculo do carreta (A=agregado, F=frota, T=terceiro) |
| &nbsp;&nbsp;`Chegada1aColeta` | DH — data e hora | 29 | **sim** | Data e hora de chegada na 1ª coleta |
| &nbsp;&nbsp;`Saida1aColeta` | DH — data e hora | 29 | **sim** | Data e hora de saída da 1ª coleta |
| &nbsp;&nbsp;`CodPreSolicitacao` | I — inteiro | 9 | não | Código da pré-solicitação de monitoramento gerada |
| &nbsp;&nbsp;`Documentos` | R — registro |  | lista | ‘N’ registro com os dados dos documentos |
| &nbsp;&nbsp;&nbsp;&nbsp;`Tipo` | T — texto | 30 | **sim** | BIP, CHASSI, LOAD NUMBER, CTE, CTRC, LACRE, MANIFESTO, MIC, NOTA FISCAL, PEDIDO, MINUTA |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 100 | **sim** | Número ou chave do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Peso` | N — numérico | 15 | não | Peso da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;`PesoCubado` | N — numérico | 15 | não | Peso cubado da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;`Volume` | N — numérico | 15 | não | Volume da mercadoria |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cubagem` | N — numérico | 15 | não | Metros cúbicos |
| &nbsp;&nbsp;&nbsp;&nbsp;`CentroCusto` | T — texto | 20 | não | Nome ou classificação do centro de custos |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataAgendamento` | D — data | 10 | não | Data de agendamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`ValorServico` | N — numérico | 15 | não | Valor do serviço |
| &nbsp;&nbsp;&nbsp;&nbsp;`Observacao1` | T — texto | 500 | não | Observação livre 1 |
| &nbsp;&nbsp;&nbsp;&nbsp;`Observacao2` | T — texto | 500 | não | Observação livre 2 |
| &nbsp;&nbsp;&nbsp;&nbsp;`Observacao3` | T — texto | 500 | não | Observação livre 3 |

---

## setEngate

Página 128 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Engate` | R — registro |  | **sim** | Informações do engate |
| &nbsp;&nbsp;`CodFilial` | I — inteiro | 9 | **sim** | Código da filial do cliente |
| &nbsp;&nbsp;`CPFMotorista1` | T — texto | 11 | **sim** | CPF do motorista principal |
| &nbsp;&nbsp;`CPFMotorista2` | T — texto | 11 | não | CPF do 2º motorista |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | **sim** | Placa do veículo/cavalo Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`PlacaCarreta1` | T — texto | 8 | não | Placa da carreta engatada Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`PlacaCarreta2` | T — texto | 8 | não | Placa da 2ª carreta engatada Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`PlacaCarreta3` | T — texto | 8 | não | Placa da 3ª carreta engatada Deve-se analisar as máscaras das placas conforme tabela 12 |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getModelosPreSM’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Modelos` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código do Modelo de Pré-SM |
| &nbsp;&nbsp;`Descrição` | T — texto | 250 | **sim** | Descrição do Modelo de Pré-SM |

---

## setTrocaMotorista

Página 130 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Troca` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`CodigoSM` | I — inteiro | 9 | não | Código da Solicitação de Monitoramento (Viagem) |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | não | Placa do veículo (cavalo) Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`CPFMotorista1` | N — numérico | 11 | não | CPF do motorista principal |
| &nbsp;&nbsp;`CPFMotorista2` | N — numérico | 11 | não | CPF do motorista auxiliar |
| &nbsp;&nbsp;`TrocaMotoComViag` | T — texto | 1 | não | Autoriza informar um motorista novo que já esta atrelado a uma viagem em andamento (SIM, NAO) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setTrocaMotorista’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Troca` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`CodigoSM` | I — inteiro | 9 | não | Código da Solicitação de Monitoramento (Viagem) |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | não | Placa do veículo (cavalo) |
| &nbsp;&nbsp;`CPFMotorista1` | N — numérico | 11 | não | CPF do motorista principal |
| &nbsp;&nbsp;`CPFMotorista2` | N — numérico | 11 | não | CPF do motorista auxiliar |
| &nbsp;&nbsp;`TrocaMotoComViag` | T — texto | 3 | não | Autoriza informar um motorista novo que já esta atrelado a uma viagem em andamento |
| `Trocou` | T — texto | 3 | **sim** | Trocou o motorista (SIM, NÃO) |

---

## setTrocaVeiculo

Página 132 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Troca` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`CodigoSM` | I — inteiro | 9 | não | Código da Solicitação de Monitoramento (Viagem) |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | não | Placa do veículo (cavalo) Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`PlacaCarreta1` | T — texto | 8 | não | Placa da carreta 1 Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`PlacaCarreta2` | T — texto | 8 | não | Placa da carreta 2 Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`PlacaCarreta3` | T — texto | 8 | não | Placa da carreta 3 Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;`TrocaCarrComViag` | T — texto | 3 | não | Autoriza informar uma carreta que já esta atrelada a uma outra viagem em andamento (SIM, NAO) |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setTrocaCarreta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Troca` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`CodigoSM` | I — inteiro | 9 | não | Código da Solicitação de Monitoramento (Viagem) |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | não | Placa do veículo (cavalo) |
| &nbsp;&nbsp;`PlacaCarreta1` | T — texto | 8 | não | Placa da carreta 1 |
| &nbsp;&nbsp;`PlacaCarreta2` | T — texto | 8 | não | Placa da carreta 2 |
| &nbsp;&nbsp;`PlacaCarreta3` | T — texto | 8 | não | Placa da carreta 3 |
| &nbsp;&nbsp;`TrocaCarrComViag` | T — texto | 3 | não | Autoriza informar uma carreta que já esta atrelada a uma viagem em andamento (SIM, NAO) |
| `Trocou` | T — texto | 3 | **sim** | Trocou a carreta (SIM, NAO) |
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setTrocaCarreta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Troca` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`CodigoSM` | I — inteiro | 9 | não | Código da Solicitação de Monitoramento a qual a placa estava atrelada |
| &nbsp;&nbsp;`PlacaAtual` | T — texto | 8 | **sim** | Placa atualmente atrelada a solicitação de monitoramento |
| &nbsp;&nbsp;`PlacaNova` | T — texto | 8 | **sim** | Placa nova que deve ser atrelada a solicitação de monitoramento |
| &nbsp;&nbsp;`VinculoNovo` | T — texto | 1 | **sim** | Vínculo da placa nova (A, F, T) |
| `Trocou` | T — texto | 3 | **sim** | Trocou o motorista (SIM, NAO) |
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setTrocaCarreta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Troca` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`CodigoSM` | I — inteiro | 9 | não | Código da Solicitação de Monitoramento a qual a placa estava atrelada |
| &nbsp;&nbsp;`PlacaAtual` | T — texto | 8 | **sim** | Placa atualmente atrelada a solicitação de monitoramento |
| &nbsp;&nbsp;`PlacaNova` | T — texto | 8 | **sim** | Placa nova que deve ser atrelada a solicitação de monitoramento |
| &nbsp;&nbsp;`VinculoNovo` | T — texto | 1 | **sim** | Vínculo da placa nova (A, F, T) |
| `Trocou` | T — texto | 3 | **sim** | Trocou o motorista (SIM, NAO) |

---

## setConjunto

Página 136 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Conjunto` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`Motorista` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPF` | T — texto | 11 | **sim** | CPF do motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`Nome` | T — texto | 100 | **sim** | Nome do motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`Apelido` | T — texto | 30 | não | Apelido do motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sexo` | T — texto | 2 | **sim** | Sexo (F ou M) |
| &nbsp;&nbsp;&nbsp;&nbsp;`RG` | T — texto | 15 | **sim** | RG do motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 | **sim** | Órgão emissor do RG |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataEmissRG` | D — data | 10 | **sim** | Data de emissão do RG |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodProfissao` | I — inteiro | 9 | **sim** | Código da profissão conforme tabela PROFISSOES (30=Motorista) |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumFormCNH` | I — inteiro | 15 | **sim** | Número de formulário da CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumRegCNH` | I — inteiro | 11 | **sim** | Número de registro da CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumSegurCNH` | T — texto | 11 | **sim** | Número de segurança da CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumRenachCNH` | T — texto | 15 | **sim** | Número Renach da CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`UFEmissCNH` | T — texto | 2 | **sim** | Sigla da UF de emissão da CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataEmissCNH` | D — data | 10 | **sim** | Data de emissão da CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataVencCNH` | D — data | 10 | **sim** | Data de vencimento da CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`CategoriaCNH` | T — texto | 2 | **sim** | Categoria da CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`DtPrimEmissCNH` | D — data | 10 | **sim** | Data de emissão da primeira CNH |
| &nbsp;&nbsp;&nbsp;&nbsp;`PossuiMOPP` | T — texto | 1 | **sim** | Possuí MOPP (curso transporte produtos perigosos) (S ou N) |
| &nbsp;&nbsp;&nbsp;&nbsp;`DtVencMOPP` | D — data | 10 | não | Data de vencimento do MOPP |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidadeNatal` | I — inteiro | 7 | **sim** | Código IBGE da cidade de nascimento |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataNascimento` | D — data | 10 | **sim** | Data de nascimento |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeMae` | T — texto | 100 | **sim** | Nome da mãe |
| &nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | **sim** | Endereço de residência do motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 15 | **sim** | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Nome do bairro |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade de residência |
| &nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP (89.700-000) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone de contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`Celular` | T — texto | 15 | não | Número de celular de contato |
| &nbsp;&nbsp;&nbsp;&nbsp;`Radio` | T — texto | 15 | não | Número do rádio |
| &nbsp;&nbsp;&nbsp;&nbsp;`SenhaMotorista` | T — texto | 10 | não | Senha do motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 | **sim** | Descrição/Título do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 3 | **sim** | PDF,XLSX,XLS,DOC,DOCX,PNG,JPEG,JPG |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documento` | T — texto |  | **sim** | Documento convertido para Base64 |
| &nbsp;&nbsp;`Veiculo` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade de emplacamento do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Renavam` | T — texto | 20 | **sim** | Número do Renavam do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Chassi` | T — texto | 50 | **sim** | Chassi do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumeroANTT` | T — texto | 20 | **sim** | Número do cadastro do veículo na ANTT |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumeroFrota` | T — texto | 20 | não | Número da frota controle do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTipoVeiculo` | I — inteiro | 9 | **sim** | Código do tipo do veículo conforme tabela TIPOS_VEICULO |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 | não | Código do tipo de carroceria do veículo conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | **sim** | Código da marca do veículo conforme tabela MARCAS_VEICULO |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor do veículo conforme tabela CORES |
| &nbsp;&nbsp;&nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação |
| &nbsp;&nbsp;&nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 | não | CNPJ ou CPF do proprietário do veículo (ou informa somente o CNPJ para o caso do proprietário já estar cadastrado, ou informa os campos do grupo “Proprietario” para incluir ou alterar o proprietário) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Proprietario` | R — registro |  | **sim** | Registro com os dados do proprietário |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | **sim** | CNPJ do proprietário, se for uma pessoa física informar o CPF |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | **sim** | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do proprietário |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`IE` | T — texto | 20 | não | Inscrição Estadual |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`RG` | T — texto | 15 | não | RG do proprietário quando for pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 | não | Órgão emissor do RG |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | **sim** | Endereço do proprietário (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | **sim** | Número do endereço (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Nome do bairro (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | **sim** | Telefone (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Possui rastreador (S ou N) |
| &nbsp;&nbsp;&nbsp;&nbsp;`TecnoRasPrincipal` | I — inteiro | 9 | não | Código da tecnologia do rastreador principal conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;&nbsp;&nbsp;`ModelRasPrincipal` | I — inteiro | 9 | não | Código do modelo do rastreador principal conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;&nbsp;&nbsp;`TermiRasPrincipal` | T — texto | 10 | não | Número do terminal do rastreador principal |
| &nbsp;&nbsp;&nbsp;&nbsp;`TecnoRasSecundario` | I — inteiro | 9 | não | Código da tecnologia do rastreador secundário conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;&nbsp;&nbsp;`ModelRasSecundario` | I — inteiro | 9 | não | Código do modelo do rastreador secundário conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;&nbsp;&nbsp;`ModelRasSecundario` | T — texto | 10 | não | Número do terminal do rastreador secundário |
| &nbsp;&nbsp;&nbsp;&nbsp;`Dispositivos` | R — registro |  | lista | Lista de dispositivos do rastreador instalados no veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do dispositivo conforme tabela DISPOSITIVOS_VEICULO |
| &nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 | **sim** | Descrição/Título do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 3 | **sim** | PDF,XLSX,XLS,DOC,DOCX,PNG,JPEG,JPG |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documento` | T — texto |  | **sim** | Documento convertido para Base64 |
| &nbsp;&nbsp;`Carreta1` | R — registro |  | **sim** | Registro com os dados da Carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade de emplacamento da carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome cidade emplacamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 2 | não | Sigla UF emplacamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla País emplacamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Renavam` | T — texto | 20 | **sim** | Número do Renavam da carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Chassi` | T — texto | 50 | **sim** | Chassi da carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento da carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumeroANTT` | T — texto | 20 | **sim** | Número do cadastro da carreta na ANTT |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumeroFrota` | T — texto | 20 | não | Número da frota controle do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 | **sim** | Código do tipo de carreta conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | não | Código da marca da carreta conforme tabela MARCAS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor da carreta conforme tabela CORES |
| &nbsp;&nbsp;&nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação |
| &nbsp;&nbsp;&nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 | não | CNPJ ou CPF do proprietário da carreta (ou informa somente o CNPJ para o caso do proprietário já estar cadastrado, ou informa os campos do grupo “Proprietario” para incluir ou alterar o proprietário) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Proprietario` | R — registro |  | **sim** | Registro com os dados do proprietário |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | **sim** | CNPJ do proprietário, se for uma pessoa física informar o CPF |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | **sim** | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do proprietário |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`IE` | T — texto | 20 | não | Inscrição Estadual |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`RG` | T — texto | 15 | não | RG do proprietário quando for pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 | não | Órgão emissor do RG |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | **sim** | Endereço do proprietário (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | **sim** | Número do endereço (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Nome do bairro (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | **sim** | Telefone (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Possui rastreador (S ou N) |
| &nbsp;&nbsp;&nbsp;&nbsp;`TecnologiaRastreador` | I — inteiro | 9 | não | Código da tecnologia do rastreador conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;&nbsp;&nbsp;`ModeloRastreador` | I — inteiro | 9 | não | Código do modelo do rastreador conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;&nbsp;&nbsp;`TerminalRastreador` | T — texto | 10 | não | Número do terminal do rastreador |
| &nbsp;&nbsp;&nbsp;&nbsp;`Dispositivos` | R — registro |  | lista | Lista de dispositivos do rastreador instalados na carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do dispositivo conforme tabela DISPOSITIVOS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 | não | Descrição do dispositivo conforme tabela DISPOSTIVISO_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 | **sim** | Descrição/Título do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 3 | **sim** | PDF,XLSX,XLS,DOC,DOCX,PNG,JPEG,JPG |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documento` | T — texto |  | **sim** | Documento convertido para Base64 |
| &nbsp;&nbsp;`Carreta2` | R — registro |  | **sim** | Registro com os dados da Carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Placa` | T — texto | 8 | **sim** | Placa do veículo Deve-se analisar as máscaras das placas conforme tabela 12 |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade de emplacamento da carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome cidade emplacamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 2 | não | Sigla UF emplacamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Pais` | T — texto | 2 | não | Sigla País emplacamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Renavam` | T — texto | 20 | **sim** | Número do Renavam da carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`Chassi` | T — texto | 50 | **sim** | Chassi da carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`DataEmissao` | D — data | 10 | não | Data de emissão do documento da carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumeroANTT` | T — texto | 20 | **sim** | Número do cadastro da carreta na ANTT |
| &nbsp;&nbsp;&nbsp;&nbsp;`NumeroFrota` | T — texto | 20 | não | Número da frota controle do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodTipoCarreta` | I — inteiro | 9 | **sim** | Código do tipo de carreta conforme tabela TIPOS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodMarca` | I — inteiro | 9 | não | Código da marca da carreta conforme tabela MARCAS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodCor` | I — inteiro | 9 | **sim** | Código da cor da carreta conforme tabela CORES |
| &nbsp;&nbsp;&nbsp;&nbsp;`AnoFabricacao` | I — inteiro | 4 | **sim** | Ano de fabricação |
| &nbsp;&nbsp;&nbsp;&nbsp;`AnoModelo` | I — inteiro | 4 | **sim** | Ano do modelo |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJProprietario` | T — texto | 14 | não | CNPJ ou CPF do proprietário da carreta (ou informa somente o CNPJ para o caso do proprietário já estar cadastrado, ou informa os campos do grupo “Proprietario” para incluir ou alterar o proprietário) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Proprietario` | R — registro |  | **sim** | Registro com os dados do proprietário |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | **sim** | CNPJ do proprietário, se for uma pessoa física informar o CPF |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | **sim** | Razão social, ou nome em caso de pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do proprietário |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`IE` | T — texto | 20 | não | Inscrição Estadual |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`RG` | T — texto | 15 | não | RG do proprietário quando for pessoa física |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`OrgaoEmissRG` | T — texto | 6 | não | Órgão emissor do RG |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | **sim** | Endereço do proprietário (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | **sim** | Número do endereço (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | **sim** | Nome do bairro (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | **sim** | Código IBGE da cidade (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | **sim** | CEP (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | **sim** | Telefone (Obrigatório se informar a Razão) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;`PossuiRastreador` | T — texto | 1 | **sim** | Possui rastreador (S ou N) |
| &nbsp;&nbsp;&nbsp;&nbsp;`TecnologiaRastreador` | I — inteiro | 9 | não | Código da tecnologia do rastreador conforme tabela TECNOLOGIAS |
| &nbsp;&nbsp;&nbsp;&nbsp;`ModeloRastreador` | I — inteiro | 9 | não | Código do modelo do rastreador conforme tabela MODELOS_TECNOLOGIAS |
| &nbsp;&nbsp;&nbsp;&nbsp;`TerminalRastreador` | T — texto | 10 | não | Número do terminal do rastreador |
| &nbsp;&nbsp;&nbsp;&nbsp;`Dispositivos` | R — registro |  | lista | Lista de dispositivos do rastreador instalados na carreta |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Codigo` | I — inteiro | 9 | não | Código do dispositivo conforme tabela DISPOSITIVOS_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 60 | não | Descrição do dispositivo conforme tabela DISPOSTIVISO_CARRETA |
| &nbsp;&nbsp;&nbsp;&nbsp;`Documentos` | R — registro |  | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Descricao` | T — texto | 100 | **sim** | Descrição/Título do documento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 3 | **sim** | PDF,XLSX,XLS,DOC,DOCX,PNG,JPEG,JPG |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Documento` | T — texto |  | **sim** | Documento convertido para Base64 |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setConjunto’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |

---

## setSolicitacaoPesquisaConsulta

Página 144 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodFilial` | I — inteiro | 9 | **sim** | Codigo da Filial |
| `CodAgencia` | I — inteiro | 9 | não | Código da agencia do cliente |
| `TipoIdentificacao` | T — texto | 1 | **sim** | Tipo de pesquisa a ser feita V – Veiculo C – Carreta P – Pessoa |
| `Identificacao` | T — texto | 14 | **sim** | Identificação da pesquisa/consulta - CPF Motorista - Placa do veiculo - Placa da carreta |
| `Vinculo` | T — texto | 1 | **sim** | Vinculo da Pesquisa ou Consulta F – Frota A – Agregado T – Terceiro |
| `Expressa` | T — texto | 1 | **sim** | Pesquisa ou consulta expressa S – Sim N – Não |
| `PesquisaPlus` | T — texto | 1 | **sim** | Pesquisa ou consulta Pesquisa + S – Sim N – Não |
| `PesquisaBiometrica` | T — texto | 1 | não | Pesquisa ou consulta Analise Biométrica S – Sim N – Não |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setSolicitacaoPesquisaConsulta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Tipo` | T — texto | 1 | **sim** | Tipo (P=Pesquisa, C=Consulta) |
| `Codigo` | I — inteiro | 9 | **sim** | Código da pesquisa ou consulta |
| `Situacao` | T — texto | 2 | não | Situação da pesquisa ou consulta SP- Sem Pesquisa, EP- Em Pesquisa, AP- Aguardando Pesquisa, NA- Inconclusivo AD- Adequado ao Risco, EX- Expirado, AC- A Consultar |
| `PhotocheckUrl` | T — texto | 500 | não | Link para o condutor executar a validação do photocheck |
| `PhotocheckExpiracao` | D — data |  | não | Data para expiração do link de photocheck |

---

## setSolicitacaoPesquisaConsultaConjunto

Página 147 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodFilial` | I — inteiro | 9 | **sim** | Codigo da Filial |
| `CodAgencia` | I — inteiro | 9 | não | Código da agência do cliente |
| `CPFMotorista` | T — texto | 14 | não | Identificação do motorista |
| `VinculoMotorista` | T — texto | 1 | **sim** | Vinculo F – Frota A – Agregado T – Terceiro |
| `PlacaVeiculo` | T — texto | 14 | não | Placa do veiculo |
| `VinculoVeiculo` | T — texto | 1 | não | Vinculo F – Frota A – Agregado T – Terceiro |
| `PlacaCarreta1` | T — texto | 14 | não | Placa da carreta 1 |
| `VinculoCarreta1` | T — texto | 1 | não | Vinculo F – Frota A – Agregado T – Terceiro |
| `PlacaCarreta2` | T — texto | 14 | não | Placa da carreta 2 |
| `VinculoCarreta2` | T — texto | 1 | não | Vinculo F – Frota A – Agregado T – Terceiro |
| `Expressa` | T — texto | 1 | **sim** | Pesquisa ou consulta expressa S – Sim N – Não |
| `PesquisaPlus` | T — texto | 1 | **sim** | Pesquisa ou consulta Pesquisa + S – Sim N – Não |

### Retorno

_(sem campos extraídos)_

---

## getResultadoPesquisaConsulta

Página 150 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodFilial` | I — inteiro | 9 | **sim** | Codigo da Filial |
| `CodAgencia` | I — inteiro | 9 | não | Código da agência do cliente |
| `TipoIdentificacao` | T — texto | 1 | **sim** | Tipo de pesquisa a ser feita V – Veiculo C – Carreta P - Pessoa |
| `Identificacao` | T — texto | 14 | **sim** | Identificação da pesquisa/consulta - CPF Motorista - Placa do veiculo - Placa da carreta |
| `Vinculo` | T — texto | 1 | **sim** | Vinculo da Pesquisa ou Consulta F – Frota A – Agregado T - Terceiro |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getResultadoPesquisaConsulta’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Tipo` | T — texto | 1 | **sim** | Tipo do resultado (P=Pesquisa, C=Consulta) |
| `Codigo` | I — inteiro | 9 | **sim** | Código da pesquisa ou consulta |
| `Situacao` | T — texto | 11 | não | Status da pesquisa ou consulta SP- Sem Pesquisa, EP- Em Pesquisa, AP- Aguardando Pesquisa, NA- Inconclusivo AD- Adequado ao Risco, EX- Expirado, AC- A Consultar B- Analise Biometrica |
| `DataExpiracao` | D — data |  | não | Data de expiração da Pesquisa ou Consulta |
| `Senha` | T — texto | 10 | não | Senha valida na Gerenciadora |
| `Justificativas` | R — registro |  | não | Lista das justificativas que impediram da aprovação da Pesquisa/Consulta |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código da justificativa |
| &nbsp;&nbsp;`Descricao` | T — texto | 250 | **sim** | Descrição da justificativa que impediu a aprovação XML <?xml version="1.0" encoding="ISO-8859-1"?> <retResultadoPesquisaConsulta> <Ambiente>HOMOLOGACAO</Ambiente> <Metodo>getResultadoPesquisaConsulta</Metodo> <Login>00000000000</Login> <CodErro>0</CodErro> <Tipo>P</Tipo> <Codigo>820732</Codigo> <Situacao>AP</Situacao> <Justificativas> <Justificativa> <Codigo>19</Codigo> <Descricao>Em consulta realizada foi identificado irregularidades no registro da RNTRC junto a ANTT. solicitamos que seja confirmado com o propriet?rio do ve?culo se o mesmo possui outro registro junto a ANTT e que conste ATIVO no ve?culo.</Descricao> </Justificativa> <Justificativa> <Codigo>28</Codigo> <Descricao>Em nossa consulta ao sistema no DENATRAN identificamos que o ve?culo est? constando como roubado. Desta forma solicitamos que nos envie o auto de entrega.</Descricao> </Justificativa> <Justificativa> <Codigo>52</Codigo> <Descricao>Favor anexar no sistema a c?pia atualizada do documento da ANTT para an?lise.</Descricao> </Justificativa> <Justificativa> <Codigo>29</Codigo> <Descricao>Favor anexar no sistema a c?pia atualizada do documento do ve?culo para an?lise.</Descricao> </Justificativa> <Justificativa> <Codigo>18</Codigo> <Descricao>Identificado propriet?rio incorreto. Favor conferir e reenviar. Obs: em caso de leasing, reenviar para pesquisa inserindo os dados do arrendat?rio.</Descricao> </Justificativa> <Justificativa> <Codigo>43</Codigo> <Descricao>N? do RENAVAM incorreto. Favor corrigir e reenviar.</Descricao> </Justificativa> <Justificativa> <Codigo>45</Codigo> <Descricao>Placa inv?lida. Favor realizar nova pesquisa com a placa correta.</Descricao> </Justificativa> </Justificativas> </retResultadoPesquisaConsulta> |

---

## getResultadoPesquisaConsultaConjunto

Página 153 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodFilial` | I — inteiro | 9 | **sim** | Codigo da Filial |
| `CodAgencia` | I — inteiro | 9 | não | Código da agência do cliente |
| `CPFMotorista` | T — texto | 14 | não | Identificação do motorista |
| `VinculoMotorista` | T — texto | 1 | **sim** | Vinculo F – Frota A – Agregado T – Terceiro |
| `PlacaVeiculo` | T — texto | 14 | não | Placa do veiculo |
| `VinculoVeiculo` | T — texto | 1 | não | Vinculo F – Frota A – Agregado T – Terceiro |
| `PlacaCarreta1` | T — texto | 14 | não | Placa da carreta 1 |
| `VinculoCarreta1` | T — texto | 1 | não | Vinculo F – Frota A – Agregado T – Terceiro |
| `PlacaCarreta2` | T — texto | 14 | não | Placa da carreta 2 |
| `VinculoCarreta2` | T — texto | 1 | não | Vinculo F – Frota A – Agregado T – Terceiro |

### Retorno

_(sem campos extraídos)_

---

## getGerarResultadoCheckList

Página 157 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodCheckList` | I — inteiro | 9 | **sim** | Código do Checklist Obs: Caso seja informado o código do checklist a placa deixa de ser obrigatória |
| `Veiculo` | T — texto | 12 | **sim** | Placa do veículo Obs: Caso seja informada a placa do veículo o código do checklist deixa de ser obrigatório |
| `Carreta01` | T — texto | 12 | não | Placa da carreta 01 |
| `Carreta02` | T — texto | 12 | não | Placa da carreta 02 |
| `Carreta03` | T — texto | 12 | não | Placa da carreta 03 |
| `CodFilial` | I — inteiro | 9 | **sim** | Código da Filial |
| `CodPerfilSeguranca` | I — inteiro | 9 | **sim** | Código do Perfil de Segurança |
| `Produtos` | R — registro |  | **sim** | Lista de produtos |
| &nbsp;&nbsp;`CodProduto` | N — numérico | 9 | **sim** | Código do produto cadastrado na Gerenciadora (uma lista pode ser obtida consumindo o método getTabelas (PERFIL_SEGURANCA)) |
| &nbsp;&nbsp;`Valor` | N — numérico | 14 | **sim** | Valor do produto |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setSolicitacaoPesquisaConsultaConjunto’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `CodCheckList` | I — inteiro | 9 | **sim** | Código do check list passado na requisição |
| `CodFilial` | I — inteiro | 9 | **sim** | Código da filial passado na requisição |
| `CodPerfilSeguranca` | I — inteiro | 9 | **sim** | Código do perfil de segurança passado na requisição |
| `Produtos` |  |  | não | Lista de produtos passada na requisição |
| &nbsp;&nbsp;`CodProduto` | N — numérico | 9 | **sim** | Código do produto cadastrado na Gerenciadora (uma lista pode ser obtida consumindo o método getTabelas (PERFIL_SEGURANCA)) |
| &nbsp;&nbsp;`Valor` | N — numérico | 14 | **sim** | Valor do produto |
| `Status` | T — texto | 2 | **sim** | Status do Checklist (ST - Sem Teste, AI - Aguardando Inicio, AE - Aguardando Espelhamento, CV - Configurando Veiculo, ET-Teste em execução, FI – Finalizado e CA-Cancelado) |
| `CodResultado` | I — inteiro | 9 | não | Código do resultado gerado |
| `Resultado` | T — texto | 1 | não | Resultado do checklist (A-Aprovado, R-Reprovado) |
| `DataGeracao` | D — data |  | não | Data de geração do resultado |
| `DataExpiracao` | D — data |  | não | Data de expiração/validade do resultado |
| `UrlDocumento` | T — texto | 250 | não | Url para download ou visualização do documento PDF com o resultado do checklist XML <?xml version="1.0" encoding="ISO-8859-1"?> <retGerarResultadoCheckList> <Ambiente>Homologacao</Ambiente> <Metodo>getGerarResultadoCheckList</Metodo> <Login>999999999</Login> <CodErro>0</CodErro> <CodCheckList>99999</CodCheckList> <CodFilial>9999</CodFilial> <CodPerfilSeguranca>9999</CodPerfilSeguranca> <Produtos> <Produto> <CodProduto>9999</CodProduto> <Valor>100000</Valor> </Produto> <Produto> <CodProduto>9999</CodProduto> <Valor>50000</Valor> </Produto> </Produtos> <Status>FI</Status> <CodResultado>9999999</CodResultado> <Resultado>A</Resultado> <DataGeracao>2021-08-19T09:49:09.000-03:00</DataGeracao> <DataExpiracao>2021-10-02T16:12:06.427-03:00</DataExpiracao> <UrlDocumento>http://app.nomedagerenciadora.com.br/impressoes/CD173FFF7AA12E280C04191E4477953C.pdf</UrlDocumento> </retGerarResultadoCheckList> |

---

## setIncluirCheckList

Página 158 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodFilial` | I — inteiro | 9 | **sim** | Codigo da Filial |
| `PlacaVeiculo` | T — texto | 8 | **sim** | Placa do veículo/cavalo |
| `PlacaCarreta1` | T — texto | 8 | não | Placa da carreta 1 |
| `PlacaCarreta2` | T — texto | 8 | não | Placa da carreta 2 |
| `PlacaCarreta3` | T — texto | 8 | não | Placa da carreta 3 |
| `Vinculo` | T — texto | 1 | **sim** | Vinculo do veículo (A=agregado, F=frota, T=terceiro) |
| `DataHoraAgendada` | D — data |  | não | Data/hora do agendamento do checklist, se não for informado, vai ser realizado o mais breve possível |
| `SensorTemperatura` | T — texto | 1 | não | S/N – se deve ou não testar o sensor de temperatura |
| `Tipo` | T — texto | 10 | **sim** | Tipo de execução do checklist: Normal, Expresso ou Telefone, Video |
| `Responsavel` | T — texto | 200 | não | Nome do contatato/responsável para a execução do checklist |
| `Celular1` | T — texto | 20 | não | Número do telefone de contato |
| `Celular2` | T — texto | 20 | não | Segundo número de telefone de contato |

### Retorno

_(sem campos extraídos)_

---

## getHistoricoTestes

Página 161 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Veiculo` | I — inteiro | 9 | **sim** | Placa do veículo que deseja receber o histórico |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setSolicitacaoPesquisaConsultaConjunto’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Testes` | R — registro |  | **sim** | Array contendo os testes encontrados para aquele veículo |
| `CodFilial` | I — inteiro | 9 | **sim** | Código da filial passado na requisição |
| &nbsp;&nbsp;`Codigo` |  | 12 | **sim** | Código do teste encontrado |
| &nbsp;&nbsp;`Veiculo` | T — texto | 12 | **sim** | Placa do veículo |
| &nbsp;&nbsp;`Carreta01` | T — texto | 12 | não | Placa da carreta 01 |
| &nbsp;&nbsp;`Carreta02` | T — texto | 12 | não | Placa da carreta 02 |
| &nbsp;&nbsp;`Carreta03` | T — texto | 12 | não | Placa da carreta 03 |
| &nbsp;&nbsp;`DataSol` | T — texto | 20 | **sim** | Data da solicitação do teste |
| &nbsp;&nbsp;`TesteTemp` | T — texto | 1 | **sim** | Indicativo de teste de temperatura S – Temperatura foi testada N – Temperatura não foi testada |
| &nbsp;&nbsp;`Tipo` | T — texto | 1 | **sim** | Tipo do teste N – Normal E – Expresso T – Telefônico |

---

## getOcorrenciasLogisticas

Página 162 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Ocorrencia` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`CodigoSM` | I — inteiro | 9 | **sim** | Código da Solicitação de Monitoramento já efetivada |
| &nbsp;&nbsp;`CodigoOcorrencia` | I — inteiro | 9 | **sim** | Código da última ocorrência conhecida, caso não tenha, passar código zero |
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Ocorrencias` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`Codigo` | I — inteiro | 9 | **sim** | Código da ocorrência |
| &nbsp;&nbsp;`Descricao` | T — texto | 300 | **sim** | Descrição da ocorrência |
| &nbsp;&nbsp;`Observacao` | T — texto | 300 | **sim** | Observação da ocorrência |
| &nbsp;&nbsp;`Status` | T — texto | 1 | **sim** | Ativo “S” ou “N” |
| &nbsp;&nbsp;`DataHoraInclusao` | T — texto | 20 | **sim** | Data e hora da inclusão da ocorrência |
| &nbsp;&nbsp;`DataHoraFinalizacao` | T — texto | 20 | não | Data e hora da finalização da ocorrência |
| &nbsp;&nbsp;`Imagens` | R — registro |  | não | Retornará um array contendo a URL de todas as imagens disponíveis |
| &nbsp;&nbsp;&nbsp;&nbsp;`Imagem` | T — texto | 2000 | não | URL da imagem |

### Retorno

_(sem campos extraídos)_

---

## setProgramacaoCargas

Página 163 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `ProgramacaoCargas` | R — registro |  | **sim** | Registro com os dados da ProgramacaoCargas |
| &nbsp;&nbsp;`CodProgramacao` | I — inteiro | 8 | não | Código da programação de cargas já existente |
| &nbsp;&nbsp;`Agendamento` | R — registro |  | **sim** | Registro com os dados da guia engate |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodFilial` | I — inteiro | 9 | **sim** | Código da filial |
| &nbsp;&nbsp;&nbsp;&nbsp;`ValorFrete` | N — numérico | 20 | não | Valor do frete |
| &nbsp;&nbsp;&nbsp;&nbsp;`Embarcadores` | T — texto | 14 | não | CNPJ dos Embarcadores da programação, separados por vírgula (,) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Observacao` | T — texto | 500 | não | Observação do agendamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`IdentificadorExterno` | T — texto | 100 | não | Campo para cliente inserir informações |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosVeiculo` | R — registro |  | não | Registro com os dados guia detalhamento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`TipoVeiculo` | I — inteiro | 9 | não | Código do tipo do veículo obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`SubTipoVeiculo` | I — inteiro | 9 | não | Código do subtipo do veículo obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`TipoCarroceria` | I — inteiro | 9 | não | Código do tipo da carroceria obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;`Engate` | R — registro |  | não | Dados do engate do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`PlacaVeiculo` | T — texto | 9 | **sim** | Placa do veículo que está atrelado a programação e ira realizar a viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta1` | T — texto | 9 | não | Placa da carreta01 que está atrelada a programação e ira realizar a viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta2` | T — texto | 9 | não | Placa da carreta2 que está atrelada a programação e ira realizar a viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`PlacaCarreta3` | T — texto | 9 | não | Placa da carreta3 que está atrelada a programação e ira realizar a viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodPerfilSegurança` | I — inteiro | 20 | **sim** | Código do perfil de segurança da programação que irá ser colocado na viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista1` | T — texto | 11 | **sim** | CPF do motorista atrelado a programação e irá realizar a viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista2` | T — texto | 11 | **sim** | CPF do motorista2 atrelado a programação e irá realizar a viagem |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CPFManobrista` | T — texto | 11 | **sim** | CPF do manobrista atrelado a programação e irá realizar a viagem (Não será utilizado na préSM) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CPFAjudante` | T — texto | 11 | **sim** | CPF do Ajudante atrelado a programação e irá realizar a viagem |
| `Detalhamento` | R — registro |  | **sim** | Registro com os dados do Cliente. Obrigatório no mínimo 1 cliente. |
| &nbsp;&nbsp;`ColetasEntregas` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | não | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora. Pode passar somente este campo se os dados do cliente já foram cadastrados anteriormente pelo método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país Se houver integração do cliente através deste método se faz necessário informar o CNPJ (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | não | Nome do bairro |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade Se houver integração do cliente através deste método se faz necessário informar o código IBGE (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | não | CEP |
| &nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone |
| &nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a latitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 |  | Localização longitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a longitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade, para pesquisa por nome caso não seja informado o CodIBGECidade |
| &nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 100 | não | Unidade de Federação (Estado), para pesquisa pelo nome ou sigla da UF caso não seja informado o CodIBGECidade. Nos países do exterior, caso não tenha o nome do Estado, pode ser informada a sigla do País |
| &nbsp;&nbsp;&nbsp;&nbsp;`Pais` | T — texto | 60 | não | Nome ou sigla do País, para pesquisa caso não tenha sido informado o CodIBGECidade. Pode ser informado o nome ou a Sigla de 2 (dois) dígitos |
| &nbsp;&nbsp;`DataHoraChegada` | DH — data e hora | 29 | **sim** | Data e hora da chegada no local |
| &nbsp;&nbsp;`DataHoraSaida` | DH — data e hora | 29 | **sim** | Data e hora de saída do local |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM. (Para enviar uma solicitação de monitoramento sem produto / viagem vazia, informar o CodProduto = 999999999 ou NCMProduto = 99999999) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`NCMProduto` | T — texto | 8 | não | Código NCM do produto, não precisa informar se optar por informar o código do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Categoria` | T — texto |  | não | ‘P’, ‘U’ ou ‘L’ para ‘Peso’, ‘Unidade’ ou ‘Litros’, respectivamente |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Quantidade` | I — inteiro | 12 | não | Quantidade conforme categoria |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Anexos` | R — registro |  | não | “N” base64 com imagens da programação |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`NomeArquivo` | T — texto | 100 | **sim** | Nome do arquivo (sem extensão, ou conforme padrão interno) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Extensao` | T — texto | 10 | **sim** | Extensão (ex.: pdf, jpg, png) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Base64` | T — texto |  | **sim** | Conteúdo em Base64 |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro |  | **sim** | Código do erro |
| `MsgErro` | T — texto |  | **sim** | Mensagem do erro |
| `ProgramacaoCargas` | R — registro |  | **sim** | Registro com os dados da ProgramacaoCargas |
| &nbsp;&nbsp;`Agendamento` | R — registro |  | **sim** | Registro com os dados da guia engate |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodFilial` | I — inteiro | 9 | **sim** | Código da filial |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodProgramacao` | I — inteiro | 9 | **sim** | Código da programação inserida |
| &nbsp;&nbsp;&nbsp;&nbsp;`ValorFrete` | N — numérico | 20 | não | Valor do frete |
| &nbsp;&nbsp;&nbsp;&nbsp;`Observacao` | T — texto | 500 | não | Observação do agendamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`DadosVeiculo` | R — registro |  | não | Registro com os dados guia detalhamento |
| &nbsp;&nbsp;&nbsp;&nbsp;`Embarcadores` | T — texto | 14 | não | Registro com o CNPJ dos embarcadores da programação |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`TipoVeiculo` | I — inteiro | 9 | não | Código do tipo do veículo obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`SubTipoVeiculo` | I — inteiro | 9 | não | Código do subtipo do veículo obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`TipoCarroceria` | I — inteiro | 9 | não | Código do tipo da carroceria obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;`IdentificadorExterno` | T — texto | 100 | não | Texto informado no campo |
| `Detalhamento` | R — registro |  | **sim** | Registro com os dados do Cliente. Obrigatório no mínimo 1 cliente. |
| &nbsp;&nbsp;`ColetasEntregas` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodigoCliente` | T — texto | 20 | não | Código de identificação do cliente no sistema da Empresa que está integrando com a Gerenciadora. Pode passar somente este campo se os dados do cliente já foram cadastrados anteriormente pelo método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;`Fantasia` | T — texto | 150 | não | Nome fantasia ou apelido do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país Se houver integração do cliente através deste método se faz necessário informar o CNPJ (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;`Complemento` | T — texto | 50 | não | Complemento do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;`Bairro` | T — texto | 100 | não | Nome do bairro |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade Se houver integração do cliente através deste método se faz necessário informar o código IBGE (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`CEP` | T — texto | 10 | não | CEP |
| &nbsp;&nbsp;&nbsp;&nbsp;`Telefone` | T — texto | 15 | não | Telefone |
| &nbsp;&nbsp;&nbsp;&nbsp;`Email` | T — texto | 100 | não | Email |
| &nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a latitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 |  | Localização longitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a longitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade, para pesquisa por nome caso não seja informado o CodIBGECidade |
| &nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 100 | não | Unidade de Federação (Estado), para pesquisa pelo nome ou sigla da UF caso não seja informado o CodIBGECidade. Nos países do exterior, caso não tenha o nome do Estado, pode ser informada a sigla do País |
| &nbsp;&nbsp;&nbsp;&nbsp;`Pais` | T — texto | 60 | não | Nome ou sigla do País, para pesquisa caso não tenha sido informado o CodIBGECidade. Pode ser informado o nome ou a Sigla de 2 (dois) dígitos |
| &nbsp;&nbsp;`DataHoraChegada` | DH — data e hora | 29 | **sim** | Data e hora da chegada no local |
| &nbsp;&nbsp;`DataHoraSaida` | DH — data e hora | 29 | **sim** | Data e hora de saída do local |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM. (Para enviar uma solicitação de monitoramento sem produto / viagem vazia, informar o CodProduto = 999999999 ou NCMProduto = 99999999) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`NCMProduto` | T — texto | 8 | não | Código NCM do produto, não precisa informar se optar por informar o código do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | **sim** | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Categoria` | T — texto |  | não | Unidade de medida do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Quantidade` | T — texto |  | não | Quantidade do prduto |
| `CodProgramacao` | I — inteiro | 8 | não | Código da programação de cargas já existente i. Exemplo de Retorno |

---

## getProgramacaoCargas

Página 172 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodProgramacao` | I — inteiro | 10 | **sim** | Código da programação |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `ProgramacaoCargas` | R — registro |  | **sim** | Registro com os dados da ProgramacaoCargas |
| &nbsp;&nbsp;`Agendamento` | R — registro |  | **sim** | Registro com os dados da guia engate |
| &nbsp;&nbsp;&nbsp;&nbsp;`Filial` | I — inteiro | 9 | **sim** | Nome da filial |
| &nbsp;&nbsp;&nbsp;&nbsp;`ValorFrete` | I — inteiro | 20 | não | Valor do frete |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaVeiculo` | T — texto | 10 | não | Placa do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Carreta01` | T — texto | 10 | não | Placa da carreta 01 |
| &nbsp;&nbsp;&nbsp;&nbsp;`Carreta02` | T — texto | 10 | não | Placa da carreta 02 |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista` | I — inteiro | 11 | não | CPF motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeMotorista` | T — texto | 250 | não | Nome motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista02` | I — inteiro | 11 | não | CPF motorista 02 |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeMotorista02` | T — texto | 250 | não | Nome motorista 02 |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFAjudante` | I — inteiro | 11 | não | CPF ajudante |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeAjudante` | T — texto | 250 | não | Nome ajudante |
| &nbsp;&nbsp;&nbsp;&nbsp;`PerfilSeguranca` | T — texto | 250 | não | Descrição do perfil de segurança |
| &nbsp;&nbsp;&nbsp;&nbsp;`Status` | T — texto | 2 | **sim** | Status da programação conforme lista: IC - Incluída AC - Aceita/confirmada VP - Veículo programado AF - Aguardando finalização de outra viagem VD - Veículo deslocando para local de coleta VC - Veículo no local de coleta IN - viagem em andamento VE - Veículo no local de entrega VA - Veículo atrasado para coleta CA - Demanda cancelada RE- Demanda rejeitada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Origem` | T — texto | 500 | não | Nome do cliente de origem |
| &nbsp;&nbsp;&nbsp;&nbsp;`Destino` | T — texto | 500 | não | Nome do cliente de destino |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | Registro com os dados guia detalhamento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`TipoVeiculo` | T — texto | 100 | não | Descrição do tipo do veículo obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`SubTipoVeiculo` | T — texto | 100 | não | Descrição do subtipo do veículo obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`TipoCarroceria` | T — texto | 100 | não | Descrição do tipo da carroceria obtido pelo método getTabela |
| `ColetasEntregas` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`Codigo` | R — registro |  | **sim** | Código do local de coleta/entrega |
| &nbsp;&nbsp;`Tipo` |  |  |  | Tipo: COLETA, ENTREGA, TROCAMOTORISTA, TROCANOTAFISCAL, EMISSAODOCUMENTO, MANUTENCAO, ADUANA, PASSAGEMMATRIZ, PERNOITE, FIMVIAGEMFILIAL |
| &nbsp;&nbsp;`PrevisaoChegada` | DH — data e hora | 29 | **sim** | Data e hora da chegada no local |
| &nbsp;&nbsp;`PrevisaoSaida` | DH — data e hora | 29 | **sim** | Data e hora de saída do local |
| &nbsp;&nbsp;`Cliente` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país Se houver integração do cliente através deste método se faz necessário informar o CNPJ (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade Se houver integração do cliente através deste método se faz necessário informar o código IBGE (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade, para pesquisa por nome caso não seja informado o CodIBGECidade |
| &nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 100 | não | Unidade de Federação (Estado), para pesquisa pelo nome ou sigla da UF caso não seja informado o CodIBGECidade. Nos países do exterior, caso não tenha o nome do Estado, pode ser informada a sigla do País |
| &nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a latitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 |  | Localização longitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a longitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM. (Para enviar uma solicitação de monitoramento sem produto / viagem vazia, informar o CodProduto = 999999999 ou NCMProduto = 99999999) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produto` |  |  |  | Descrição do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | não | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Categoria` | T — texto |  | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Quantidade` | T — texto |  | não | i. Exemplo de Retorno |

---

## getListaProgramacaoCargas

Página 176 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 30 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuario |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ ii. Exemplo de Requisição |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘getListaProgramacaoCargas’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Programações` |  |  |  | Array de programações |
| &nbsp;&nbsp;`ProgramacaoCargas` | R — registro |  | **sim** | Registro com os dados da ProgramacaoCargas |
| &nbsp;&nbsp;`Agendamento` | R — registro |  | **sim** | Registro com os dados da guia engate |
| &nbsp;&nbsp;&nbsp;&nbsp;`Filial` | I — inteiro | 9 | **sim** | Nome da filial |
| &nbsp;&nbsp;&nbsp;&nbsp;`ValorFrete` | I — inteiro | 20 | não | Valor do frete |
| &nbsp;&nbsp;&nbsp;&nbsp;`PlacaVeiculo` | T — texto | 10 | não | Placa do veículo |
| &nbsp;&nbsp;&nbsp;&nbsp;`Carreta01` | T — texto | 10 | não | Placa da carreta 01 |
| &nbsp;&nbsp;&nbsp;&nbsp;`Carreta02` | T — texto | 10 | não | Placa da carreta 02 |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista` | I — inteiro | 11 | não | CPF motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeMotorista` | T — texto | 250 | não | Nome motorista |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFMotorista02` | I — inteiro | 11 | não | CPF motorista 02 |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeMotorista02` | T — texto | 250 | não | Nome motorista 02 |
| &nbsp;&nbsp;&nbsp;&nbsp;`CPFAjudante` | I — inteiro | 11 | não | CPF ajudante |
| &nbsp;&nbsp;&nbsp;&nbsp;`NomeAjudante` | T — texto | 250 | não | Nome ajudante |
| &nbsp;&nbsp;&nbsp;&nbsp;`PerfilSeguranca` | T — texto | 250 | não | Descrição do perfil de segurança |
| &nbsp;&nbsp;&nbsp;&nbsp;`Status` | T — texto | 2 | **sim** | Status da programação conforme lista: IC - Incluída AC - Aceita/confirmada VP - Veículo programado AF - Aguardando finalização de outra viagem VD - Veículo deslocando para local de coleta VC - Veículo no local de coleta IN - viagem em andamento VE - Veículo no local de entrega VA - Veículo atrasado para coleta CA - Demanda cancelada RE- Demanda rejeitada |
| &nbsp;&nbsp;&nbsp;&nbsp;`Origem` | T — texto | 500 | não | Nome do cliente de origem |
| &nbsp;&nbsp;&nbsp;&nbsp;`Destino` | T — texto | 500 | não | Nome do cliente de destino |
| &nbsp;&nbsp;&nbsp;&nbsp;`Veiculos` | R — registro |  | não | Registro com os dados guia detalhamento |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`TipoVeiculo` | T — texto | 100 | não | Descrição do tipo do veículo obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`SubTipoVeiculo` | T — texto | 100 | não | Descrição do subtipo do veículo obtido pelo método getTabela |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`TipoCarroceria` | T — texto | 100 | não | Descrição do tipo da carroceria obtido pelo método getTabela |
| `ColetasEntregas` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`Codigo` | R — registro |  | **sim** | Código do local de coleta/entrega |
| &nbsp;&nbsp;`Tipo` |  |  |  | Tipo: COLETA, ENTREGA, TROCAMOTORISTA, TROCANOTAFISCAL, EMISSAODOCUMENTO, MANUTENCAO, ADUANA, PASSAGEMMATRIZ, PERNOITE, FIMVIAGEMFILIAL |
| &nbsp;&nbsp;`PrevisaoChegada` | DH — data e hora | 29 | **sim** | Data e hora da chegada no local |
| &nbsp;&nbsp;`PrevisaoSaida` | DH — data e hora | 29 | **sim** | Data e hora de saída do local |
| &nbsp;&nbsp;`Cliente` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Razao` | T — texto | 100 | não | Razão social, ou nome em caso de pessoa física Se a razão for informada, o web service assume que a inteção é incluir ou atualizar os dados do cliente. Nesse caso os campos do grupo Cliente passam a obedecer as regras do método setCliente. |
| &nbsp;&nbsp;&nbsp;&nbsp;`CNPJ` | I — inteiro | 14 | não | CNPJ do cliente. Se for uma pessoa física informar o CPF. E se for pessoa extrangeira informar o número usado naquele país Se houver integração do cliente através deste método se faz necessário informar o CNPJ (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Endereco` | T — texto | 200 | não | Endereço do cliente |
| &nbsp;&nbsp;&nbsp;&nbsp;`Numero` | T — texto | 5 | não | Número do endereço |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodIBGECidade` | I — inteiro | 7 | não | Código IBGE da cidade Se houver integração do cliente através deste método se faz necessário informar o código IBGE (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Cidade` | T — texto | 100 | não | Nome da Cidade, para pesquisa por nome caso não seja informado o CodIBGECidade |
| &nbsp;&nbsp;&nbsp;&nbsp;`UF` | T — texto | 100 | não | Unidade de Federação (Estado), para pesquisa pelo nome ou sigla da UF caso não seja informado o CodIBGECidade. Nos países do exterior, caso não tenha o nome do Estado, pode ser informada a sigla do País |
| &nbsp;&nbsp;&nbsp;&nbsp;`Latitude` | N — numérico | 15 | não | Localização latitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a latitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Longitude` | N — numérico | 15 |  | Localização longitudinal do endereço do cliente Se houver integração do cliente através deste método se faz necessário informar a longitude (esse campo se torna obrigatório) |
| &nbsp;&nbsp;`Produtos` | R — registro |  | SM | ‘N’ registro com os dados dos produtos transportados |
| &nbsp;&nbsp;&nbsp;&nbsp;`CodProduto` | I — inteiro | 9 | não | Código do produto conforme cadastro de produtos da Gerenciadora, não precisa informar se optar por informar o NCM. (Para enviar uma solicitação de monitoramento sem produto / viagem vazia, informar o CodProduto = 999999999 ou NCMProduto = 99999999) |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Produto` |  |  |  | Descrição do produto |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Valor` | N — numérico | 15 | não | Valor total dos produtos |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Categoria` | T — texto |  | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Quantidade` | T — texto |  | não | ii. Exemplo de Retorno |

---

## setAceitarProgramacaoCargas

Página 180 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 30 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuario |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodProgramacao` | I — inteiro | 10 | **sim** | Código da programação para aceite iii. Exemplo de Requisição |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 30 | **sim** | ‘setAceitarProgramacaoCargas’ |
| `Login` | T — texto | 12 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 | não | Texto com a mensagem de erro |
| `Aceitou` | T — texto | 3 | **sim** | Sim para o aceite executado e Não para o aceite não executado i. Exemplo de Retorno |

---

## setEventos

Página 181 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `PlacaVeiculo` | T — texto | 8 | **sim** | Placa que receberá o evento |
| `CodEvento` | T — texto | 3 | **sim** | Sigla do evento da tabela EVV_EVENTOS_VEICULO [PIN, DOC, CAR, PFI] ix. Exemplo de Requisição |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Metodo` | T — texto | 10 | **sim** | ‘setEventos’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | I — inteiro | 10 | **sim** | Mensagem de erro |
| `Eventos` | R — registro |  | **sim** | Registro do evento criado |
| &nbsp;&nbsp;`PlacaVeiculo` | T — texto | 8 | **sim** | Placa do veículo |
| &nbsp;&nbsp;`CodEvento` | T — texto | 3 | **sim** | Sigla do evento enviado |
| &nbsp;&nbsp;`DescEvento` | T — texto | 150 | **sim** | Descrição do evento enviado |
| &nbsp;&nbsp;`DataInicial` | DH — data e hora | 29 | **sim** | Data de envio do método x. Exemplo de Retorno |
| `Descrição` |  |  |  | Os dispositivos abaixo são obrigatórios no perfil de segurança, mas não foram localizados no cadastro deste veículo. O valor informado do produto está abaixo do valor do SUB-LIMITE informado na apólice. O valor informado do produto está acima do valor do LIMITE MÁXIMO DE GARANTIA informado na apólice. O valor informado do produto nao está dentro da faixa informada na apólice. O vínculo do veículo informado nao está dentro da faixa informada na apólice. O produto informado não está cadastrado na apólice. A data de validade da Apólice está vencida. A soma dos valores dos produtos está acima do Limite Máximo de Garantia da Apólice O CheckList do Rastreador foi concluído há mais de 24 horas. O Engate informado na pré-solicitação de monitorimento ainda não possui CheckList do Rastreador realizado. O CheckList do Rastreador realizado foi REPROVADO. Existem liberações de exceções em aberto para este veículo. Não foi digitado as informações da Pesquisa e Consulta do Veículo. Não foi digitado as informações da Pesquisa e Consulta da Carreta 01. Não foi digitado as informações da Pesquisa e Consulta da Carreta 02. Não foi digitado as informações da Pesquisa e Consulta da Carreta 03. Não foi digitado as informações da Pesquisa e Consulta do Motorista 01. Não foi digitado as informações da Pesquisa e Consulta do Motorista 02. Não foi digitado as informações da Pesquisa e Consulta do Ajudante. O Veículo não possui Pesquisa. O Veículo não possui Consulta. O Veículo não está ADEQUADO AO RISCO. A Carreta 01 não possui Pesquisa. A Carreta 01 não possui Consulta. A Carreta 01 não está ADEQUADA AO RISCO. A Carreta 02 não possui Pesquisa. A Carreta 02 não possui Consulta. A Carreta 02 não está ADEQUADA AO RISCO. A Carreta 03 não possui Pesquisa. A Carreta 03 não possui Consulta. A Carreta 03 não está ADEQUADA AO RISCO. O Motorista 01 não possui Pesquisa. O Motorista 01 não possui Consulta. O Motorista 01 não está ADEQUADO AO RISCO. O Motorista 02 não possui Pesquisa. O Motorista 02 não possui Consulta. O Motorista 02 não está ADEQUADO AO RISCO. O Ajudante não possui Pesquisa. O Ajudante não possui Consulta. O Ajudante não está ADEQUADO AO RISCO. O Veículo não possui Pesquisa/Consulta de Outra Gerenciadora. A Carreta 01 não possui Pesquisa/Consulta de Outra Gerenciadora. A Carreta 02 não possui Pesquisa/Consulta de Outra Gerenciadora. A Carreta 03 não possui Pesquisa/Consulta de Outra Gerenciadora. O Motorista 01 não possui Pesquisa/Consulta de Outra Gerenciadora. O Motorista 02 não possui Pesquisa/Consulta de Outra Gerenciadora. O Ajudante não possui Pesquisa/Consulta de Outra Gerenciadora. O Veículo não possui Localizador Secundário. O Veículo não possui Localizadores Avulsos. A Solicitação de Monitoramento não possui Veículo de Escolta Armada A Solicitação de Monitoramento não possui Agentes de Escolta Armada A Solicitação de Monitoramento não possui Veículo de Escolta Velada A Solicitação de Monitoramento não possui Agentes de Escolta Velada A Faixa de Temperatura está incorreta. Veículo Sem Posição Solicitação de Monitoramento Efetivada com Atraso Código da Rota é uma informação obrigatória Conjunto Veículo+Motorista+Carreta diferente do ativo no Grid É necessário informar pelo menos uma coleta É necessário informar pelo menos uma entrega O veículo já possui uma viagem em andamento O veículo já possui um CHECKLIST em andamento O veículo já possui Pré-SM em aberto O veículo já possui SM Iniciada ou em Aberto Quando um erro é retornado, significa que o método não foi executado, ou seja, um registro não foi incluído, A tabela de erros é genérica, por isso uma compreensão do erro nem sempre é possível somente pelo código, |
| `Descrição` |  |  |  | NAO EXISTEM REGISTROS NOVOS USUARIO INVALIDO CONSUMO INDEVIDO METODO NAO LIBERADO ERRO NA VALIDACAO DO CAMPO CODIGO NAO EXISTE O CADASTRO JA EXISTE O CADASTRO NAO EXISTE CADASTRO DUPLICADO Motorista nao esta cadastrado no sistema Motorista 2 nao esta cadastrado no sistema Ajudante nao esta cadastrado no sistema Veiculo nao esta cadastrado no sistema Carreta nao esta cadastrada no sistema Carreta 2 nao esta cadastrada no sistema Carreta 3 nao esta cadastrada no sistema Codigo da Profissao invalido CPF/CNPJ do Cliente invalido Cadastro de Cliente dupliado Falta informar o campo CodigoCliente Falta informar o numero do terminal do rastreador Falta informar o codigo da tecnologia do rastreador Falta informar o codigo do modelo do rastreador Codigo da Tecnologia do rastreador invalido Codigo do Modelo do rastreador invalido Codigo da Tecnologia do rastreador secundario invalido Codigo do Modelo do rastreador secundario invalido Dispositivo nao cadastrado para o modelo do rastreador Nao existe Rota cadastrada para esse Trajeto Empresa de Escolta nao cadastrada Codigo do Tipo do Veiculo invalido Codigo da Marca do Veiculo invalido Codigo da Cor do Veiculo invalido Pais de nacionalidade invalido Codigo da Filial invalido Nao existe Pre-Solicitacao de Monitoramento cadastrada com esse codigo Essa pre-solicitacao de monitoramento ja foi efetivada Essa pre-solicitacao de monitoramento esta cancelada Essa pre-solicitacao de monitoramento nao esta em aberto Codigo do Perfil de Seguranca invalido Codigo da Faixa de Temperatura invalido Codigo da Rota invalido Veiculo nao possui rastreador Veiculo tipo caminhao trator exige informacao da carreta Perfil de seguranca nao possui associacao com a tecnologia e modelo A data de saida nao pode ser menor que a data de chegada A data/hora de chegada nao pode ser menor que 24 horas atras A data/hora de saida nao pode ser menor que 24 horas atras NCM nao esta relacionado a nenhum produto da apolice Codigo do Produto invalido Falta configurar uma apolice no perfil de seguranca Produto nao configurado na apolice de seguro Cidade da primeira coleta difere da cidade de origem da rota Cidade da ultima entrega difere da cidade de destino da rota Falta informar a Rota Falta informar pelo menos uma Coleta Falta informar pelo menos uma Entrega Falta informar pelo menos um Produto Veiculo possui uma solicitacao de monitoramento aberta por outra empresa Rota desativada Veiculo da Escolta nao esta cadastrado no sistema Motorista da Escolta nao esta cadastrado no sistema Nao existe Solicitacao de Monitoramento cadastrada com esse codigo O veiculo nao esta ativo no Grid Status da Solicitacao de Monitoramento diferente de Iniciado Codigo da Solicitacao de Monitoramento esta vinculado a outra empresa Veiculo informado difere do cadastrado atualmente na Solicitacao de Monitoramento Motorista encontra-se ativo em outra Solicitacao de Monitoramento Carreta encontra-se ativa em outra Solicitacao de Monitoramento Nao existe Solicitacao de Monitoramento iniciada para este veiculo Motorista ja esta associado a Viagem Ja existe Solicitacao de Monitoramento iniciada para este veiculo Carreta ja esta associada a Viagem CNPJ do transportador e obrigatorio CNPJ do transportador nao e valido O veiculo ja possui Pre-SM em aberto O veiculo ja possui SM iniciada ou em aberto Lat/Long das coletas/entregas nao confere com os pontos de passagem A placa está ativa na blacklist O motorista está ativo na blacklist Não existe Pesquisa/Consulta com esses dados Latitude/lLongitude Inválidas Existem bloqueios na efetivação da Pré-SM Não foi possível realizar a pesquisa Pesquisa + não está habilitada. Falta informar os dados do cliente. A placa está ativa na gestão de reciclagem O motorista está ativo na getão de reciclagem ERRO DESCONHECIDO OPERACAO NEGADA 14. Tabela de motivos/dispositivos de reprovação do Checklist |
| `Descrição` |  |  |  | CHECKLIST EXPIRADO EQUIPAMENTO REPROVADO ENVIO DE COMANDO REPROVADO COMPUTADOR DE BORDO REPROVADO NAO ESTA ESPELHADO OU POSICIONANDO SENSOR DA PORTA DO BAU (TRASEIRO) IMOBILIZADOR DE CARRETA SENSORES DAS PORTAS DO CABINE (MOTORISTA E CARONA) BOTAO DE PANICO ALARME SONORO (SIRENE) ALARME VISUAL (SETAS) TRAVA DA 5ª RODA BLOQUEADOR DE COMBUSTIVEL SENSOR/GRADE DAS JANELAS DA CABINE (MOTORISTA E CARONA) SENSOR DE BATERIA VIOLADA SENSOR DE VIOLAÇÃO DE PAINEL SENSOR DE DESENGATE DA CARRETA ANTI JAMMER 15. Tabela de layout de placas Mascara AAA-9999 AAA-999 AA-AA-99 AAA9A99 AA999AA |
| `Descrição` |  |  |  | As referências encaminhadas não foram possíveis para análise. Solicitamos novas referências, preferencialmente de telefones fixos. Solicitamos conferir o nome do motorista/cpf, o mesmo está em desacordo com o registro do CPF. Os dados relativos a documentação do CNH deste motorista estão apresentando inconsistências, solicitamos que os dados sejam conferidos e caso necessário sejam ajustados. Na sequência solicitamos que o mesmo seja reenviado para a pesquisa, além de uma cópia do documento atual da CNH do motorista para o e-mail cadastro@logae.com.br. Filiação não confere. Favor corrigir e reenviar. Favor enviar a cópia da CNH juntamente com a declaração do DETRAN informando a situação do documento. Favor solicitar ao motorista que entre em contato pelos telefones (49)3441-3436 / (49)3441-3469 / (49)3441-3464 / (49)3441-3462 / (49)3441-3405 / (49)3441-3461 / (49)3441-3480 Os dados relativos a documentação do veículo estão apresentando inconsistências, solicitamos que os dados sejam conferidos e caso necessário sejam ajustados. Na sequência solicitamos que o mesmo seja reenviado para a pesquisa, além de uma cópia do documento atual do veículo para o e-mail cadastro@logae.com.br. Favor solicitar ao proprietário do veículo que entre em contato pelos telefones (49)3441-3436 / (49)3441-3469 / (49)3441-3464 / (49)3441-3462 / (49)3441-3405 / (49)3441-3461 / (49)3441-3480 Favor anexar no sistema a cópia do documento atual do veículo ou, encaminhar os comprovantes de pagamento das taxas necessárias para emissão do documento. Identificado proprietário incorreto. Favor conferir e reenviar. Obs: em caso de leasing, reenviar para pesquisa inserindo os dados do arrendatário. Em consulta realizada foi identificado irregularidades no registro da RNTRC junto a ANTT. solicitamos que seja confirmado com o proprietário do veículo se o mesmo possui outro registro junto a ANTT e que conste ATIVO no veículo. Em nossa consulta ao sistema no DENATRAN identificamos que o veículo está constando como roubado. Desta forma solicitamos que nos envie o auto de entrega. Em nossa consulta ao sistema no DENATRAN identificamos que o veículo está constando como roubado. Desta forma solicitamos que nos envie o auto de entrega. Favor anexar no sistema a cópia atualizada do documento do veículo para análise. Favor anexar no sistema a cópia atualizada da CNH do motorista para análise. Endereço do motorista informado pela referência, não confere com o que consta no sistema. N° de registro incorreto. Favor corrigir e reenviar. N° de segurança incorreto. Favor corrigir e reenviar. N° do RENACH incorreto. Favor corrigir e reenviar. Data da 1° habilitação incorreta. Favor corrigir e reenviar. UF da CNH incorreta. Favor corrigir e reenviar. N° do RG incorreto. Favor corrigir e reenviar. Data de nascimento incorreta. Favor corrigir e reenviar. Categoria da CNH incorreta. Favor corrigir e reenviar. Validade da CNH incorreta. Favor corrigir e reenviar. N° do CHASSI inválido. Favor corrigir e reenviar. Cidade/UF de licenciamento incorreto. Favor corrigir e reenviar. N° do RENAVAM incorreto. Favor corrigir e reenviar. Filiação não confere. Favor corrigir e reenviar. Placa inválida. Favor realizar nova pesquisa com a placa correta. Datas inválidas. Favor corrigir e reenviar. N° do documento da CNH incorreto. Favor corrigir e reenviar. Favor anexar no sistema a cópia atualizada da CNH do motorista para análise. Obs: anexar cópia do RG caso não seja motorista. Favor anexar no sistema a cópia atualizada do documento da ANTT para análise. |
| `Data` |  |  |  | Alterações |
| `05/02/2021` |  |  |  | ● Novo método “getImpressaoSM” ● Novos campos de filtro no método “getEventoFimViagem” (CNPJRemDest, Placa) ● Novo método “setFinalizaViagem” |
| `31/05/2021` |  |  |  | ● Adicionado o protocolo https no WS. |
| `19/08/2021` |  |  |  | ● Novos métodos para solicitação de CheckList |
| `18/11/2021` |  |  |  | ● Adicionado a obrigatoriedade das cidades no getRotas |
| `18/03/2022` |  |  |  | ● Novo campo de filtro no método “getStatusPreSM” (Placa) |
| `25/04/2022` |  |  |  | ● Novo método de revisão de viagens “setRevisaoPreSM” |
| `10/08/2022` |  |  |  | ● Novo campo de agência nos métodos de pesquisas e Pré-SM |
| `31/08/2022` |  |  |  | ● Novo método de ocorrências logísticas “getOcorrenciasLogisticas” |
| `07/11/2022` |  |  |  | ● Adicionado novos tipos de documento no “setPreSM” |
| `22/11/2022` |  |  |  | ● Adicionado o campo para gerar somente o cálculo de carbono. |
| `31/01/2023` |  |  |  | ● Adicionado método de inclusão de programação “setProgramacaoCargas” ● Adicionado método de consulta de programação “getProgramacaoCargas” ● Adicionado método de cancelamento de programação “setCancelamentoProgramacaoCargas” |
| `23/03/2023` |  |  |  | ● Adicionado método de inclusão de faixas de temperatura “setFaixaTemperatura” ● Adicionado novos campos de placas e status no retorno do método “getProgramacaoCargas” ● Adicionado método para consultar histórico de checklists “getHistoricoTestes” ● Adicionada possibilidade de gerar resultado de checklist através das placas no método “getGerarResultadoChecklist” |
| `31/05/2023` |  |  |  | ● Adicionado método de consulta de KM percorrido da frota “getKMRodado” |
| `06/08/2024` |  |  |  | ● Adicionado Informações da FIPE no método getVeiculo |
| `19/08/2024` |  |  |  | ● Ajustado informações gerais do arquivo |
| `20/08/2024` |  |  |  | ● Adicionado novo método de Inclusão de documentos ”setIncluirDocumentoViagem“ |
| `21/08/2024` |  |  |  | ● Adicionado ao metodo setsolicitacaoPesquisaConsulta e setsolicitacaoPesquisaConsultaConjunto a informação de como solicitar Pesquisa + ("PesquisaPlus": "S") |
| `23/08/2024` |  |  |  | ● Adicionado ao setVeiculo, getVeiculo, setCarreta e getCarreta os campos frigoríficos |
| `28/08/2024` |  |  |  | ● Adicionado ao método setTrocaVeiculo a informação de alterar o veículo por código da SM e placa atual (Troca de veículo com status AB) |
| `30/08/2024` |  |  |  | ● Adicionado aos métodos setClliente, getCliente, setMotorista, getMotorista a informação de CNPJ e CPFs da Argentina |
| `02/10/2024` |  |  |  | ● Adicionado ao método getTabela a nova tabela CARACTERISTICA_CARROCERIA |
| `16/10/2024` |  |  |  | ● Adicionado ao método setPreSm e setRevisaoPreSM a informação do remetente, tomador e destinátario |
| `23/10/2024` |  |  |  | ● Adicionado ao método setProprietario e getProprietario a informaçãoda profissão do proprietário pessoa física |
| `29/10/2024` |  |  |  | ● Adicionado ao método SeticluirChecklist a informação de mais um tipo de checklist:“Video” |
| `07/11/2024` |  |  |  | ● Adicionado ao getveiculos os campos “CaracteristicaCarroceria” “CodCaracteCarroceria” |
| `04/12/2024` |  |  |  | ● Adicionado ao método setProgramaçãocargas os dados de engate contendo placa, codigo do perfil de segurança e cpf do motorista. |
| `12/12/2024` |  |  |  | ● Adicionado o método setAgendamentoViagem ● Adicionados novos campos no método setPreSM “Código”, “Observação” |
| `16.12.2024` |  |  |  | ● Adicionado o método setSituacaoCarga |
| `20.01.2025` |  |  |  | ● Adicionado ao método setCliente o campo Pessoa, onde informa se é pessoa jurídica, física ou outros |
| `12.02.2025` |  |  |  | ● Adicionado ao método setPreSM o campo CNPJEmbarcador, onde informa os dados do Embarcador ● Adicionado ao método setProgramacaoCargas o campo IdentificadorExterno onde o usuário poderá adicionar informações a programação de cargas ● Adicionado aoretorno do método getEventoFimViagem os campos RazaoTransportado, FantasiaTransportador, CNPJTransportador, RazaoProprietario, FantasiaProprietario, CNPJProprietario |
| `18/02/2025` |  |  |  | ● Adicionado ao método setProgramacaoCargas o campo CodProgramacao |
| `21/02/2025` |  |  |  | ● Adicionado ao método getEventoFimViagem um novo StatusViagem, o status AB, que apresentará os dados das viagens efetivadas em aberto |
| `27/02/2025` |  |  |  | ● Adicionado ao metoro SetPreSM o novo campo “Gestor” onde sere informado a pessoa responsavel pela viagem |
| `21/05/2025` |  |  |  | ● Adicionado ao método setSolicitacaoPesquisaConsulta e getresultadoPesquisaConsulta o tipo analise biométrica. |
| `11/06/2025` |  |  |  | ● Adicionado ao setPreSM o tipo de documento SHIPMENT |
| `17/06/2025` |  |  |  | ● Criado novo método de posições “getPosicoesCliente” |
| `18/06/2025` |  |  |  | ● Adicionado o campo “Polyline” nos metodos “SetPreSM”,”GetRotas” |
| `03/09/2025` |  |  |  | ● Adicionada a nova tag contatoContratante no metodo SetPreSM com os campos: ○ Prioridade ○ Contato |
| `10/09/2025` |  |  |  | ● Alterada a regra do campo StatusAgendamento do método setAgendamentoViagem ● Removida a tabela STATUS_AGENDAMENTO do método getTabela ● Adicionados ao método setPreSM, os campos de operação e responsável |
| `01/10/2025` |  |  |  | ● Adicionado o campo “Placa” no método getStatusViagem |
| `22/10/2025` |  |  |  | ● Criado novo método de eventos “setEventos” |
| `13/01/2026` |  |  |  | ● Adicionado o campo “Embarcadores” no método setProgramacaoCargas |
| `21/01/2026` |  |  |  | ● Adicionado o campo “Anexos” no método setProgramacaoCargas |

---

## setCancelamentoProgramacaoCargas

Página 181 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `CodProgramacao` | I — inteiro | 10 | **sim** | Código da programação iii. Exemplo de Requisição |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 |  | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | T — texto | 250 |  | Texto com a mensagem de erro |
| `Cancelou` | I — inteiro | 10 | **sim** | Retorno ‘Sim’ ou ‘não’ iv. Exemplo de Retorno |

---

## setFaixaTemperatura

Página 182 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `FaixaTemperatura` | R — registro |  | **sim** | Dados da fixa de temperatura |
| &nbsp;&nbsp;`Nome` | T — texto | 250 | **sim** | Descrição do nome da faixa de temperatura |
| &nbsp;&nbsp;`ConfiguracaoCalculo` | T — texto | 1 | **sim** | Tipo do cálculo de eficiência I – apenas sensores do localizador/isca V – Apenas sensores do veículo T – Todos os sensores |
| &nbsp;&nbsp;`ControleTemperatura` | T — texto | 1 | **sim** | Duração do cálculo de eficiência V – Viagem completa P – Até a primeira entrega U – Até a última entrega |
| &nbsp;&nbsp;`SensoresRastreador` | R — registro |  | **sim** | Dados de máxima e mínima por sensor do veículo (Rastreador principal) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor01Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor01Max` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor02Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor02Max` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor03Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor03Max` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor04Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor04Max` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor05Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor05Max` | I — inteiro | 4 | não | Valor mínimo e máximo da faixa de temperatura por sensor Obs: Os valores devem estar entre -100 e 100. Obs2: Os sensores precisam ser habilitados em sequência, EX: sensor 03 só será habilitado se o 01 e 02 forem informados. Obs3: Caso nenhum sensor seja informado deveremos receber ao menos 1 sensor de localizador/isca |
| &nbsp;&nbsp;`SensoresLocalizador` | R — registro |  | **sim** | Dados de máxima e mínima por sensor do veículo (Localizador/Isca) |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor01Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor01Max` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor02Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor02Max` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor03Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor03Max` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor04Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor04Max` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor05Min` | I — inteiro | 4 | não |  |
| &nbsp;&nbsp;&nbsp;&nbsp;`Sensor05Max` | I — inteiro | 4 | não | Valor mínimo e máximo da faixa de temperatura por sensor Obs: Os valores devem estar entre -100 e 100. Obs2: Os sensores precisam ser habilitados em sequência, EX: sensor 03 só será habilitado se o 01 e 02 forem informados. Obs3: Caso nenhum sensor seja informado deveremos receber ao menos 1 sensor de rastreador v. Exemplo de Requisição |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `Codigo` | I — inteiro | 10 | **sim** | Código da faixa de temperatura cadastrada |
| `Nome` | T — texto | 250 | **sim** | Nome da faixa de temperatura cadastrada vi. Exemplo de Retorno |

---

## getKMRodado

Página 184 do manual.

### Requisição

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `Senha` | T — texto | 12 | **sim** | Senha do usuário |
| `TipoRetorno` | T — texto | 4 | **sim** | ‘JSON’ ou ‘XML’ |
| `Data` | D — data | 10 | **sim** | Data em que deseja receber o KM percorrido de cada veículo yyyy-mm-dd |

### Retorno

| campo | tipo | tam. | obr. | descrição |
|---|---|---|---|---|
| `Ambiente` | T — texto | 11 | **sim** | ‘Producao’ ou ‘Homologacao’ |
| `Login` | T — texto | 11 | **sim** | Login do usuário |
| `CodErro` | I — inteiro | 3 | **sim** | Código do erro conforme tabela anexa. Código zero (0) indica que não houve nenhum erro |
| `MsgErro` | I — inteiro | 10 | **sim** | Mensagem de erro |
| `KMRodado` | R — registro |  | **sim** |  |
| &nbsp;&nbsp;`Placa` | T — texto | 15 | **sim** | Placa do veículo |
| &nbsp;&nbsp;`Motorista` | T — texto | 250 | não | Nome do motorista associado |
| &nbsp;&nbsp;`VínculoVeiculo` | T — texto | 15 | **sim** | Vínculo conforme ativação (Frota, agregado ou terceiro) |
| &nbsp;&nbsp;`KMComViagem` | I — inteiro | 10 | **sim** | Km percorrido com viagem |
| &nbsp;&nbsp;`KMSemViagem` | I — inteiro | 10 | **sim** | KM percorrido sem viagem viii. Exemplo de Retorno |
