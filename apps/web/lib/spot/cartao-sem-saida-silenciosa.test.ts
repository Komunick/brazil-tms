import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * OS TRÊS GUARDAS DO CARTÃO DE SPOT (2026-09-01, fatia 030).
 *
 * Eles leem o código-fonte porque o que precisa ser garantido é a AUSÊNCIA de coisas — e ausência
 * não se prova rodando o componente: um teste de comportamento que não vê a cortina não distingue
 * "ela não existe" de "ela não apareceu neste caso".
 *
 * ── COMENTÁRIO SAI ANTES DE QUALQUER ASSERÇÃO ─────────────────────────────────────────────────
 *
 * Esta base já pagou três vezes por um teste que lê fonte e esbarra na frase que EXPLICA a regra —
 * duas na fatia 029 e uma nesta, no guarda do invariante I1. O sintoma é cruel: o teste acusa o
 * comentário, e "consertá-lo" significa apagar o porquê. Os arquivos aqui falam de cortina, de
 * trinta segundos e de fechar o tempo todo, justamente porque explicam por que essas coisas saíram.
 */

const RAIZ = join(__dirname, "../..");
const CAMADA = join(RAIZ, "components/spot/oferta-de-spot.tsx");
const CARTAO = join(RAIZ, "components/spot/cartao-da-oferta.tsx");

/**
 * Tira SÓ os comentários — e os textos entre aspas FICAM. A distinção custou um guarda inútil.
 *
 * A primeira versão apagava também as aspas, copiando o guarda do invariante I1. Testei-a nos dois
 * sentidos, como sempre, e ela passou verde com a cortina reintroduzida: `boxShadow: "0 0 0 9999px…"`
 * mora DENTRO de um texto, e o mesmo valia para `.filter(v => v.estado !== "aceito")`. O guarda
 * apagava exatamente aquilo que existia para encontrar.
 *
 * A lição: o que se apaga antes de asseverar depende do que se procura. No I1 procura-se um NOME DE
 * CAMPO, e apagar textos evita falso alarme; aqui procuram-se VALORES, que só existem como texto.
 * Comentário sai nos dois casos, e por um motivo que não muda: os arquivos daqui explicam a cortina,
 * os trinta segundos e o "aceito" o tempo todo — é para isso que os comentários existem.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

describe("a camada do cartão de spot não escurece a tela", () => {
  /**
   * A CORTINA É FÁCIL DE VOLTAR SEM NINGUÉM PERCEBER, e é por isso que ela tem guarda próprio.
   *
   * Ela existia como `boxShadow: 0 0 0 9999px rgba(3,10,18,0.62)` — um truque conhecido para
   * escurecer tudo em volta de um elemento. Com o cartão durando trinta segundos, era ênfase; com o
   * cartão PARADO na tela até alguém decidir, é o TMS apagado o dia inteiro.
   *
   * E o pedido do usuário foi explícito: "que não atrapalhe se alguém tiver atribuindo". Quem
   * mexer no visual daqui vai achar que a tela ficou sem contraste e vai querer trazê-la de volta.
   * Este teste é o bilhete dizendo que o contraste foi trocado de propósito.
   */
  it("não há sombra de tela cheia", () => {
    const codigo = semComentarios(readFileSync(CAMADA, "utf8"));
    expect(codigo, "a cortina de tela cheia voltou — ver o comentário deste teste").not.toMatch(
      /9999px/,
    );
  });

  it("a camada é transparente ao mouse; só os cartões recebem clique", () => {
    const codigo = readFileSync(CAMADA, "utf8");
    // Sem isto, a camada rouba o clique de quem está trabalhando no que está atrás (FR-003).
    expect(codigo).toContain("pointer-events-none");
    expect(readFileSync(CARTAO, "utf8")).toContain("pointer-events-auto");
  });
});

