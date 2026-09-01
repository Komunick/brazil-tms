import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estadoDaOferta } from "@brazil-tms/shared";

/**
 * A CORREÇÃO DA CONTAGEM DO PAINEL, e a assimetria entre as duas leituras (2026-09-01, fatia 030).
 *
 * Os dois assuntos moram no mesmo arquivo de propósito: eles são fáceis de "consertar" um no outro.
 * Quem encontrar a assimetria vai querer uniformizar; quem encontrar a terceira conta vai querer
 * simplificar de volta para duas. Os testes ficam lado a lado para que a próxima pessoa veja as
 * duas razões juntas.
 */

const fonte = readFileSync(join(__dirname, "programacao.ts"), "utf8")
  // Comentário sai: este arquivo explica a contagem antiga e a nova o tempo todo, e um teste que
  // esbarrasse na explicação levaria alguém a apagar o porquê para deixá-lo verde.
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

describe("a contagem de aceitas do painel", () => {
  /**
   * O DEFEITO QUE ESTA FATIA CORRIGIU DE PASSAGEM.
   *
   * A conta era `t.id is not null` — A VIAGEM EXISTE NO TMS —, e isso contava como PEGA a oferta que
   * ainda esperava decisão no portal. O erro é passageiro (das 98 ofertas que casaram com viagem, 98
   * estão `Accepted` hoje), e por ser passageiro nunca foi notado: quem confere o painel no fim do
   * dia sempre viu o número já correto.
   *
   * Ele errava exatamente na janela que esta fatia habita — os minutos entre a viagem chegar e
   * alguém decidir. Sem este teste, a correção seria efeito colateral que ninguém confere.
   */
  it("não conta 'a viagem existe' como aceita", () => {
    expect(
      fonte,
      "a contagem voltou ao atalho `t.id is not null` — ela precisa perguntar pela ACEITAÇÃO do portal",
    ).not.toMatch(/filter\s*\(\s*where[^)]*t\.id is not null[^)]*\)\s*as\s+aceito/i);
  });

  it("as três contas somam o total, e a terceira existe", () => {
    // Sem `esperando`, a oferta que espera decisão teria de mentir numa das outras duas.
    expect(fonte).toMatch(/as\s+esperando/i);
    expect(fonte).toMatch(/as\s+aceito/i);
    expect(fonte).toMatch(/as\s+nao_aceito/i);
  });

  /**
   * A DERIVAÇÃO É UMA SÓ, e é o que garante o FR-022.
   *
   * A linha do painel traz as ENTRADAS cruas e chama `estadoDaOferta` no mapeamento — a mesma função
   * que a leitura do cartão usa. Reimplementar a máquina de cinco estados em SQL concordaria no dia
   * em que fosse escrita e divergiria em silêncio no primeiro ajuste, com as duas telas dizendo
   * coisas diferentes sobre a mesma oferta e nenhum erro em lugar nenhum.
   */
  it("o estado da linha vem da função compartilhada, não de um SQL paralelo", () => {
    expect(fonte, "o painel parou de usar `estadoDaOferta` — ver FR-022").toContain(
      "estadoDaOferta(",
    );
  });
});

