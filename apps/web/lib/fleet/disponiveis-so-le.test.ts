import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A ABA DE MOTORISTAS DISPONÍVEIS NÃO ESCREVE NADA — invariante I1 (fatia 031, 03/09).
 *
 * ── POR QUE ISTO PRECISA DE UM GUARDA ─────────────────────────────────────────────────────────
 *
 * A aba mostra quem está livre. O passo seguinte parece óbvio para quem chega depois: "já que a
 * lista sabe quem está livre, por que não atribuir por aqui?". Atribuir é escrita, passa pelo portal
 * do cliente e **é irreversível** — e o gesto inteiro, com as suas travas, já existe na Expedição.
 *
 * O outro caminho para o mesmo erro é mais silencioso: guardar "disponível" numa coluna nossa para
 * "não recalcular toda hora". Aí nasce uma segunda verdade que diverge do portal sem avisar — o erro
 * que a fatia 030 documentou, e o silêncio é o problema.
 *
 * Este teste tranca as duas portas de uma vez, no lado do `apps/web`. O lado do `packages/db` tem o
 * seu, em `motoristas-disponiveis.test.ts`.
 */
const RAIZ = join(__dirname, "..", "..");

function semComentario(caminho: string): string {
  /*
    COMENTÁRIO SAI ANTES DA ASSERÇÃO.

    Este projeto já errou isto duas vezes: a asserção casava com a frase que EXPLICA a regra, e o
    "conserto" natural era apagar o porquê. Os arquivos verificados aqui falam de atribuição e de
    escrita justamente para dizer que não fazem nem uma coisa nem outra.
  */
  return readFileSync(join(RAIZ, caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

const ROTA = "app/api/fleet/motoristas-disponiveis/route.ts";
const TELA = "components/fleet/motoristas-disponiveis-client.tsx";

describe("a rota da aba", () => {
  it("só responde GET — não há verbo de escrita exportado", () => {
    const fonte = semComentario(ROTA);
    expect(fonte).toContain("export async function GET");
    for (const verbo of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(
        fonte,
        `a rota ganhou ${verbo} — a aba informa, e atribuir continua na Expedição`,
      ).not.toContain(`export async function ${verbo}`);
    }
  });

  it("exige a permissão da Torre de Controle, e não uma nova", () => {
    expect(semComentario(ROTA)).toContain('requirePermission(ctx, "view_all_trips")');
  });
});

describe("a tela da aba", () => {
  it("não manda nada — nenhum fetch com método", () => {
    const fonte = semComentario(TELA);
    expect(fonte, "a tela passou a mandar alguma coisa; esta aba é só leitura").not.toMatch(
      /method:\s*["'](POST|PATCH|PUT|DELETE)["']/,
    );
  });

  /**
   * A BUSCA É ESTADO DA TELA. Mandá-la ao servidor faria a lista recarregar a cada tecla e trocar o
   * resultado debaixo de quem digita — e é o tipo de mudança que parece uma melhoria ("filtrar no
   * banco é mais rápido") e piora exatamente o gesto mais comum da aba.
   */
  it("não manda a busca nem a ordenação para o servidor", () => {
    const fonte = semComentario(TELA);
    const chamada = fonte.slice(fonte.indexOf("fetch("), fonte.indexOf("fetch(") + 200);
    expect(chamada, "a busca virou parâmetro da consulta").not.toContain("?");
    expect(chamada).not.toContain("busca");
  });

  /**
   * O polling desta aba não é o do cartão de spot. Lá são 5 s porque é leilão; aqui não há corrida, e
   * ler de 5 em 5 segundos seria 12x mais consulta para um dado que muda em minutos.
   */
  it("relê a cada 60 s e não fica atualizando em segundo plano", () => {
    const fonte = semComentario(TELA);
    expect(fonte).toContain("refetchInterval: 60_000");
    expect(
      fonte,
      "voltou a atualizar em segundo plano — não há nada a avisar nesta aba",
    ).not.toContain("refetchIntervalInBackground");
  });
});
