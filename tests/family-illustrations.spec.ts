import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";

test("one illustration per chapter, final chapter stays unillustrated", async ({
  page,
}) => {
  const numerals = [
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
    "XI",
    "XII",
  ];
  const project = projectSchema.parse({
    version: 1,
    npcs: [],
    families: [
      {
        id: "fe4a77f0-47b5-49b5-9773-e0888d7af1c7",
        name: "Семья Брукс",
        description: "",
        home: "",
        members: [],
        links: [],
        story: numerals
          .map((n) => `Глава ${n}. Проверка\n\nТекст главы ${n}.`)
          .join("\n\n"),
        storyIllustrations: numerals
          .slice(0, 11)
          .map((chapter) => ({
            chapter,
            url: "/api/image?id=11111111-1111-4111-8111-111111111111",
            alt: `Иллюстрация главы ${chapter}`,
          })),
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
  await page.route("**/api/image?*", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.addInitScript(
    (p) =>
      localStorage.setItem("farlands-empty-studio-project", JSON.stringify(p)),
    project,
  );
  await page.goto("/#/families");
  await page.getByRole("button", { name: "Семья Брукс · 0" }).click();
  await page.getByRole("button", { name: "История Семья Брукс" }).click();
  const article = page.locator(".family-story-prose");
  await expect(article.locator("img")).toHaveCount(11);
  const sections = article.locator("section");
  for (let i = 0; i < 11; i++) {
    await expect(sections.nth(i).getByRole("img")).toHaveAttribute(
      "alt",
      `Иллюстрация главы ${numerals[i]}`,
    );
  }
  await expect(sections.nth(11).locator("img")).toHaveCount(0);
  await expect(sections.nth(11)).toContainText("Текст главы XII.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.getByRole("dialog").boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.getByRole("tab")).toHaveCount(7);
  await page.getByRole("tab", { name: "Семья 1", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Хозяин сети, убийца жены");
  await page.getByRole("tab", { name: "Семья 6", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Гидеон хотел отказаться; Эвелин настояла");
  await expect(page.getByRole("tabpanel")).toContainText("Этап 6 из 6");
  await page.getByRole("tab", { name: "Исходная история" }).click();
  const image = article.locator("img").first();
  await image.scrollIntoViewIfNeeded();
  const bounds = await image.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