describe("as duas leituras são assimétricas de propósito", () => {
  const cartao = readFileSync(join(__dirname, "spot-offers.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  /**
   * A oferta ACEITA some do cartão e FICA no painel. Parece incoerência e é o FR-014 de um lado e o
   * registro do dia do outro: uma leitura é a fila do que falta decidir, a outra é a história do que
   * aconteceu. Uniformizá-las pareceria faxina e quebraria a garantia por construção.
   */
  it("o cartão exclui a oferta aceita; o painel não", () => {
    expect(cartao, "o cartão parou de excluir o aceito — o FR-014 depende disso").toMatch(
      /estado\s*!==\s*"aceito"/,
    );
    expect(
      fonte,
      "o painel passou a excluir o aceito — ele é o registro do dia e precisa mostrá-lo",
    ).not.toMatch(/estado\s*!==\s*"aceito"/);
  });

  /**
   * A DISPENSA: o cartão ESCONDE, o painel MARCA — e a assimetria sobreviveu à inversão de 01/09.
   *
   * Quando ignorar valia só para quem clicava, o painel marcava "ignorado por você". Agora a decisão
   * é da equipe e ele marca QUEM ignorou, com o motivo. O que não mudou é o essencial: a linha
   * continua listada, porque o painel é o registro do dia e ignorar não apaga a prova de que a
   * oferta chegou.
   */
  it("o cartão esconde o ignorado; o painel apenas marca quem ignorou", () => {
    expect(cartao).toMatch(/!\s*r\.dispensada\b/);
    expect(fonte).toContain("ignoradaPor");
    expect(fonte, "o painel passou a FILTRAR a dispensa — ali ela só marca").not.toMatch(
      /filter\([^)]*ignoradaPor/,
    );
  });
});

describe("a derivação usada pelas duas telas", () => {
  /**
   * O caso que a correção do painel depende: viagem no TMS, aceitação ainda pendente. A conta antiga
   * dizia "aceita"; a derivação diz "esperando", que é a verdade e é o que a linha mostra em âmbar.
   */
  it("viagem no TMS ainda pendente é 'esperando', não 'aceito'", () => {
    expect(
      estadoDaOferta({
        tripId: "t1",
        aceitacaoDoPortal: "Pending",
        ordemAberta: false,
        ultimaFalhou: false,
      }),
    ).toBe("esperando");
  });
});

/**
 * AS COLUNAS DAS LATERAIS PRECISAM EXISTIR — o guarda que nasceu de derrubar a produção.
 *
 * ── O QUE ACONTECEU, em 2026-09-01 ────────────────────────────────────────────────────────────
 *
 * Uma substituição por script falhou em silêncio no meio da consulta do painel: o `jsonb_build_object`
 * passou a ler `d.por`, e a lateral que deveria produzir essa coluna continuou devolvendo
 * `true as dispensada`. O painel inteiro parou em produção com `column d.por does not exist`.
 *
 * NADA PEGOU, e é isso que importa aqui:
 *
 *   · os testes deste arquivo leem o SQL como TEXTO — nenhum o executa;
 *   · o TypeScript não confere consulta dentro de uma template string;
 *   · o `pnpm build` compilou;
 *   · a simulação que rodei naquele dia era da MIGRAÇÃO, não desta leitura.
 *
 * Foi preciso alguém abrir a tela para descobrir.
 *
 * ── O QUE ESTE GUARDA FAZ, e o que ele NÃO faz ────────────────────────────────────────────────
 *
 * Ele confere que toda coluna citada como `<alias>.<coluna>` de uma lateral está entre as que aquela
 * lateral produz. É barato e pega exatamente a classe de erro acima — a metade que ficou para trás.
 *
 * Ele NÃO substitui executar. Só o banco sabe se a consulta inteira é válida; o certo, quando se
 * mexer aqui, continua sendo rodá-la contra o dev antes de subir.
 */
describe("as laterais do painel produzem as colunas que a consulta lê", () => {
  const fonteCrua = readFileSync(join(__dirname, "programacao.ts"), "utf8");

  /** `left join lateral ( … ) X on true` → o corpo e o apelido de cada uma. */
  const laterais = [...fonteCrua.matchAll(/left join lateral \(([\s\S]*?)\)\s*(\w+) on true/g)];

  it("encontra as laterais — senão o teste passaria sem olhar nada", () => {
    expect(laterais.length).toBeGreaterThanOrEqual(2);
  });

  for (const [, corpo, apelido] of laterais) {
    it(`a lateral \`${apelido}\` produz tudo o que \`${apelido}.\` pede`, () => {
      /*
        O que ela PRODUZ: os `as <nome>` e as colunas selecionadas sem apelido. Comentários saem
        antes, senão a frase que explica a regra entraria na conta.
      */
      const semComentario = (corpo ?? "")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/--.*$/gm, " ");
      const produz = new Set(
        [...semComentario.matchAll(/\bas\s+(\w+)/gi)].map((m) => m[1]!.toLowerCase()),
      );
      // `select sd.motivo` produz a coluna `motivo`, sem `as`.
      for (const m of semComentario.matchAll(/select\s+([\s\S]*?)\bfrom\b/gi)) {
        for (const campo of (m[1] ?? "").split(",")) {
          const nome = /(\w+)\s*$/.exec(campo.trim())?.[1];
          if (nome) produz.add(nome.toLowerCase());
        }
      }

      /* O que a consulta PEDE daquele apelido, fora do corpo da própria lateral. */
      const foraDaLateral = fonteCrua.replace(corpo ?? "", " ");
      const pede = new Set(
        /*
          `\\b` e `\\w` ESCAPADOS — e isto quase custou o guarda inteiro.

          A primeira versão escreveu o padrão num template literal como `\b…\.(\w+)`. Ali `\b` é o
          caractere de BACKSPACE e `\w` é a letra `w` — o regex virou outra coisa, não achou nada, e
          o guarda passou verde COM o defeito reintroduzido. Um guarda que nunca reprova não é
          guarda, e este só foi flagrado porque a verificação nos dois sentidos é obrigatória aqui.
        */
        [...foraDaLateral.matchAll(new RegExp(`\\b${apelido}\\.(\\w+)`, "g"))].map((m) =>
          m[1]!.toLowerCase(),
        ),
      );

      const faltando = [...pede].filter((c) => !produz.has(c));
      expect(
        faltando,
        `a consulta lê ${apelido}.${faltando.join(`, ${apelido}.`)} e a lateral não produz. ` +
          "Foi exatamente assim que o painel caiu em 01/09.",
      ).toEqual([]);
    });
  }
});
