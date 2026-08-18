# Robô do BSC

Copia para o TMS a nota que a Shopee dá à Brazil Transports, para o número que decide contrato ficar
na mesma tela da operação que o produz.

## Por que ele lê a TELA

O scorecard vive num relatório do Looker Studio, e **o Looker não expõe os valores de um relatório
por nenhum caminho suportado**. Não existe API. Então o script faz a única coisa que sobra: lê o que
está desenhado e entrega.

Isso o torna um parente desconfiado do robô do portal. Texto raspado de tela mente de um jeito que
JSON de API não mente — e todas as travas abaixo existem porque uma versão anterior mentiu.

## As quatro regras

1. **Não escreve nada no relatório.** Os únicos cliques são no seletor de período e no filtro
   "Transportador" — os dois são controles de **visualização**: mudam o que esta sessão do navegador
   mostra e não alteram o relatório para ninguém.
2. **Confirmado ou nada.** Depois de escolher o recorte, confere o rótulo que apareceu. Se não for o
   que pediu, não manda. Número com o período errado é pior que número nenhum: ao contrário de um
   erro visível, esse ninguém percebe.
3. **Só manda o que mudou.** O BSC publica uma vez por dia. Desde a 1.13.0 ele confere o carimbo do
   rodapé — visível sem clicar em nada — e só faz o ciclo completo se o relatório republicou. Isso
   levou as trocas de filtro de 72 por dia para 3.
4. **Nunca trava.** Todo erro é engolido e registrado, o ciclo seguinte é agendado a partir do FIM do
   anterior, e nada é recursivo.

## O que ele entrega

Três recortes, cada um uma linha em `bsc_snapshots`:

| recorte | janela | como é escolhido |
|---|---|---|
| `day` | ontem | menu "Ontem" |
| `week` | **domingo a segunda** (9 dias) | "Avançado", ancorado na última segunda-feira |
| `month` | mês até ontem | "Este mês, até agora" |

A semana é ancorada no **calendário**, não em hoje: ela fica parada de segunda a domingo e anda na
segunda seguinte. A versão anterior contava "nove dias a partir de hoje" e escorregava um dia por
dia, virando "segunda a terça".

**Ontem, e não hoje**: o relatório exclui o dia corrente — "Hoje" devolve 7 indicadores e nenhuma
nota, a qualquer hora.

## Preparo da aba (uma vez, à mão)

1. Abrir o relatório com **`?hl=pt-BR`** no fim da URL.
2. Deixar a aba **dedicada** — ninguém navega nela.

O idioma não é enfeite: a mesma conta já abriu o relatório em inglês, e lá o ponto é decimal —
`100.00%` seria lido como 10.000%. O script confere o idioma antes de qualquer coisa.

O filtro "Transportador" **não está mais nesta lista**: era o item que ninguém lembrava, falhava
calado e derrubava o BSC até alguém reparar num carimbo velho. Desde a 1.12.0 o robô o repõe sozinho
quando a tela aparece sem indicadores.

## O que a leitura de tela ensinou

Cada item abaixo custou uma versão. Ficam registrados porque voltam se alguém "simplificar" o
arquivo:

| armadilha | o que acontece |
|---|---|
| O carimbo não se chama "Atualizado em" | é `Dados atualizados pela última vez`, no rodapé |
| Nenhum elemento tem o texto exato | o Looker desenha ícone com ligadura: `calendar_today Selecionar período arrow_drop_down` |
| `el.click()` não abre menu | é preciso pointerdown → mousedown → pointerup → mouseup → click; submenu abre no passar do mouse |
| Tela parada não é tela pronta | enquanto recalcula, o Looker **esvazia** os cartões — e o vazio também fica parado |
| Tela cheia e parada pode ser a ANTERIOR | a do recorte anterior passa em qualquer teste de quietude; por isso o patamar só vale se a tela for **outra** |
| O carimbo é do relógio do NAVEGADOR | somar `-03:00` a uma hora que já era UTC criava dado do futuro — que nunca parece erro, parece o dado mais fresco que existe |

## Quando algo dá errado

O console (F12) traz a versão em toda linha — `[TMS BSC 1.13.1]`. É a única forma confiável de saber
o que está instalado; a constante que dizia isso já envelheceu sozinha, e hoje o número vem do
`GM_info`.

| linha no console | o que fazer |
|---|---|
| `a tela ficou Ns sem nota nem indicador` | o filtro "Transportador" caiu e o robô não conseguiu repor — olhar a aba |
| `a tela continuou sendo a do recorte anterior` | o relatório demorou mais que o teto; o ciclo seguinte tenta de novo |
| `o relatório não republicou desde ...` | **normal**: é a economia da regra 3 |
| `TMS respondeu 401` | token diferente entre script e servidor |

No painel do TMS, o cartão avisa sozinho: acima de 30 horas sem publicação nova ele mostra
**"sem atualizar há N h"** em vermelho. Carimbo no futuro também dispara o aviso.

## Instalação e atualização

O arquivo servido ao Tampermonkey é uma **cópia com o token preenchido**, fora do repositório
(`/home/ubuntu/robo-portal/entrega/`), publicada em `http://127.0.0.1:8899`. O deploy não a atualiza.

Para atualizar: copiar o arquivo novo preservando o `CONFIG`, **subir o `@version`**, abrir a URL no
navegador da VM (o Tampermonkey oferece a atualização com o diff) e **recarregar a aba** — a página
em execução continua com o código antigo até isso.

Ver `docs/OPERACAO.md` para o resto: ambientes, segredos, deploy e diagnóstico.
