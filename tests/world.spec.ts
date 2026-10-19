import JSZip from "jszip";
import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
import { createWorld, worldHash } from "../src/world-defaults";
import { checkWorld, type WorldReport } from "../src/world-runs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
test("world editors and the real Godot Web core preserve lore and match headless", async ({
  page,
}) => {
  test.setTimeout(180000);
  const settings = {
    voice: "Kore",
    model: "gemini-3.8-flash-tts",
    emotion: "",
    pace: 1,
    direction: "",
  };
  const project = projectSchema.parse({
    version: 1,
    npcs: [
      ["npc_theo_hartley", "Тео Хартли"],
      ["npc_start_farm_martin_001", "Мартин Вейл"],
      ["npc_start_tavern_gideon_002", "Гидеон Брукс"],
    ].map(([id, name]) => ({
      id,
      name,
      role: "",
      text: "",
      settings,
      profile: { biography: "Утверждённый лор" },
    })),
  });
  const world = createWorld(project.npcs);
  project.world = world;
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
  await page.route("**/*", async (r) => {
    if (r.request().resourceType() === "document") {
      const response = await r.fetch();
      await r.fulfill({
        response,
        headers: {
          ...response.headers(),
          "Content-Security-Policy": JSON.parse(
            readFileSync("vercel.json", "utf8"),
          ).headers[0].headers.find(
            (h: any) => h.key === "Content-Security-Policy",
          ).value,
        },
      });
    } else await r.fallback();
  });
  const logs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") logs.push(m.text());
  });
  page.on("pageerror", (e) => logs.push(e.message));
  await page.goto("/world");
  await expect(
    page.getByRole("heading", { name: "Логический мир" }),
  ).toBeVisible();
  await expect(page.locator(".world-map-node")).toHaveCount(12);
  const marker = page.locator(".world-map-node circle").first(),
    box = await marker.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 20,
    box!.y + box!.height / 2 + 10,
  );
  await page.mouse.up();
  await page
    .getByLabel("Название", { exact: true })
    .fill("Лес · изменённый черновик");
  await page.getByRole("button", { name: /Сохранить мир/ }).click();
  await page.reload();
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(
    "Лес · изменённый черновик",
  );
  const zipDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Пакет мира для Godot", exact: true })
    .click();
  const zFile = await zipDownload,
    zStream = await zFile.createReadStream(),
    zChunks: Buffer[] = [];
  for await (const c of zStream!) zChunks.push(c);
  const zip = await JSZip.loadAsync(Buffer.concat(zChunks));
  expect(
    await zip.file("addons/farlands_world/world_core.gd")!.async("string"),
  ).toContain("farlands-core-1");
  expect(
    JSON.parse(await zip.file("world/definition.json")!.async("string"))
      .places[0].name,
  ).toBe("Лес · изменённый черновик");

  await page.getByRole("button", { name: "Экономика", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Экономика мира" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Симуляция", exact: true }).click();
  await expect(page.getByText("Godot готов", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.locator(".needs-panel summary").click();
  const initialEnergy = page.getByRole("spinbutton", {
    name: "Энергия",
    exact: true,
  });
  await initialEnergy.fill("80");
  await initialEnergy.press("Tab");
  await page.getByRole("button", { name: /Сохранить мир/ }).click();
  await page.reload();
  await expect(page.getByText("Godot готов", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.locator(".needs-panel summary").click();
  await expect(initialEnergy).toHaveValue("80");
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await expect(
    page
      .locator(".needs-levels")
      .getByRole("meter", { name: "Энергия 80%", exact: true }),
  ).toBeVisible();
  await initialEnergy.fill("70");
  await initialEnergy.press("Tab");
  await expect(page.locator(".needs-pending")).toBeVisible();
  await expect(
    page
      .locator(".needs-levels")
      .getByRole("meter", { name: "Энергия 80%", exact: true }),
  ).toBeVisible();
  const needsDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Отчёт JSON", exact: true }).click();
  const needsStream = await (await needsDownload).createReadStream(),
    needsChunks: Buffer[] = [];
  for await (const chunk of needsStream!) needsChunks.push(chunk);
  const needsReport = JSON.parse(Buffer.concat(needsChunks).toString());
  expect(needsReport.definition.needs.initialEnergy).toBe(800);
  expect(
    Object.values(needsReport.state.agents).every((a: any) => a.energy === 800),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Вернуть базовые правила в черновик",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /Сохранить мир/ }).click();
  await page.locator(".needs-panel summary").click();
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await expect(page.getByText("Баланс сходится", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "7 дней", exact: true }).click();
  await page
    .getByRole("button", { name: "Остановить прогон", exact: true })
    .click();
  await expect(
    page.getByText(
      "Прогон остановлен. Последнее рассчитанное состояние сохранено локально.",
      { exact: true },
    ),
  ).toBeVisible();
  const cancelledDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Отчёт JSON", exact: true }).click();
  const cancelledStream = await (await cancelledDownload).createReadStream(),
    cancelledChunks: Buffer[] = [];
  for await (const chunk of cancelledStream!) cancelledChunks.push(chunk);
  const checkpoint = JSON.parse(
    Buffer.concat(cancelledChunks).toString(),
  ) as WorldReport;
  expect(checkpoint.state.minute).toBeGreaterThan(360);
  expect(checkpoint.state.minute).toBeLessThan(10440);
  expect(checkWorld(checkpoint)).toEqual([]);
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await page.getByRole("button", { name: "7 дней", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 8 · 06:00",
    { timeout: 120000 },
  );
  await expect(page.locator(".world-run-controls strong").first()).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText("Баланс сходится", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Отчёт JSON", exact: true }).click();
  const file = await download,
    stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString()) as WorldReport;
  expect(checkWorld(report)).toEqual([]);
  expect(
    (report.archive ?? report.state.events).some((e) => e.type === "house"),
  ).toBe(true);
  expect(
    (report.archive ?? report.state.events).some((e) => e.type === "social"),
  ).toBe(true);
  expect(
    (report.archive ?? report.state.events).some((e) => e.type === "delivery"),
  ).toBe(true);
  expect(report.contentHash).toBe(await worldHash(report.definition));
  if (process.env.GODOT) {
    const temp = mkdtempSync(join(tmpdir(), "farlands-core-"));
    try {
      writeFileSync(
        join(temp, "world.json"),
        JSON.stringify(report.definition),
      );
      const run = spawnSync(
        process.env.GODOT,
        [
          "--headless",
          "--path",
          resolve("simulation"),
          "--script",
          "run.gd",
          "--",
          join(temp, "world.json"),
          join(temp, "report.json"),
          "10080",
          report.contentHash,
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(run.status, run.stdout + run.stderr).toBe(0);
      const native = JSON.parse(
        readFileSync(join(temp, "report.json"), "utf8"),
      );
      expect(native.state).toEqual(report.state);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }

  await page.getByRole("button", { name: "Час", exact: true }).click();
  const restore = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Восстановить файл", exact: true })
    .click();
  await (
    await restore
  ).setFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(report)),
  });
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 8 · 06:00",
  );
  await expect(page.getByLabel("Наблюдать", { exact: true })).toHaveValue(
    "npc_theo_hartley",
  );
  const boundary = structuredClone(report);
  boundary.state.minute = 43530;
  const boundaryFile = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Восстановить файл", exact: true })
    .click();
  await (
    await boundaryFile
  ).setFiles({
    name: "boundary.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(boundary)),
  });
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 31 · 05:30",
  );
  await page.getByRole("button", { name: "7 дней", exact: true }).click();
  await page.waitForTimeout(300);
  expect(await page.locator(".world-error").allTextContents()).toEqual([]);
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 31 · 06:00",
  );
  await expect(
    page.getByText(
      "Достигнут предел запуска: 30 дней. Сохраните отчёт или создайте новый запуск.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Час", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Пуск", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    const original = indexedDB.open.bind(indexedDB);
    (window as any).restoreWorldStorage = () =>
      Object.defineProperty(indexedDB, "open", {
        value: original,
        configurable: true,
      });
    Object.defineProperty(indexedDB, "open", {
      value: () => {
        throw new Error("Storage blocked for test");
      },
      configurable: true,
    });
  });
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await expect(
    page.getByText(
      "Локальное сохранение недоступно. Скачайте отчёт JSON или сохраните снимок в облако.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "7 дней", exact: true }).click();
  await expect(
    page.getByText(
      "Прогон остановлен. Скачайте отчёт JSON: локальное сохранение не подтверждено.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Прогон остановлен. Последнее рассчитанное состояние сохранено локально.",
      { exact: true },
    ),
  ).not.toBeVisible();
  await page.evaluate(() => (window as any).restoreWorldStorage());
  await page.getByRole("button", { name: "Час", exact: true }).click();
  await expect(
    page.getByText("Контрольная точка сохранена на этом устройстве.", {
      exact: true,
    }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("farlands-empty-studio-project")!),
  );
  expect(stored.npcs).toEqual(project.npcs);
  await page.screenshot({ path: "../world-simulation-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "../world-simulation-mobile.png" });
  await page.goto("/world");
  await page
    .locator("summary")
    .filter({ hasText: "Участники и начальные привязки" })
    .click();
  await page
    .getByRole("button", {
      name: "Отключить от симуляции Мартин Вейл",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator("summary")
      .filter({ hasText: "Участники и начальные привязки" }),
  ).toHaveText(/2/);
  const afterDetach = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("farlands-empty-studio-project")!),
  );
  expect(afterDetach.npcs).toEqual(project.npcs);
  expect(afterDetach.world.agents).toHaveLength(3);
  expect(
    logs.filter(
      (x) =>
        !x.includes("AudioContext") &&
        !x.includes("favicon") &&
        !x.includes("WebSocket") &&
        !x.includes("[vite]") &&
        !x.includes("Vite server"),
    ),
  ).toEqual([]);
});
