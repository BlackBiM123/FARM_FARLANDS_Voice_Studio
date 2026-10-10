import { test, expect } from "@playwright/test";
test("character draft, family links, story fields and voice survive save, reload and export", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"authenticated":true,"user":{"id":"17f6e1e9-9f83-4b73-912a-bcb8359736de","username":"admin","role":"admin"}}',
    }),
  );
  await page.route("**/api/cloud", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"configured":false}',
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Персонажи", exact: true }).click();
  await page
    .getByRole("button", { name: "Создать персонажа", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/characters\/new$/);
  await page.getByLabel("Имя", { exact: true }).fill("Персонаж для проверки");
  await page.getByLabel("Роль", { exact: true }).fill("Фермер");
  await page.getByLabel("Возраст, лет").fill("42");
  await page
    .getByLabel("Поселение", { exact: true })
    .fill("Тестовое поселение");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("farlands-empty-studio-project") ??
            '{"npcs":[]}',
        ).npcs.length,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Характер", exact: true }).click();
  await page
    .getByLabel("Биография", { exact: true })
    .fill("Биография для проверки сохранения.");
  await page.getByLabel("Ключевые черты характера").fill("Добрый, осторожный");
  await page.getByRole("button", { name: "Роль в мире", exact: true }).click();
  await page.getByLabel("Торговля", { exact: true }).check();
  await page
    .getByRole("button", { name: "Добавить занятие", exact: true })
    .click();
  await page.getByLabel("Занятие", { exact: true }).fill("Работает в поле");
  await page
    .getByRole("button", { name: "Семья и связи", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Добавить связь", exact: true })
    .click();
  await page.getByLabel("Тип связи").selectOption("mother");
  await page.getByLabel("Имя связанного персонажа").fill("Мать персонажа");
  await page.getByLabel("Доверие (−100…100)").fill("80");
  await page
    .getByRole("button", { name: "Истории и судьба", exact: true })
    .click();
  await expect(page.getByLabel("Правило старения")).toHaveValue("none");
  await expect(page.getByLabel("Правило смертности")).toHaveValue(
    "rare_events",
  );
  await page.getByLabel("Тайна персонажа").fill("Хранит карту старого пути");
  await page
    .getByRole("button", { name: "Характеристики", exact: true })
    .click();
  await page.getByLabel("Эмпатия", { exact: true }).fill("87");
  await page
    .getByRole("button", { name: "Добавить поле", exact: true })
    .click();
  await page.getByLabel("Название характеристики").fill("Знание фермы");
  await page.getByLabel("Значение", { exact: true }).fill("Эксперт");
  await page.getByRole("button", { name: "Голос", exact: true }).click();
  await page.getByLabel("Голос Gemini").selectOption("Charon");
  await page
    .getByRole("button", { name: "Сохранить персонажа", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#\/characters\/npc_[a-z0-9]+\/edit$/);
  await page.reload();
  await page.getByRole("button", { name: "Характер", exact: true }).click();
  await expect(page.getByLabel("Биография", { exact: true })).toHaveValue(
    "Биография для проверки сохранения.",
  );
  await page
    .getByRole("button", { name: "Семья и связи", exact: true })
    .click();
  await expect(page.getByLabel("Имя связанного персонажа")).toHaveValue(
    "Мать персонажа",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const file = await pending;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream!) chunks.push(c);
  const data = JSON.parse(Buffer.concat(chunks).toString());
  const p = data.npcs[0].profile;
  expect(p.age).toBe(42);
  expect(p.biography).toBe("Биография для проверки сохранения.");
  expect(p.mechanics).toContain("trading");
  expect(p.attributes.empathy).toBe(87);
  expect(p.custom[0].value).toBe("Эксперт");
  expect(p.schedule[0].activity).toBe("Работает в поле");
  expect(data.npcs[0].settings.voice).toBe("Charon");
  await page.screenshot({ path: "../character-editor.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByLabel("Имя", { exact: true }).fill("Несохранённый черновик");
  await page
    .getByRole("button", { name: "Вернуться к персонажам", exact: true })
    .first()
    .click();
  await expect(page.locator(".character-card h3")).toHaveText(
    "Персонаж для проверки",
  );
});
