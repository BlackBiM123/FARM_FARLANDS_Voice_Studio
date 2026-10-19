import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
import { createWorld } from "../src/world-defaults";
test("isolated experiments run, replay, persist, export, compare and cancel without author writes", async ({
  page,
}) => {
  test.setTimeout(120000);
  const p = projectSchema.parse({
    version: 1,
    npcs: [
      "npc_theo_hartley",
      "npc_start_farm_martin_001",
      "npc_start_tavern_gideon_002",
    ].map((id, i) => ({
      id,
      name: ["Тео", "Мартин", "Гидеон"][i],
      role: "",
      text: "",
      settings: {
        voice: "Kore",
        model: "gemini-3.8-flash-tts",
        emotion: "",
        pace: 1,
        direction: "",
      },
    })),
  });
  p.world = createWorld(p.npcs);
  const writes: string[] = [],
    errors: string[] = [];
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
  await page.addInitScript((p) => {
    if (!localStorage.getItem("farlands-empty-studio-project"))
      localStorage.setItem("farlands-empty-studio-project", JSON.stringify(p));
  }, p);
  page.on("request", (r) => {
    if (
      r.url().includes("/api/") &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method())
    )
      writes.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/experiments");
  await page
    .getByText("Ядро проверок готово", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByLabel("Название", { exact: true }).fill("День · контроль");
  await page
    .getByRole("button", { name: "Сохранить сценарий", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Запустить проверку", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "День · контроль", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".lab-check[data-status=fail]")).toHaveCount(0);
  await expect(page.locator(".lab-check[data-status=pass]")).toHaveCount(5);
  async function download() {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Экспорт отчёта и полного журнала",
        exact: true,
      })
      .click();
    const stream = await (await pending).createReadStream(),
      chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c);
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  const first = await download();
  await page
    .locator(".lab-report")
    .screenshot({ path: "../experiments-desktop.png" });
  expect(first.report.state.minute).toBe(1800);
  expect(first.report.archive.length).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole("button", { name: "3 · Отчёты", exact: true }).click();
  await page
    .locator(".lab-saved button")
    .filter({ hasText: "День · контроль" })
    .first()
    .click();
  await expect(page.locator(".lab-check[data-status=pass]")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Повторить / изменить условия", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill("Закрытые дороги");
  await page.getByLabel("Условия", { exact: true }).selectOption("closed");
  await page
    .getByText("Ядро проверок готово", { exact: true })
    .waitFor({ timeout: 60000 });
  await page
    .getByRole("button", { name: "Запустить проверку", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Закрытые дороги", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".lab-check[data-status=fail]")).toHaveCount(0);
  await expect(page.locator(".lab-check[data-status=skip]")).toHaveCount(1);
  const second = await download();
  expect(second.report.definition.routes.every((r: any) => !r.open)).toBe(true);
  await page
    .getByRole("button", { name: "4 · Сравнение", exact: true })
    .click();
  await page.getByLabel("Первый прогон").selectOption(first.id);
  await page.getByLabel("Второй прогон").selectOption(second.id);
  await expect(page.getByText("Есть различия", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "../experiments-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "1 · Настройка", exact: true })
    .click();
  await page.getByRole("button", { name: "Месяц", exact: true }).click();
  await page
    .getByRole("button", { name: "Запустить проверку", exact: true })
    .click();
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Продолжить", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Остановить и сохранить частичный результат",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Частичный результат/)).toBeVisible();
  expect((await download()).status).toBe("cancelled");
  async function upload(value: unknown) {
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Импорт отчёта", exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: "experiment.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  }
  const invalid = structuredClone(first);
  invalid.experiment.world.seed += 1;
  await upload(invalid);
  await expect(page.getByRole("alert")).toContainText("Импорт отклонён");
  expect((await download()).status).toBe("cancelled");
  const imported = structuredClone(first);
  imported.id = "imported-test";
  await upload(imported);
  await expect(page.getByText(/Отчёт импортирован/)).toBeVisible();
  expect(
    (await download()).checks.find((c: any) => c.id === "restore").status,
  ).toBe("skip");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("farlands-empty-studio-project")!),
    ),
  ).toEqual(p);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
