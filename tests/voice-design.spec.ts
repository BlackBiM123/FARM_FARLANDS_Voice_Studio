import { test, expect } from "@playwright/test";
test("custom timbre can be created, selected, saved and restored", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        authenticated: true,
        user: { id: "test", username: "admin", role: "admin" },
      },
    }),
  );
  await page.route("**/api/cloud", (r) =>
    r.fulfill({ json: { configured: false } }),
  );
  const voice = {
    id: "voice_designed-test",
    name: "Девочка 8 лет — любопытная",
    gender: "female",
    description: "A fictional eight-year-old girl speaking native Russian.",
  };
  let created = false;
  await page.route("**/api/voices", (r) => {
    if (r.request().method() === "POST") {
      expect(r.request().postDataJSON().language).toBe("ru-RU");
      created = true;
      return r.fulfill({ status: 201, json: { voice } });
    }
    return r.fulfill({ json: { voices: created ? [voice] : [] } });
  });
  await page.goto("/#/characters/new");
  await page.getByLabel("Имя", { exact: true }).fill("Проба детского тембра");
  await page.getByRole("button", { name: "Голос", exact: true }).click();
  await page
    .getByText("Создать свой тембр · Voice Design", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Создать тембр", exact: true })
    .click();
  await expect(page.getByText("Тембр создан.", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Выбрать для персонажа", exact: true })
    .click();
  await expect(page.getByLabel("Голос Gemini")).toHaveValue(voice.id);
  await page
    .getByRole("button", { name: "Сохранить персонажа", exact: true })
    .first()
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Голос", exact: true }).click();
  await expect(page.getByLabel("Голос Gemini")).toHaveValue(voice.id);
  await expect(
    page.getByLabel("Голос Gemini").locator("option:checked"),
  ).toHaveText(voice.name);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByText("Создать свой тембр · Voice Design", { exact: true })
    .click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
