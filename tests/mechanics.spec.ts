import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectSchema } from "../shared/schema";
import { createWorld } from "../src/world-defaults";
import { parseReport, checkWorld } from "../src/world-runs";
test("module descriptions drive the real core and restore without changing author data", async ({
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
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function download() {
    const p = page.waitForEvent("download");
    await page.getByRole("button", { name: "Отчёт JSON", exact: true }).click();
    const stream = await (await p).createReadStream(),
      chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c);
    return parseReport(JSON.parse(Buffer.concat(chunks).toString()));
  }
  async function restore(value: unknown) {
    const file = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Восстановить файл", exact: true })
      .click();
    await (
      await file
    ).setFiles({
      name: "test.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(value)),
    });
  }
  await page.goto("/simulation");
  await page
    .getByText("Godot готов", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.locator(".mechanics-panel > summary").click();
  await page
    .getByRole("button", { name: "Добавить тестовый модуль", exact: true })
    .click();
  await page.locator(".mechanics-module > summary").click();
  await expect(
    page.getByRole("checkbox", {
      name: "Включить в следующий запуск",
      exact: true,
    }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: "Включить в следующий запуск", exact: true })
    .check();
  await page.getByRole("button", { name: /Сохранить мир/ }).click();
  await page.reload();
  await page
    .getByText("Godot готов", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await page.getByRole("button", { name: "Час", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 1 · 07:00",
  );
  const checkpoint = await download();
  expect(checkpoint.rulesVersion).toBe(9);
  expect(checkpoint.state.mechanics?.values["module_1:test_clock"]?.world).toBe(
    60,
  );
  expect(checkpoint.archive?.some((e) => e.type === "mechanic")).toBe(true);
  expect(checkWorld(checkpoint)).toEqual([]);
  await page.getByRole("button", { name: "Час", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 1 · 08:00",
  );
  const straight = await download();
  await restore(checkpoint);
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 1 · 07:00",
  );
  await page.getByRole("button", { name: "Час", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 1 · 08:00",
  );
  const resumed = await download();
  expect(resumed.state).toEqual(straight.state);
  expect(resumed.archive).toEqual(straight.archive);
  if (process.env.GODOT) {
    const dir = resolve("test-results/mechanics-native");
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "/world.json", JSON.stringify(straight.definition));
    const run = spawnSync(
      process.env.GODOT,
      [
        "--headless",
        "--path",
        resolve("simulation"),
        "--script",
        "run.gd",
        "--",
        dir + "/world.json",
        dir + "/report.json",
        "120",
        straight.contentHash,
      ],
      { encoding: "utf8", timeout: 30000 },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const native = JSON.parse(readFileSync(dir + "/report.json", "utf8"));
    expect(native.state).toEqual(resumed.state);
    expect(native.archive).toEqual(resumed.archive);
  }

  const invalid = structuredClone(straight);
  invalid.state.mechanics!.versions.module_1 = 2;
  await restore(invalid);
  await expect(page.locator(".world-error")).toBeVisible();
  expect((await download()).state).toEqual(straight.state);
  await page.locator(".mechanics-panel > summary").click();
  await page
    .getByRole("button", { name: "Наблюдение и причины", exact: true })
    .click();
  await expect(
    page
      .locator(".mechanics-panel")
      .getByText("Тестовая нагрузка", { exact: false })
      .first(),
  ).toBeVisible();
  await page
    .locator(".mechanics-panel")
    .screenshot({ path: "../mechanics-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .locator(".mechanics-panel")
    .screenshot({ path: "../mechanics-mobile.png" });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("farlands-empty-studio-project")!),
  );
  expect(saved.npcs).toEqual(project.npcs);
  expect(saved.world.places).toEqual(project.world.places);
  expect(saved.world.accounts).toEqual(project.world.accounts);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Описание модулей", exact: true })
    .click();
  await page.locator(".mechanics-module > summary").click();
  await page
    .getByRole("checkbox", { name: "Включить в следующий запуск", exact: true })
    .uncheck();
  // Editing next-run definitions must not silently remove a live module.
  expect((await download()).state.mechanics?.versions.module_1).toBe(1);
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await page.getByRole("button", { name: "Час", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 1 · 07:00",
  );
  const off = await download();
  expect(off.state.mechanics?.versions.module_1).toBeUndefined();
  expect(off.archive?.some((e) => e.type === "mechanic")).toBe(false);
  await restore(checkpoint);
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 1 · 07:00",
  );
  await page.getByRole("button", { name: "Час", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 1 · 08:00",
  );
  const enabledAgain = await download();
  expect(enabledAgain.state).toEqual(straight.state);
  expect(enabledAgain.archive).toEqual(straight.archive);
  expect(errors).toEqual([]);
});