describe("o cartão não sai da tela sem decisão", () => {
  /**
   * FR-001: o cartão para de sair sozinho. O temporizador de trinta segundos foi removido, e com
   * ele a barra que escorria. Um `setTimeout` que volte aqui traz de volta o defeito inteiro — a
   * oferta some sem ninguém ter decidido.
   *
   * A exceção declarada é a virada do dia, e ela NÃO mora neste arquivo: é o recorte da leitura,
   * no servidor. Nada aqui conhece relógio.
   */
  it("não há temporizador que descarte o cartão", () => {
    const codigo = semComentarios(readFileSync(CAMADA, "utf8"));
    expect(codigo, "voltou um temporizador na camada — o cartão só sai por decisão").not.toMatch(
      /setTimeout|setInterval|DURACAO_MS/,
    );
  });

  /**
   * FR-014, provado por AUSÊNCIA: a tela não tem um caminho que remova um cartão por aceite.
   *
   * A oferta some porque a leitura seguinte não a traz — o servidor a exclui quando o portal diz
   * `Accepted`. Se existisse aqui um ramo que escondesse o cartão ao ver esse estado, existiria um
   * segundo motivo de saída, e a garantia viraria disciplina.
   *
   * O que se procura é o vocabulário do estado final sendo usado para FILTRAR ou ESCONDER.
   */
  /**
   * O QUE SE PROCURA É O FILTRO, e não a palavra — a primeira versão errava isso.
   *
   * Ela proibia qualquer ocorrência de "aceito" no arquivo, e reprovou no dia em que a camada passou
   * a exibir o rótulo `aceitoPor` no painel recolhido — um texto, não uma decisão. É a terceira vez
   * nesta fatia que um guarda largo demais acusa o certo.
   *
   * O defeito real tem uma forma reconhecível: comparar o ESTADO com `aceito` para esconder algo.
   * É isso que se proíbe.
   */
  it("a tela não decide sozinha esconder o que foi aceito", () => {
    const codigo = semComentarios(readFileSync(CAMADA, "utf8"));
    expect(
      codigo,
      "a camada passou a filtrar por estado 'aceito' — quem tira o cartão é o servidor, ver FR-014",
    ).not.toMatch(/estado\s*[!=]==\s*["']aceito["']/);
  });

  /**
   * FR-005: as saídas são aceitar e ignorar. RECOLHER NÃO É SAÍDA — é tamanho, e a contagem
   * continua à vista. Um botão de fechar que apagasse o cartão sem registrar nada é exatamente o
   * que fazia a oferta passar batido antes desta fatia.
   *
   * ── ESTE GUARDA FOI RENOMEADO, NÃO AFROUXADO (2026-09-01) ─────────────────────────────────
   *
   * Ele falava de `setRecolhido` e `if (recolhido)`, que era o booleano de quando havia dois
   * tamanhos. Agora são três formas (`centro`, `popup`, `pastilha`) e o estado é `escolhida`. A
   * pergunta não mudou uma vírgula: o passo mais discreto de todos ainda precisa dizer QUANTAS
   * esperam. Trocar a asserção pelos nomes novos é o conserto certo; apagá-la porque "o teste
   * quebrou no rename" seria perder a única coisa que impede a pastilha de virar um botão mudo.
   */
  it("recolher encolhe, e não remove", () => {
    const codigo = readFileSync(CAMADA, "utf8");
    expect(codigo, "recolher deixou de existir como gesto").toContain("aoRecolher");
    // A pastilha é o passo mais escondido — e mesmo ela mostra quantas esperam.
    const trecho = codigo.slice(codigo.indexOf('if (forma === "pastilha")'));
    expect(trecho.slice(0, 1200)).toContain("naTela.length");
  });

  /**
   * O DIÁLOGO ABERTO PRECISA CHEGAR VIVO ATÉ A REGRA (2026-09-01).
   *
   * `formaDaCamada` exige o campo, e o compilador cobra que ele exista — mas não que ele seja
   * VERDADE. Um `dialogoAberto: false` fixo compila, passa em todo teste desta pasta e desliga em
   * silêncio a única coisa que faz o cartão sair da frente de quem está atribuindo. É o defeito mais
   * barato de introduzir aqui, e o mais difícil de notar: nada quebra, o cartão só volta a atrapalhar.
   */
  it("a forma escuta o diálogo de verdade, e não um `false` fixo", () => {
    const codigo = semComentarios(readFileSync(CAMADA, "utf8"));
    expect(codigo, "a camada parou de observar o diálogo aberto").toContain("useDialogoAberto()");
    expect(
      codigo,
      "`dialogoAberto` virou constante — o cartão deixaria de encolher enquanto alguém atribui",
    ).not.toMatch(/dialogoAberto:\s*(true|false)/);
  });
});

describe("ignorar não fala com o portal", () => {
  /**
   * FR-016: ignorar limpa a tela de quem clicou e não manda ordem nenhuma. A rota que ele chama é a
   * da dispensa; se um dia alguém a apontar para `portal-action`, ignorar viraria rejeitar — e
   * rejeitar exige motivo do vocabulário do portal, o que está fora do escopo desta fatia.
   */
  it("o ignorar chama a dispensa, e o aceitar chama a ordem", () => {
    const codigo = readFileSync(CAMADA, "utf8");
    const ignorar = codigo.slice(codigo.indexOf("const ignorar"), codigo.indexOf("const aceitar"));
    expect(ignorar).toContain("/dispensar");
    expect(ignorar, "ignorar NÃO pode mandar ordem ao portal (FR-016)").not.toContain(
      "portal-action",
    );

    const aceitar = codigo.slice(codigo.indexOf("const aceitar"));
    expect(aceitar).toContain("portal-action");
    // A origem é o que a auditoria usa para separar a decisão do leilão da decisão da lista.
    expect(aceitar).toContain("oferta_spot");
  });
});
