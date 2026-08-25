# Extrair a referência da Integra 14.2 do manual da Logae

Gera `docs/INTEGRA-14.2-REFERENCIA.md` a partir do PDF do manual convertido para HTML.

```bash
node scripts/integra-referencia/1-extrair-linhas.js /tmp/linhas.json
node scripts/integra-referencia/2-montar-referencia.js /tmp/linhas.json docs/INTEGRA-14.2-REFERENCIA.md
```

O caminho do manual está escrito dentro do primeiro script. Ele espera o HTML gerado pelo
`pdf2htmlEX` — não o PDF.

## Por que isto existe

O manual vivia na pasta de Downloads de uma pessoa. Duas decisões da fatia 026 foram tomadas com
suposições sobre a API que o manual desmentia, e a única forma de conferir era alguém abrir o PDF e
procurar. Um documento no repositório é `grep`ável, entra em revisão de código e não some.

## Por que é mais difícil do que parece

O PDF vira HTML com divs posicionados, sem tabela nenhuma. Reconstruir as colunas é ler a posição
de cada pedaço de texto. Quatro coisas quebram uma extração ingênua, e cada uma custou uma
tentativa:

**O texto vem picado.** O `pdf2htmlEX` corta as palavras com spans de espaçamento — a string
`setPreSMdeModelo` **não existe** no arquivo. Só aparece depois de tirar as tags.

**Há duas camadas de posição.** As células são `<div class="c">` com `y` de página; o texto dentro
delas é `<div class="t">` com `y` **relativo à célula**. Agrupar pelo `y` errado junta a tabela
inteira numa linha só.

**Os títulos mentem, e o manual também.** Dezesseis métodos não têm título como texto no HTML, e
pelo menos um declara o nome errado no próprio retorno (a resposta do `setPreSMdeModelo` diz
`setEfetivaPreSM`). Por isso o nome sai de três sinais em ordem: título da seção, índice do manual
por página, e nome declarado no retorno.

**O marcador de seção tem duas formas.** `■ Layout da Requisição` na maioria das páginas, e
`i. Layout da Requisição` em outras. Exigir o `■` perdia dezoito métodos — inclusive a família
inteira de programação de cargas, que é a que interessa.

## O que ele não faz

Sete métodos ficam de fora, listados no topo do documento gerado: a seção deles começa na mesma
página da anterior e não há como separar. **Omitir é o desfecho bom** — o ruim seria aparecerem com
os campos de outro método, e aí quem consulta confia num dado errado.
