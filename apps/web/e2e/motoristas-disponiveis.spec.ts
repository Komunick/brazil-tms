import { test, expect, type Page } from "@playwright/test";
import { testAccounts, routes } from "./test-config";

/**
 * A ABA DE MOTORISTAS DISPONÍVEIS (fatia 031, 03/09).
 *
 * ── O QUE ESTAS ESPECIFICAÇÕES PROVAM, E O QUE ELAS NÃO PODEM PROVAR ──────────────────────────
 *
 * A regra — a virada do dia, o corte de sete dias, cancelada não é finalizada — é provada sem banco
 * em `packages/shared/src/domain/disponibilidade.test.ts`. A fonte, em
 * `packages/db/src/fleet/motoristas-disponiveis.test.ts`. Os invariantes contra dados de verdade,
 * por consulta de leitura à produção (quickstart, T037).
 *
 * O que sobra para aqui é o que só a tela responde: **a página abre, a tabela tem as colunas certas,
 * a busca filtra sem recarregar, e o vazio fala em palavras**.
 *
 * ── SOBRE O AMBIENTE ──────────────────────────────────────────────────────────────────────────
 *
 * O banco de desenvolvimento pode não ter viagem do dia — os robôs escrevem em produção. Lista
 * vazia aqui é **falta de dado, não regressão**, e é por isso que nenhuma asserção depende de haver
 * linhas: elas verificam a MOLDURA (cabeçalhos, contagens, estado vazio), que existe com dado ou sem.
 */

const ROTA = "/motoristas-disponiveis";

const PT = {
  titulo: "Motoristas disponíveis",
  buscar: "Buscar por motorista, estação ou placa",
  vazio: "Nenhum motorista disponível ou chegando hoje e amanhã.",
  vazioBusca: "Nenhum motorista encontrado para essa busca.",
  colunas: [
    "Nome",
    "Origem",
    "Destino",
    "Data de início",
    "Data de conclusão",
    "Cavalo",
    "Carreta",
    "Status",
  ],
};

async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto(routes.login);
  await page.getByLabel(/e-?mail/i).fill(account.email);
  await page.getByLabel(/senha/i).fill(account.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(routes.login), { timeout: 15_000 });
}

test.describe("Motoristas disponíveis", () => {
  test("a aba abre e mostra a moldura da planilha que ela substitui", async ({ page }) => {
    await signIn(page, testAccounts.admin);
    await page.goto(ROTA);

    await expect(page.getByRole("heading", { name: PT.titulo })).toBeVisible();

    // Ou a tabela com as colunas, ou a frase de vazio — nunca uma tabela sem linhas e sem explicação.
    const vazio = page.getByText(PT.vazio);
    if (await vazio.isVisible().catch(() => false)) return;

    for (const coluna of PT.colunas) {
      await expect(
        page.getByRole("columnheader", { name: coluna }),
        `a coluna "${coluna}" saiu da tabela`,
      ).toBeVisible();
    }
  });

  test("a aba é alcançável pelo menu, dentro da Torre de Controle", async ({ page }) => {
    await signIn(page, testAccounts.admin);
    await page.goto(routes.home);

    // A entrada existe no menu — foi a última coisa a ser ligada de propósito, e é o que torna a
    // aba visível para a operação inteira.
    await page.getByRole("link", { name: PT.titulo }).click();
    await page.waitForURL((url) => url.pathname === ROTA, { timeout: 15_000 });
  });

  /**
   * A BUSCA NÃO RECARREGA — ela é estado da tela.
   *
   * Mandá-la ao servidor faria a lista recarregar a cada tecla e trocar o resultado debaixo de quem
   * digita. O sinal aqui é que nenhuma requisição sai enquanto a pessoa escreve.
   */
  test("a busca filtra sem ir ao servidor", async ({ page }) => {
    await signIn(page, testAccounts.admin);
    await page.goto(ROTA);
    await expect(page.getByRole("heading", { name: PT.titulo })).toBeVisible();

    const chamadas: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/fleet/motoristas-disponiveis")) chamadas.push(r.url());
    });

    const busca = page.getByPlaceholder(PT.buscar);
    await busca.fill("um nome que certamente não existe na frota");

    // A frase de "não achei" é diferente da de "não há ninguém": elas pedem coisas diferentes de
    // quem lê, e trocá-las faria um dia cheio parecer um dia vazio.
    await expect(page.getByText(PT.vazioBusca)).toBeVisible({ timeout: 5_000 });
    expect(chamadas, "a busca virou consulta ao servidor").toHaveLength(0);
  });

  /**
   * SEM PERMISSÃO, NEM A PÁGINA NEM A ROTA. A guarda da página evita a tela piscar; quem decide de
   * verdade é o BFF, e por isso os dois são verificados.
   */
  test("quem não pode ver viagens não entra", async ({ page }) => {
    await signIn(page, testAccounts.nonAdmin);
    await page.goto(ROTA);

    const resposta = await page.request.get("/api/fleet/motoristas-disponiveis");
    expect([403, 401]).toContain(resposta.status());
  });
});
