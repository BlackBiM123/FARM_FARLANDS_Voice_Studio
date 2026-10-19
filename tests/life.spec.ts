import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
import { createWorld } from "../src/world-defaults";
import { parseReport } from "../src/world-runs";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
test("life consequences are causal, directed, private and survive Web/native restore", async ({
  page,
}) => {
  test.setTimeout(120000);
  const ids = [
    "npc_theo_hartley",
    "npc_start_farm_martin_001",
    "npc_start_tavern_gideon_002",
  ];
  const p = projectSchema.parse({
    version: 1,
    npcs: ids.map((id, i) => ({
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
  for (const a of p.world.agents) {
    a.home = "tavern";
    a.role = "resident";
  }
  p.world.life = {
    version: 1,
    enabled: true,
    socialDelta: { affinity: 1, trust: 2, respect: 0, attachment: 0 },
    initialRelations: [
      {
        from: ids[0]!,
        to: ids[1]!,
        scores: { affinity: 10, trust: 20, respect: 30, attachment: 40 },
      },
    ],
    requests: [
      {
        id: "meet_friend",
        name: "Встреча по просьбе",
        issuer: ids[0]!,
        actor: ids[1]!,
        target: ids[2]!,
        deadlineMinutes: 4320,
        priority: 50,
        stages: [
          {
            id: "meet",
            kind: "conversation",
            with: "target",
            label: "Встреча",
          },
          {
            id: "report",
            kind: "conversation",
            with: "issuer",
            label: "Доклад",
          },
        ],
      },
    ],
  };
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
    (p) =>
      localStorage.setItem("farlands-empty-studio-project", JSON.stringify(p)),
    p,
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/simulation");
  await page
    .getByText("Godot готов", { exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await page.getByRole("button", { name: "День", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 2 · 06:00",
  );
  async function download() {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Отчёт JSON", exact: true }).click();
    const stream = await (await pending).createReadStream(),
      chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c);
    return parseReport(JSON.parse(Buffer.concat(chunks).toString()));
  }
  const saved = await download();
  expect(saved.rulesVersion).toBe(9);
  expect(saved.state.life?.quests.meet_friend?.status).toBe("active");
  expect(saved.state.life?.version).toBe(2);
  expect(saved.state.life?.quests.meet_friend?.cursor).toBe(0);
  expect(
    saved.state.life?.quests.meet_friend?.stages?.map((s) => s.id),
  ).toEqual(["meet", "report"]);
  expect(saved.state.life?.relations[ids[0]!]![ids[1]!]!.affinity).toBe(11);
  expect(saved.state.life?.relations[ids[1]!]![ids[0]!]!.affinity).toBe(1);
  for (const e of saved.archive!.filter((e) => e.type === "life"))
    expect(e.witnesses).toEqual([e.actor]);
  await page.locator(".life-panel>summary").click();
  await page
    .locator(".life-panel details>summary")
    .filter({ hasText: "Просьбы о встрече" })
    .click();
  await page
    .locator(".life-card .life-stage")
    .first()
    .getByRole("button", { name: "Ниже", exact: true })
    .click();
  expect((await download()).definition.life?.requests[0]?.stages?.[0]?.id).toBe(
    "meet",
  );
  await page
    .locator(".life-panel")
    .getByRole("button", { name: "Показать причину", exact: true })
    .first()
    .click();
  await expect(page.locator(".world-journal article")).toHaveCount(1);
  await expect(page.locator(".life-panel")).toContainText("Встреча по просьбе");
  await page.getByRole("button", { name: "День", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 3 · 06:00",
  );
  const straight = await download();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Восстановить файл", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "life.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 2 · 06:00",
  );
  await page.getByRole("button", { name: "День", exact: true }).click();
  await expect(page.locator(".world-run-controls strong").first()).toHaveText(
    "День 3 · 06:00",
  );
  const resumed = await download();
  expect(resumed.state).toEqual(straight.state);
  expect(resumed.archive).toEqual(straight.archive);
  if (process.env.GODOT) {
    const dir = resolve("test-results/life-native");
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
        "2880",
        straight.contentHash,
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const native = JSON.parse(readFileSync(dir + "/report.json", "utf8"));
    expect(native.state).toEqual(resumed.state);
    expect(native.archive).toEqual(resumed.archive);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.locator(".life-panel").screenshot({ path: "../life-mobile.png" });
  expect(errors).toEqual([]);
});
