import { test, expect, type Page } from "@playwright/test";
import { testAccounts, routes } from "./test-config";

/**
 * O CARTÃO DE SPOT NÃO PODE ATRAPALHAR QUEM ESTÁ TRABALHANDO (FR-003, fatia 030).
 *
 * Este é o teste que o requisito exigia para não ser só afirmação. O cartão parou de sair sozinho em
 * trinta segundos — ele fica na tela até alguém decidir —, e o pedido do usuário foi explícito:
 * "que não atrapalhe se alguém tiver atribuindo".
 *
 * Havia ali um `boxShadow: 0 0 0 9999px`, que escurecia a tela inteira por trás. Com trinta segundos
 * era ênfase; parado, seria o TMS apagado o dia todo. Ele saiu, e a camada continua transparente ao
 * mouse — só os cartões recebem clique.
 *
 * ── A ASSERÇÃO COMEÇA CONFERINDO QUE HÁ CARTÃO, e isso não é zelo ────────────────────────────
 *
 * Um teste que digitasse num campo SEM cartão nenhum na tela passaria sempre, e não provaria nada —
 * é o modo clássico de um teste verde não significar coisa alguma. A primeira asserção existe para
 * que a falha diga "o ensaio não subiu" em vez de "está tudo bem".
 *
 * ── E ELE USA O ENSAIO, que não gasta ────────────────────────────────────────────────────────
 *
 * O cartão é disparado pelo botão de ensaio, que inventa uma oferta no navegador e não grava nada.
 * Aceitar é IRREVERSÍVEL no portal do cliente — nenhum teste desta base pode chegar perto disso, e
 * a oferta de ensaio nasce sem viagem justamente para não haver a quem endereçar uma ordem.
 */

async function entrar(page: Page, conta: { email: string; password: string }): Promise<void> {
  await page.goto(routes.login);
  await page.getByLabel(/e-?mail/i).fill(conta.email);
  await page.getByLabel(/senha/i).fill(conta.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(routes.login), { timeout: 15_000 });
}

/** Sobe um cartão pela mesma porta do botão de ensaio, sem depender de haver leilão aberto. */
async function subirCartaoDeEnsaio(page: Page, estado = "esperando"): Promise<void> {
  await page.evaluate((qual) => {
    const agora = Date.now();
    window.dispatchEvent(
      new CustomEvent("tms:ensaio-de-oferta", {
        detail: {
          id: `ensaio-${agora}`,
          portalTripId: `ensaio-${agora}`,
          tripNumber: "TESTE",
          route: "ENSAIO DE AVISO  ->  ignore este cartão",
          vehicle: "teste",
          price: "R$ 0,00",
          originArrival: null,
          departure: null,
          arrival: null,
          operator: "e2e",
          receivedAt: new Date(agora).toISOString(),
          estado: qual,
          tripId: null,
          podeAceitar: qual === "esperando",
          decidiuNome: null,
          erroDoPortal: null,
        },
      }),
    );
  }, estado);
}

const CARTAO = "[data-oferta]";

test.describe("FR-003 — a camada do spot não bloqueia a tela", () => {
  test("dá para digitar e enviar com o cartão na tela", async ({ page }) => {
    await entrar(page, testAccounts.admin);
    await page.goto(routes.home);

    await subirCartaoDeEnsaio(page);

    // PRIMEIRO: provar que há cartão. Sem isto o resto passaria com a tela vazia.
    await expect(page.locator(CARTAO).first()).toBeVisible();

    /*
      O que está ATRÁS continua alcançável: um campo de busca do painel recebe foco pelo teclado,
      aceita texto e responde. Se a camada roubasse o clique ou o foco, isto falharia.
    */
    const busca = page.getByRole("searchbox").or(page.getByRole("textbox")).first();
    await busca.click();
    await busca.fill("LT0Q9202F7Q21");
    await expect(busca).toHaveValue("LT0Q9202F7Q21");
    await expect(busca).toBeFocused();

    // E o cartão continua lá — digitar atrás dele não o dispensa.
    await expect(page.locator(CARTAO).first()).toBeVisible();
  });

  test("o cartão não sai sozinho depois de trinta segundos", async ({ page }) => {
    test.setTimeout(90_000);
    await entrar(page, testAccounts.admin);
    await page.goto(routes.home);

    await subirCartaoDeEnsaio(page);
    await expect(page.locator(CARTAO).first()).toBeVisible();

    /*
      TRINTA E CINCO SEGUNDOS: o prazo antigo era trinta, e passar dele é o que prova que ele morreu.
      É o teste mais lento desta fatia, e o único jeito de provar uma AUSÊNCIA de temporizador pelo
      comportamento — o guarda de código que também existe prova pela forma, e os dois se completam.
    */
    await page.waitForTimeout(35_000);
    await expect(page.locator(CARTAO).first()).toBeVisible();
  });

  test("aceitar pede dois gestos", async ({ page }) => {
    await entrar(page, testAccounts.admin);
    await page.goto(routes.home);

    await subirCartaoDeEnsaio(page);
    const cartao = page.locator(CARTAO).first();
    await expect(cartao).toBeVisible();

    // O primeiro clique NÃO envia: ele abre a pergunta com o número da LH escrito.
    await cartao.getByRole("button", { name: /^aceitar$/i }).click();
    await expect(cartao.getByText(/não tem volta/i)).toBeVisible();
    await expect(cartao.getByRole("button", { name: /confirmar aceite/i })).toBeVisible();

    // E dá para voltar atrás sem efeito nenhum.
    await cartao.getByRole("button", { name: /voltar/i }).click();
    await expect(cartao.getByRole("button", { name: /^aceitar$/i })).toBeVisible();
  });
});
