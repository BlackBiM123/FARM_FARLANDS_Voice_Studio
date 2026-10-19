import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
import { createWorld } from "../src/world-defaults";
import { checkWorld } from "../src/world-runs";
test("kitchen consumes delivered ingredients and preserves the author project", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = projectSchema.parse({
    version: 1,
    npcs: [
      ["npc_theo_hartley", "Тео"],
      ["npc_start_farm_martin_001", "Мартин"],
      ["npc_start_tavern_gideon_002", "Гидеон"],
    ].map(([id, name]) => ({
      id,
      name,
      role: "",
      text: "",
      settings: {
        voice: "Kore",
        model: "gemini-3.8-flash-tts",
        emotion: "",
        pace: 1,
        direction: "",
      },
      profile: { biography: "Авторская анкета" },
    })),
  });
  project.world = createWorld(project.npcs);
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
  }, project);
  await page.goto("/economy");
  await page
    .getByRole("button", { name: "Производство и жильё", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Подготовить цепочку приготовления еды",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Порций в партии", exact: true }),
  ).toHaveValue("4");
  await page.getByRole("button", { name: /Сохранить мир/ }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("farlands-empty-studio-project")!),
  );
  expect(stored.npcs).toEqual(project.npcs);
  expect(stored.world.places).toEqual(project.world.places);
  expect(stored.world.accounts).toEqual(project.world.accounts);
  expect(
    stored.world.stocks.find((s: any) => s.item === "cooked_meal").amount,
  ).toBe(0);
  await page.getByRole("button", { name: "Симуляция", exact: true }).click();
  await expect(page.getByText("Godot готов", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await page.getByRole("button", { name: "7 дней", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 8 · 06:00",
    { timeout: 60000 },
  );
  await page.locator(".food-chain summary").click();
  await expect(page.getByText(/На кухне:/)).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Отчёт JSON", exact: true }).click();
  const stream = await (await pending).createReadStream(),
    chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const report = JSON.parse(Buffer.concat(chunks).toString());
  expect(report.definition.cooking.enabled).toBe(true);
  expect(report.state.produced.cooked_meal).toBeGreaterThan(0);
  expect(report.state.consumed.cooked_meal).toBeGreaterThan(0);
  expect(report.state.consumed.potato ?? 0).toBe(0);
  expect(checkWorld(report)).toEqual([]);
  expect(report.archive.some((e: any) => e.type === "cooking")).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
