import { expect, test, type Page } from "@playwright/test";

const SCENARIOS = ["ssh-expuesto", "dmarc-suplantacion", "tienda-sin-headers"] as const;
// Pills prefix the label with sr-only meaning text ("Meaning: Label"), so match the suffix.
const OUTCOME_PILL = /(Permitido|Bloqueado|Detectado|No detectado)$/;

// Records CSP violations and console errors so each test can assert none occurred.
async function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${event.violatedDirective}: ${event.blockedURI}`,
      );
    });
  });
  return async () => {
    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
    );
    return { errors, violations };
  };
}

test("home lists every scenario and sends security headers", async ({ page, request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-security-policy"]).toBeTruthy();
  expect(response.headers()["strict-transport-security"]).toBeTruthy();

  await page.goto("/");
  for (const id of SCENARIOS) {
    await expect(page.locator(`a[href="/escenarios/${id}"]`).first()).toBeVisible();
  }
});

for (const id of SCENARIOS) {
  test(`scenario ${id} simulates without CSP or console errors`, async ({ page }) => {
    const report = await watchErrors(page);
    await page.goto(`/escenarios/${id}`);

    await page.getByRole("button", { name: "Simular", exact: true }).click();

    await expect(page.getByText("Puntaje total")).toBeVisible();
    await expect(page.getByText(OUTCOME_PILL).first()).toBeVisible();
    await expect(page.locator("[data-diagram] svg")).toBeVisible();

    const { errors, violations } = await report();
    expect(errors).toEqual([]);
    expect(violations).toEqual([]);
  });
}

test("dmarc scenario shows domain configuration panel", async ({ page }) => {
  await page.goto("/escenarios/dmarc-suplantacion");
  await expect(page.getByText("Configuración del dominio", { exact: true }).first()).toBeVisible();
});

test("scenario does not overflow horizontally at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/escenarios/ssh-expuesto");
  await page.getByRole("button", { name: "Simular", exact: true }).click();
  await expect(page.getByText("Puntaje total")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(overflow).toBe(true);
});
