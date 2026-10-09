import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
test("cloud project and audio survive a clean browser and stale edits cannot overwrite newer data", async ({
  page,
  browser,
}) => {
  let revision = 0,
    project = {
      version: 1,
      npcs: [] as Record<string, unknown>[],
      gameCharacter: true,
    };
  const records = new Map<string, Record<string, unknown>>(),
    files = new Map<string, Buffer>(),
    deleted = new Set<string>();
  let audioReads = 0;
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
  async function routes(p: Page) {
    await p.route("**/api/session", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"authenticated":true}',
      }),
    );
    await p.route("**/api/tts", (r) =>
      r.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
    );
    await p.route("**/api/audio?*", async (r) => {
      const id = new URL(r.request().url()).searchParams.get("id")!;
      if (r.request().method() === "PUT") {
        files.set(id, r.request().postDataBuffer()!);
        await r.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"uploaded":true}',
        });
      } else {
        audioReads++;
        await r.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: files.get(id)!,
        });
      }
    });
    await p.route("**/api/cloud", async (r) => {
      const method = r.request().method();
      let data: unknown = { saved: true },
        status = 200;
      if (method === "GET")
        data = {
          configured: true,
          project,
          revision,
          takes: [...records.values()].filter(
            (x) => !deleted.has(x.id as string),
          ),
          deletedIds: [...deleted],
          storedBytes: [...files.values()].reduce(
            (sum, b) => sum + b.length,
            0,
          ),
        };
      else {
        const body = r.request().postDataJSON();
        if (method === "PUT") {
          if (body.revision !== revision) {
            status = 409;
            data = { error: "Проект изменился на другом устройстве" };
          } else {
            project = body.project;
            revision++;
            data = { revision };
          }
        } else if (method === "POST") records.set(body.id, body);
        else if (method === "PATCH")
          records.get(body.id)!.favorite = body.favorite;
        else if (method === "DELETE") deleted.add(body.id);
      }
      await r.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
  }
  await routes(page);
  await page.goto("/");
  await expect(page.locator(".cloud-status")).toContainText(
    "Синхронизировано с облаком",
  );
  await page
    .getByRole("button", { name: "Добавить персонажа", exact: true })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Облачный NPC");
  await page.getByLabel("Текст реплики").fill("Облачная реплика");
  await expect.poll(() => project.npcs[0]?.name).toBe("Облачный NPC");
  await page.getByRole("button", { name: "Создать дубль" }).click();
  await expect.poll(() => records.size).toBe(1);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Дубль сохранён в облаке и в браузере" }),
  ).toBeVisible();
  const clean = await browser.newContext();
  const second = await clean.newPage();
  await routes(second);
  await second.goto("http://127.0.0.1:5173/");
  await expect(
    second.getByRole("heading", { name: "Облачный NPC", exact: true }),
  ).toBeVisible();
  await expect(second.locator(".take")).toHaveCount(1);
  expect(audioReads).toBe(0);
  const download = second.waitForEvent("download");
  await second.getByRole("button", { name: "Экспорт в Godot" }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const audio = Object.keys(zip.files).find((x) => x.endsWith(".wav"))!;
  expect(await zip.file(audio)!.async("nodebuffer")).toEqual(wav);
  expect(audioReads).toBe(1);
  revision++;
  project.npcs[0]!.name = "Изменено на другом устройстве";
  await second.getByRole("button", { name: "Редактировать персонажа" }).click();
  await second.getByLabel("Имя", { exact: true }).fill("Локальные изменения");
  await expect(second.locator(".cloud-status")).toContainText(
    "Проект изменился на другом устройстве",
  );
  expect(project.npcs[0]!.name).toBe("Изменено на другом устройстве");
  await expect(second.getByLabel("Имя", { exact: true })).toHaveValue(
    "Локальные изменения",
  );
  await second
    .getByRole("button", { name: "Загрузить облачную версию" })
    .click();
  await expect(
    second.getByRole("heading", {
      name: "Изменено на другом устройстве",
      exact: true,
    }),
  ).toBeVisible();
  await clean.close();
});
