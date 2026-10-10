import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { projectSchema, type TakeMetadata } from "../shared/schema";
function wav() {
  const b = Buffer.alloc(44 + 4800);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(4800, 40);
  return b;
}
test("bilingual dialogue, audio reuse, drag groups, conflicts and clean-browser cloud restore", async ({
  page,
  browser,
}) => {
  let project = projectSchema.parse({
    version: 1,
    npcs: [
      {
        id: "martin",
        name: "Мартин Вейл",
        role: "Фермер",
        text: "",
        settings: {
          voice: "Charon",
          model: "gemini-3.8-flash-tts",
          emotion: "Спокойно",
          pace: 1,
          direction: "Тёплый персонаж игры",
        },
      },
      {
        id: "leo",
        name: "Лео Вейл",
        role: "Сын фермера",
        text: "",
        settings: {
          voice: "Puck",
          model: "gemini-3.8-flash-tts",
          emotion: "Бодро",
          pace: 1,
          direction: "",
        },
      },
    ],
  });
  let revision = 1;
  const records = new Map<string, TakeMetadata>(),
    files = new Map<string, Buffer>(),
    generated: Record<string, unknown>[] = [];
  async function routes(p: Page) {
    await p.route("**/api/session", (r) =>
      r.fulfill({
        json: {
          authenticated: true,
          user: { id: "test-admin", username: "admin", role: "admin" },
        },
      }),
    );
    await p.route("**/api/cloud", async (r) => {
      const method = r.request().method();
      if (method === "GET")
        return r.fulfill({
          json: {
            configured: true,
            project,
            revision,
            takes: [...records.values()],
            deletedIds: [],
            storedBytes: [...files.values()].reduce((s, b) => s + b.length, 0),
          },
        });
      const body = r.request().postDataJSON();
      if (method === "PUT") {
        if (body.revision !== revision)
          return r.fulfill({ status: 409, json: { error: "Stale revision" } });
        project = projectSchema.parse(body.project);
        revision++;
        return r.fulfill({ json: { revision } });
      }
      if (method === "POST") records.set(body.id, body);
      return r.fulfill({ json: { saved: true } });
    });
    await p.route("**/api/audio?**", (r) => {
      const id = new URL(r.request().url()).searchParams.get("id")!;
      if (r.request().method() === "PUT") {
        files.set(id, r.request().postDataBuffer()!);
        return r.fulfill({ json: { uploaded: true } });
      }
      return r.fulfill({ contentType: "audio/wav", body: files.get(id)! });
    });
    await p.route("**/api/tts", (r) => {
      generated.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "audio/wav", body: wav() });
    });
  }
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await routes(page);
  await page.goto("/");
  await expect(page.locator(".cloud-status")).toContainText(
    "Синхронизировано с облаком",
  );
  await page
    .getByRole("button", { name: "События и конфликты", exact: true })
    .click();
  await page.getByRole("button", { name: "Конфликт", exact: true }).click();
  await page.getByLabel("Название сценария").fill("Ферма или путешествие");
  await page.getByLabel("Лео Вейл", { exact: true }).check();
  await page
    .getByLabel("Причина / столкновение интересов")
    .fill("Лео хочет уйти в путешествие, Мартину нужна помощь на ферме.");
  await page
    .getByLabel("Событие-триггер")
    .fill("Лео объявляет о своём решении.");
  await page
    .getByLabel("Влияние игрока / варианты вмешательства")
    .fill("Помочь договориться об отъезде после сбора урожая.");
  await page
    .getByRole("button", { name: "Добавить последствие", exact: true })
    .click();
  await page.getByLabel("Изменение", { exact: true }).fill("-15");
  await page
    .getByRole("button", { name: "Реплика инициатора", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/dialogue\//);
  const row = page.locator(".dialogue-table tbody tr").first();
  await row.locator(".line-ru textarea").fill("Поговорим после сбора урожая.");
  await row.locator(".line-en textarea").fill("Let us talk after the harvest.");
  await row.getByRole("button", { name: "Озвучить RU", exact: true }).click();
  await expect(row.locator(".line-ru audio")).toHaveCount(1);
  await row.locator(".line-en input[type=file]").setInputFiles({
    name: "english.wav",
    mimeType: "audio/wav",
    buffer: wav(),
  });
  await expect(row.locator(".line-en audio")).toHaveCount(1);
  expect(generated).toHaveLength(1);
  expect(generated[0]!.text).toBe("Поговорим после сбора урожая.");
  expect(generated[0]!.language).toBe("ru");
  expect(records.size).toBe(2);
  await row.locator(".line-ru textarea").fill("Изменённый текст.");
  await expect(row.locator(".line-ru")).toContainText("Текст изменился");
  await row.locator(".line-ru textarea").fill("Поговорим после сбора урожая.");
  await row.getByRole("button", { name: "Копировать", exact: true }).click();
  await expect(page.locator(".line-ru audio")).toHaveCount(2);
  expect(records.size).toBe(2);
  await page.getByText("Свои группы · 1", { exact: true }).click();
  await page.getByLabel("Название новой группы").fill("После урожая");
  await page
    .getByRole("button", { name: "Добавить группу", exact: true })
    .click();
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page
    .locator(".dialogue-section")
    .first()
    .getByRole("button", { name: "Перетащить реплику", exact: true })
    .first()
    .dragTo(page.locator(".group-drop-target").last());
  await expect(
    page.locator(".dialogue-section").last().locator(".line-ru audio"),
  ).toHaveCount(1);
  await expect.poll(() => project.dialogueLines.length).toBe(2);
  await page
    .getByRole("button", { name: "События и конфликты", exact: true })
    .click();
  await page.locator(".story-board-scroll").scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Перетащить сценарий", exact: true })
    .dragTo(page.locator(".story-column").nth(1).locator("h3"));
  await expect(page.locator(".story-column").nth(1)).toContainText(
    "Ферма или путешествие",
  );
  await expect.poll(() => project.scenarios[0]?.state).toBe("active");
  expect(project.scenarios[0]!.effects[0]!.delta).toBe(-15);
  expect(project.scenarios[0]!.targets).toEqual(["leo"]);
  const context = await browser.newContext(),
    fresh = await context.newPage();
  await routes(fresh);
  await fresh.goto("/#/dialogue");
  await expect(fresh.locator(".line-ru audio")).toHaveCount(2);
  await expect(fresh.locator(".line-en audio")).toHaveCount(2);
  expect(records.size).toBe(2);
  const pending = fresh.waitForEvent("download");
  await fresh
    .getByRole("button", { name: "Экспорт в Godot", exact: true })
    .click();
  const file = await pending,
    stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks)),
    manifest = JSON.parse(
      await zip.file("voice/manifest.json")!.async("string"),
    );
  expect(manifest.dialogue_lines).toHaveLength(2);
  expect(manifest.scenarios[0].effects[0].delta).toBe(-15);
  expect(manifest.dialogue_lines[0].ru.audio).toMatch(
    /^res:\/\/voice\/audio\//,
  );
  expect(manifest.dialogue_lines[0].ru.needs_rerecord).toBe(false);
  expect(manifest.dialogue_lines[0].en.audio).toMatch(
    /^res:\/\/voice\/audio\//,
  );
  expect(Object.keys(zip.files).filter((k) => k.endsWith(".wav"))).toHaveLength(
    2,
  );
  await fresh.setViewportSize({ width: 390, height: 844 });
  expect(
    await fresh.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await fresh
    .getByRole("button", { name: "События и конфликты", exact: true })
    .click();
  expect(
    await fresh.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await context.close();
  expect(errors).toEqual([]);
});
