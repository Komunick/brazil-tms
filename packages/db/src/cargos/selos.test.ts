import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SELO NUNCA CONCEDE PERMISSÃO (FR-013) — e este arquivo prova por CONSTRUÇÃO, não por exemplo.
 *
 * ── POR QUE NÃO BASTA TESTAR "APLIQUEI UM SELO E O CONJUNTO NÃO MUDOU" ────────────────────────
 *
 * Porque esse teste passaria hoje e continuaria passando no dia em que alguém acrescentasse uma
 * regra nova — ele só olha o caminho que já existe. O que precisa ser trancado é a AUSÊNCIA de
 * caminho: nenhum código de selo pode escrever onde o acesso é decidido.
 *
 * A decisão de negócio por trás disto foi tomada contra o modelo do Discord, onde vários cargos
 * somam permissões. O motivo é a pergunta que se faz depois de um incidente: *"por que fulano
 * conseguia cancelar?"*. Com soma, responder exige juntar três cargos e conferir a união. Com um
 * cargo só, é uma linha.
 *
 * Se um dia a empresa decidir que selo dá acesso, é AQUI que a decisão tem de ser desfeita — de
 * propósito. Um teste que cai obriga alguém a ler o porquê antes de mudar de ideia.
 */
/**
 * O CÓDIGO SEM OS COMENTÁRIOS.
 *
 * Sem isto, a primeira versão deste teste caiu no próprio arquivo que ele protege: o comentário lá
 * diz, em voz alta, "nada aqui escreve em `cargo_permissoes`" — e a asserção pegava a explicação.
 *
 * A explicação é justamente o que não pode sair. Um teste que proíbe o texto que documenta a regra
 * empurra quem vier depois a apagar o porquê para fazer a CI passar.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const FONTE = semComentarios(readFileSync(join(__dirname, "selos.ts"), "utf8"));

/** As tabelas onde o acesso é decidido. Escrever em qualquer uma delas a partir do selo é o defeito. */
const ONDE_O_ACESSO_MORA = ["cargo_permissoes", "cargoPermissoes", "cargoId", "cargo_id"];

describe("o código dos selos não alcança o acesso", () => {
  it.each(ONDE_O_ACESSO_MORA)("não menciona `%s`", (alvo) => {
    expect(FONTE).not.toContain(alvo);
  });

  it("nem `permissao`, que é a coluna concedida", () => {
    expect(FONTE).not.toContain("permissao");
  });

  it("escreve APENAS nas duas tabelas de selo", () => {
    /**
     * O outro lado da mesma afirmação: não basta não tocar no acesso, é preciso que o que ele toca
     * seja só o dele. Uma escrita em `users` daqui poderia mudar cargo sem citar a coluna pelo nome
     * — por exemplo, com um `set` montado dinamicamente.
     */
    const escritas = [...FONTE.matchAll(/tx\.(insert|update|delete)\(([A-Za-z]+)\)/g)].map(
      (m) => m[2],
    );
    expect([...new Set(escritas)].sort()).toEqual(["selos", "usuarioSelos"]);
  });
});

/**
 * E O MESMO VALE PARA AS ROTAS.
 *
 * O arquivo de dados pode estar limpo e a rota fazer a ligação por fora — chamando o serviço de
 * cargo depois de gravar o selo, por exemplo. Este bloco varre as rotas de selo procurando qualquer
 * menção ao vocabulário de acesso.
 */
describe("as rotas de selo também não alcançam o acesso", () => {
  const RAIZ = join(__dirname, "../../../../apps/web/app/api");

  function rotasDeSelo(dir: string, achadas: string[] = []): string[] {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, item.name);
      if (item.isDirectory()) rotasDeSelo(caminho, achadas);
      else if (item.name === "route.ts" && caminho.includes("selo")) achadas.push(caminho);
    }
    return achadas;
  }

  const rotas = rotasDeSelo(RAIZ);

  it("encontrou as rotas — senão este bloco não afirmaria nada", () => {
    // Um teste que varre e não acha nada passa em silêncio, e é assim que um guarda morre.
    expect(rotas.length).toBeGreaterThanOrEqual(3);
  });

  it.each(rotas.map((r) => [r.split("api")[1] ?? r, r] as const))(
    "%s não menciona cargo nem permissão",
    (_rotulo, caminho) => {
      const fonte = readFileSync(caminho, "utf8");
      // `manage_users` é a permissão EXIGIDA para mexer em selo, e é legítima: ela diz quem pode
      // usar a rota, não o que o selo concede. O resto do vocabulário de acesso não pode aparecer.
      const semAGuarda = semComentarios(fonte).split("manage_users").join("");
      for (const alvo of ["cargo_permissoes", "cargoPermissoes", "cargoId", "gravarCargo"]) {
        expect(semAGuarda).not.toContain(alvo);
      }
    },
  );
});
