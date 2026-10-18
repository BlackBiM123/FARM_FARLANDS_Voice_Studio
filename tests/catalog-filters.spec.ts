import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
test("catalog combines filters, handles unknown values and sorts without changing project", async ({
  page,
}) => {
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
      {
        id: "anna",
        name: "Анна",
        role: "Фермер",
        text: "",
        settings,
        profile: { age: 20, gender: "female", romanceAvailable: true },
      },
      {
        id: "boris",
        name: "Борис",
        role: "Рыбак",
        text: "",
        settings,
        profile: { age: 45, gender: "male", romanceAvailable: false },
      },
      {
        id: "vera",
        name: "Вера",
        role: "Инженер",
        text: "",
        settings,
        profile: { age: 30, gender: "female", romanceAvailable: true },
      },
      {
        id: "gleb",
        name: "Глеб",
        role: "Путешественник",
        text: "",
        settings,
        profile: { age: null, gender: "male", romanceAvailable: true },
      },
    ],
    families: [
      {
        id: "b9d4a710-a1f3-47af-a83d-ed468cb4f8cc",
        name: "Альфа",
        description: "",
        home: "",
        members: ["boris", "vera"],
        links: [],
      },
      {
        id: "7555a8f3-3d53-416f-8f98-71c32ead87d6",
        name: "Бета",
        description: "",
        home: "",
        members: ["anna"],
        links: [],
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
  await page.goto("/characters");
  const names = page.locator(".character-card h3");
  await expect(names).toHaveText(["Анна", "Борис", "Вера", "Глеб"]);
  const stored = await page.evaluate(() =>
    localStorage.getItem("farlands-empty-studio-project"),
  );
  await page.getByLabel("Сортировка персонажей").selectOption("age");
  await expect(names).toHaveText(["Анна", "Вера", "Борис", "Глеб"]);
  await page
    .getByRole("button", { name: "Сортировка по возрастанию", exact: true })
    .click();
  await expect(names).toHaveText(["Борис", "Вера", "Анна", "Глеб"]);
  await page
    .getByRole("button", { name: "Только с романтической линией", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Женские персонажи", exact: true })
    .click();
  await expect(names).toHaveText(["Вера", "Анна"]);
  await page.getByLabel("Максимальный возраст", { exact: true }).fill("25");
  await expect(names).toHaveText(["Анна"]);
  await page
    .getByLabel("Фильтр по семье")
    .selectOption("b9d4a710-a1f3-47af-a83d-ed468cb4f8cc");
  await expect(names).toHaveCount(0);
  await page
    .getByRole("button", { name: "Сбросить фильтры", exact: true })
    .click();
  await expect(names).toHaveCount(4);
  await page.getByLabel("Сортировка персонажей").selectOption("family");
  await expect(names).toHaveText(["Борис", "Вера", "Анна", "Глеб"]);
  await page.getByLabel("Сортировка персонажей").selectOption("gender");
  await expect(names).toHaveText(["Борис", "Глеб", "Анна", "Вера"]);
  await page.getByLabel("Включать без возраста").uncheck();
  await expect(names).toHaveCount(3);
  await page.getByLabel("Фильтр по семье").selectOption("none");
  await expect(names).toHaveCount(0);
  await page.getByLabel("Включать без возраста").check();
  await expect(names).toHaveText(["Глеб"]);
  await page
    .getByRole("button", { name: "Сбросить фильтры", exact: true })
    .click();
  await page.getByLabel("Минимальный возраст", { exact: true }).fill("70");
  await page.getByLabel("Максимальный возраст", { exact: true }).fill("10");
  await expect(
    page.getByLabel("Максимальный возраст", { exact: true }),
  ).toHaveValue("70");
  await page
    .getByRole("button", { name: "Сбросить фильтры", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("farlands-empty-studio-project"),
    ),
  ).toBe(stored);
});
