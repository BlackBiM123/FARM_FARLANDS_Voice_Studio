import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
import { guideChapters } from "../src/guide";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        authenticated: true,
        user: { id: "admin", username: "admin", role: "admin" },
      },
    }),
  );
  await page.route("**/api/cloud", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  await page.addInitScript(
    (p) => {
      if (!localStorage.getItem("farlands-empty-studio-project"))
        localStorage.setItem(
          "farlands-empty-studio-project",
          JSON.stringify(p),
        );
    },
    projectSchema.parse({ version: 1, npcs: [] }),
  );
});
test("guide chapters, search, deep links, history and original contract work without project writes", async ({
  page,
}) => {
  const errors: string[] = [],
    writes: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      r.url().includes("/api/") &&
      ["PUT", "POST", "PATCH", "DELETE"].includes(r.method())
    )
      writes.push(r.url());
  });
  await page.goto("/guide");
  await expect(
    page.getByRole("heading", { name: "Руководство по Studio", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Руководство", exact: true }),
  ).toHaveClass(/chosen/);
  const before = await page.evaluate(() =>
    localStorage.getItem("farlands-empty-studio-project"),
  );
  for (const c of guideChapters) {
    await page
      .locator(".guide-contents a")
      .filter({ hasText: c.title })
      .click();
    await expect(page.locator(".guide-article > h2")).toHaveText(c.title);
    await expect(page.locator(".guide-section")).toHaveCount(c.sections.length);
  }
  await page
    .locator(".guide-contents a")
    .filter({ hasText: "Контракт расширения — понятным языком" })
    .click();
  await page.locator(".guide-source summary").click();
  await expect(page.locator(".guide-source pre")).toContainText(
    "definition_error",
  );
  await expect(page.locator(".guide-source pre")).toContainText(
    "simulation/mechanics.gd",
  );
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать контракт .md", exact: true })
    .click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe("farm-farlands-mechanics-contract.md");
  const stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  expect(Buffer.concat(chunks).toString()).toContain(
    "Контракт подключаемых механик v1",
  );
  await page
    .getByRole("searchbox", { name: "Поиск по руководству", exact: true })
    .fill("неполный журнал");
  await expect(page.locator(".guide-result").first()).toBeVisible();
  await page.locator(".guide-result").first().click();
  await expect(page).toHaveURL(/chapter=troubleshooting&section=restore/);
  await expect(page.locator("#guide-section-restore")).toHaveClass(
    /guide-target/,
  );
  await page.goBack();
  await expect(page.locator(".guide-article > h2")).toHaveText(
    "Контракт расширения — понятным языком",
  );
  await page.goForward();
  await page.reload();
  await expect(page.locator("#guide-section-restore")).toHaveClass(
    /guide-target/,
  );
  await page
    .getByRole("searchbox", { name: "Поиск по руководству", exact: true })
    .fill("абракадабра987");
  await expect(
    page.getByText(/По этому запросу ничего не найдено/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Очистить поиск по руководству", exact: true })
    .click();
  await expect(page.locator(".guide-article > h2")).toHaveText(
    "Если что-то не работает",
  );
  expect(page.frames()).toHaveLength(1);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("farlands-empty-studio-project"),
    ),
  ).toBe(before);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "../guide-desktop.png", fullPage: false });
});
test("guide reads on a phone, handles unknown chapters and links into the service", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide?chapter=mechanics&section=example-math");
  await expect(page.locator("#guide-section-example-math")).toHaveClass(
    /guide-target/,
  );
  await expect(page.locator(".guide-contents")).not.toHaveAttribute("open", "");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "../guide-mobile.png", fullPage: false });
  await page.goto("/guide?chapter=missing");
  await expect(
    page.getByRole("heading", { name: "Глава не найдена", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Открыть начало руководства", exact: true })
    .click();
  await expect(page.locator(".guide-article > h2")).toHaveText("Начните здесь");
  await page
    .locator(".guide-links")
    .getByRole("link", { name: "Персонажи", exact: true })
    .click();
  await expect(page).toHaveURL(/\/characters$/);
  await expect(
    page.getByRole("heading", { name: "Персонажи игры", exact: true }),
  ).toBeVisible();
});
