import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
test("schedule has narrow time controls and multiline fields grow, shrink and resize", async ({
  page,
}) => {
  const biography = Array.from(
    { length: 24 },
    (_, i) => "Строка " + i + ": длинное описание персонажа и его истории.",
  ).join("\n");
  const project = projectSchema.parse({
    version: 1,
    npcs: [
      {
        id: "npc_layout",
        name: "Анна Тестова",
        role: "",
        text: "",
        settings: {
          voice: "Kore",
          model: "gemini-3.8-flash-tts",
          emotion: "",
          pace: 1,
          direction: "",
        },
        profile: {
          biography,
          schedule: Array.from({ length: 8 }, () => ({
            day: "daily",
            start: "08:00",
            end: "09:30",
            place: "Дом",
            activity: "Завтрак и домашние дела",
          })),
        },
      },
    ],
  });
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
    project,
  );
  await page.goto("/characters/npc_layout/edit");
  await page.getByRole("button", { name: "Характер", exact: true }).click();
  const field = page.getByLabel("Биография", { exact: true });
  await expect(field).toHaveValue(biography);
  await expect
    .poll(() => field.evaluate((e) => e.scrollHeight - e.clientHeight))
    .toBeLessThanOrEqual(1);
  const full = (await field.boundingBox())!.height;
  expect(full).toBeGreaterThan(300);
  await field.fill("Короткая биография.");
  await expect
    .poll(async () => (await field.boundingBox())!.height)
    .toBeLessThan(100);
  await field.fill(biography);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => field.evaluate((e) => e.scrollHeight - e.clientHeight))
    .toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Роль в мире", exact: true }).click();
  await expect(page.locator(".schedule-row")).toHaveCount(8);
  const time = page.locator(".schedule-row input[type=time]").first();
  expect((await time.boundingBox())!.width).toBeLessThanOrEqual(94);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect
    .poll(
      async () =>
        (await page.locator(".schedule-row").first().boundingBox())!.height,
    )
    .toBeLessThan(135);
});
