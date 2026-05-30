import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { testAccounts, routes } from "./test-config";

/**
 * Feature 004 US1 — Trip Import critical path + endpoint authorization (T040).
 *
 * Authorization is the deterministic core: every import endpoint requires `import_trips`
 * (Admin + Ops Manager only — contracts/permission-matrix.md). No session → 401; an authenticated
 * role lacking the key → 403. The happy path drives the BFF fast path (select customer/template →
 * upload → 202 → batch in `received`); the worker-driven validate→confirm path is covered by the
 * worker integration tests (a separate worker process is required to drain pg-boss).
 */

const IMPORTS = "/api/imports";
const TEMPLATES = "/api/import-templates";
const STATUS_MAPPINGS = "/api/status-mappings";
const SOME_UUID = "00000000-0000-0000-0000-000000000000";

async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto(routes.login);
  await page.getByLabel(/e-?mail/i).fill(account.email);
  await page.getByLabel(/senha/i).fill(account.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(routes.login), { timeout: 15_000 });
}

async function apiLogin(
  request: APIRequestContext,
  account: { email: string; password: string },
): Promise<APIRequestContext> {
  const res = await request.post("/api/auth/sign-in", {
    data: { email: account.email, password: account.password },
  });
  expect(res.ok()).toBeTruthy();
  return request;
}

test.describe("US1 — import endpoint authorization", () => {
  test("no session → 401 on import endpoints", async ({ request }) => {
    expect((await request.get(IMPORTS)).status()).toBe(401);
    expect((await request.get(TEMPLATES)).status()).toBe(401);
    expect((await request.post(IMPORTS, { multipart: { customerId: SOME_UUID } })).status()).toBe(
      401,
    );
  });

  test("a role without import_trips → 403 (Dispatcher, Finance)", async ({ playwright }) => {
    for (const account of [testAccounts.dispatcher, testAccounts.nonAdmin]) {
      const ctx = await playwright.request.newContext();
      await apiLogin(ctx, account);
      expect((await ctx.get(IMPORTS)).status()).toBe(403);
      expect((await ctx.get(TEMPLATES)).status()).toBe(403);
      expect((await ctx.get(`${STATUS_MAPPINGS}?customerId=${SOME_UUID}`)).status()).toBe(403);
      expect((await ctx.post(`${IMPORTS}/${SOME_UUID}/confirm`)).status()).toBe(403);
      await ctx.dispose();
    }
  });

  test("Ops Manager (has import_trips) → 200 on the batch list", async ({ request }) => {
    const ctx = await apiLogin(request, testAccounts.opsManager);
    expect((await ctx.get(IMPORTS)).status()).toBe(200);
  });
});

test.describe("US1 — Trip Import screen + upload fast path", () => {
  test("Ops Manager sees the import nav and the screen renders", async ({ page }) => {
    await signIn(page, testAccounts.opsManager);
    await page.goto("/imports");
    await expect(page.getByRole("heading", { name: /importar viagens/i })).toBeVisible();
  });

  test("upload returns 202 and creates a batch in 'received'", async ({ request }) => {
    const ctx = await apiLogin(request, testAccounts.opsManager);

    // Ensure a customer exists (Ops Manager holds manage_commercial_data).
    const list = await (await ctx.get("/api/master-data/customers")).json();
    let customerId: string | undefined = list.items?.[0]?.id;
    if (!customerId) {
      const created = await ctx.post("/api/master-data/customers", {
        data: { name: "E2E Import Co", customerCode: `E2E-${Date.now()}`, contacts: [] },
      });
      customerId = (await created.json()).item.id;
    }

    // A minimal CSV template for that customer.
    const tplRes = await ctx.post(TEMPLATES, {
      data: {
        customerId,
        name: `E2E Template ${Date.now()}`,
        version: 1,
        fileType: "csv",
        columnMappings: [
          { source: "ext", target: "externalTripId", required: true },
          { source: "orig", target: "originCode" },
          { source: "dest", target: "destinationCode" },
        ],
        parsingRules: {},
        requiredOverrides: [],
      },
    });
    expect(tplRes.status()).toBe(201);
    const templateId = (await tplRes.json()).item.id;

    const csv = "ext,orig,dest\nE2E-1,ORIG,DEST\n";
    const upload = await ctx.post(IMPORTS, {
      multipart: {
        customerId,
        templateId,
        file: { name: "e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv) },
      },
    });
    expect(upload.status()).toBe(202);
    const { id } = await upload.json();
    expect(id).toBeTruthy();

    const detail = await ctx.get(`${IMPORTS}/${id}`);
    expect(detail.status()).toBe(200);
    const { item } = await detail.json();
    expect(["received", "parsing", "validating", "validated"]).toContain(item.status);
  });
});
