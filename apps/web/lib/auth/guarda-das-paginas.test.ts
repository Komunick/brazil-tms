import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/lib/nav";

/**
 * ESCONDER NO MENU NUNCA É A ÚNICA DEFESA (FR-006, fatia 029).
 *
 * O cenário 2 da US1 diz, com todas as letras: quem perde o acesso perde **inclusive se digitar o
 * endereço direto**. O menu filtrado é conforto; quem recusa é o servidor.
 *
 * ── POR QUE ESTE TESTE LÊ O CÓDIGO-FONTE ──────────────────────────────────────────────────────
 *
 * Porque o defeito que ele previne é uma **ausência**: alguém acrescenta uma página, põe o item no
 * menu com a permissão certa, e esquece a guarda no `page.tsx`. Nada quebra. A página some do menu
 * de quem não pode — e abre inteira para quem digitar o endereço, ou para quem tiver o link.
 *
 * Ausência não tem tipo, e não há como um teste de unidade cobrá-la. A única forma é contar.
 *
 * Medido em 31/08, ao escrever isto: **29 de 29 itens já estavam certos**. O teste não conserta
 * nada hoje — ele impede o trigésimo de nascer torto.
 *
 * ── E A PERMISSÃO PRECISA SER A MESMA ─────────────────────────────────────────────────────────
 *
 * Não basta ter *alguma* guarda. Se o menu esconde por `manage_users` e a página guarda por
 * `view_all_trips`, existe gente que não vê o item e abre a tela — que é o defeito com um passo a
 * mais, e ainda mais difícil de notar.
 */

/**
 * Onde mora o `page.tsx` de um item do menu. Tudo do menu vive no grupo `(shell)`.
 *
 * Ancorado em `__dirname`, e não em `process.cwd()`: o vitest roda da RAIZ do monorepo, então o
 * `cwd` aponta para o repositório e não para `apps/web`. Com `cwd` os 29 casos falhavam por caminho
 * errado — o que é o pior tipo de teste, porque ele acusa um defeito que não existe e ensina quem
 * vier depois a desconfiar dele.
 */
function caminhoDaPagina(href: string): string {
  return join(__dirname, "../../app/(shell)", href === "/" ? "." : href, "page.tsx");
}

const COM_PERMISSAO = NAV_ITEMS.filter((i) => i.permission);

describe("toda página do menu se defende no servidor", () => {
  it("há itens com permissão para conferir — o teste não pode passar por vazio", () => {
    // Sem isto, alguém que refatorasse o `nav.ts` esvaziaria a lista e este arquivo passaria a não
    // afirmar nada, em silêncio. É o jeito de um teste morrer sem ninguém notar.
    expect(COM_PERMISSAO.length).toBeGreaterThanOrEqual(25);
  });

  it.each(COM_PERMISSAO.map((i) => [i.key, i.href, i.permission!] as const))(
    "%s (%s) guarda por `%s`",
    (_key, href, permission) => {
      const arquivo = caminhoDaPagina(href);
      expect(existsSync(arquivo)).toBe(true);

      const fonte = readFileSync(arquivo, "utf8");
      /*
        A guarda pode ser `can(session.user, "x")` na página ou `requirePermission(ctx, "x")` num
        `layout` que ela use — o que este caso exige é que a CHAVE apareça no arquivo da página, que
        é onde a decisão de abrir ou não abrir tem de estar.
      */
      expect(fonte).toContain(`"${permission}"`);
    },
  );
});

describe("as páginas SEM permissão no menu são poucas e deliberadas", () => {
  it("só as que qualquer pessoa autenticada pode ver", () => {
    /**
     * Um item sem `permission` aparece para todo mundo — inclusive para quem está num cargo vazio.
     * A lista é curta de propósito, e este caso existe para que acrescentar uma quarta seja uma
     * decisão, e não um esquecimento: quem esquecer o campo cai aqui.
     */
    const semPermissao = NAV_ITEMS.filter((i) => !i.permission).map((i) => i.key);
    expect(semPermissao.sort()).toEqual(["home", "novidades"].sort());
  });
});
