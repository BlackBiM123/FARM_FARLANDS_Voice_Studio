import { test, expect } from "@playwright/test";
import JSZip from "jszip";
test("quota response shows local countdown and persists limits without external navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Добавить персонажа", exact: true })
    .click();
  await page.getByLabel("Текст реплики").fill("Тест");
  await page.getByRole("button", { name: "Создать дубль" }).click();
  await page.getByLabel("Код доступа", { exact: true }).fill("test-only-token");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.route("**/api/tts", (r) =>
    r.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Квота исчерпана",
        quota: {
          retryAfterSeconds: 30,
          limits: [{ period: "day", kind: "requests", limit: 10 }],
        },
      }),
    }),
  );
  await page.getByRole("button", { name: "Создать дубль" }).click();
  await expect(page.locator(".quota-alert")).toContainText(
    "Google рекомендует повторить через",
  );
  await expect(
    page.getByRole("button", { name: "Создать дубль" }),
  ).toBeDisabled();
  await page.getByText("Настроить лимиты проекта", { exact: true }).click();
  await expect(page.getByLabel("Запросов в день (RPD)")).toHaveValue("10");
  await page.reload();
  await expect(page.locator(".quota-alert")).toBeVisible();
  await expect(page.locator(".quota-panel a")).toHaveCount(0);
  await page.screenshot({
    path: "../../outputs/voice-studio-limits.png",
    fullPage: true,
  });
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api/session", async (route) => {
    const method = route.request().method();
    if (method === "POST")
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Set-Cookie":
            "farlands_session=test-cookie; HttpOnly; Path=/api; Max-Age=2592000; SameSite=Strict",
        },
        body: JSON.stringify({ authenticated: true }),
      });
    else
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: (route.request().headers()["cookie"] ?? "").includes(
            "farlands_session=test-cookie",
          ),
        }),
      });
  });
});
test("casting, persistence, generation, comparison and Godot export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Начните с персонажа", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../voice-studio-preview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Кастинг озвучки", exact: true })
    .click();
  await expect(page.locator(".cast-row")).toHaveCount(0);
  await page.screenshot({ path: "../../work/casting.png", fullPage: true });
  await page.getByRole("button", { name: "Персонаж", exact: true }).click();
  await page.getByLabel("Имя", { exact: true }).fill("Тестовый NPC");
  await page.getByLabel("Роль", { exact: true }).fill("Тестовая роль");
  await page.getByLabel("Голос Gemini").selectOption("Charon");
  await page.getByLabel("Текст реплики").fill("Проверка голоса");
  await expect(page.getByLabel("Голос Gemini")).toHaveValue("Charon");
  await page.getByLabel("Эмоция и настроение").fill("Холодная решимость");
  await page.reload();
  await page.locator(".npc-row").filter({ hasText: "Тестовый NPC" }).click();
  await expect(page.getByLabel("Эмоция и настроение")).toHaveValue(
    "Холодная решимость",
  );
  await page.getByRole("button", { name: "Создать дубль" }).click();
  await page.getByLabel("Код доступа", { exact: true }).fill("test-only-token");
  await page.getByRole("button", { name: "Продолжить" }).click();
  const wav = Buffer.alloc(4844);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  await page.route("**/api/tts", (r) =>
    r.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
  );
  await page.getByRole("button", { name: "Создать дубль" }).click();
  await expect(page.locator(".take")).toHaveCount(1);
  await page.getByRole("button", { name: "Создать дубль" }).click();
  await expect(page.locator(".take")).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Сравнить" }).nth(0).check();
  await page.getByRole("checkbox", { name: "Сравнить" }).nth(1).check();
  await expect(page.locator(".compare audio")).toHaveCount(2);
  await page.getByRole("button", { name: "Закрыть сравнение" }).click();
  await page.getByRole("button", { name: "Выбрать дубль" }).first().click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт в Godot" }).click();
  const file = await pending;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const manifest = JSON.parse(
    await zip.file("voice/manifest.json")!.async("string"),
  );
  expect(manifest.takes).toHaveLength(2);
  expect(manifest.takes.some((t: { favorite: boolean }) => t.favorite)).toBe(
    true,
  );
  expect(Object.keys(zip.files).filter((x) => x.endsWith(".wav"))).toHaveLength(
    2,
  );
  expect(manifest.takes[0].audio).toMatch(/^res:\/\/voice\/audio\//);
  await page.reload();
  await page.locator(".npc-row").filter({ hasText: "Тестовый NPC" }).click();
  await expect(page.locator(".take")).toHaveCount(2);
  await page.getByRole("button", { name: "Доступ к API" }).click();
  await expect(
    page.getByText("Вход уже сохранён", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Удалить дубль" }).first().click();
  await expect(page.locator(".take")).toHaveCount(1);
  await page.screenshot({ path: "../../work/studio.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("mobile layout fits viewport and missing access is handled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Добавить персонажа", exact: true })
    .click();
  await page.getByLabel("Текст реплики").fill("Тест");
  await page.getByRole("button", { name: "Создать дубль" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: "../../work/mobile.png", fullPage: true });
});
