import { test, expect } from "@playwright/test";
test("family tree, portrait, kinship and persisted draft", async ({ page }) => {
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
  await page.goto("/#/characters/new");
  await page.getByLabel("Имя", { exact: true }).fill("Анна");
  await page.getByLabel("Фото персонажа").setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#e6ae50";
        ctx.fillRect(0, 0, 32, 32);
        return c.toDataURL("image/png").split(",")[1]!;
      }),
      "base64",
    ),
  });
  await expect(page.locator(".photo-editor img")).toBeVisible();
  await page
    .getByLabel("Изображение в полный рост", { exact: true })
    .setInputFiles({
      name: "full.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        (await page.locator(".photo-editor img").getAttribute("src"))!.split(
          ",",
        )[1]!,
        "base64",
      ),
    });
  await expect(page.locator(".full-image-editor img")).toBeVisible();
  await page
    .getByRole("button", { name: "Сохранить персонажа", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole("button", { name: "Персонажи", exact: true }).click();
  await page
    .getByRole("button", { name: "Создать персонажа", exact: true })
    .click();
  await expect(page.getByLabel("Имя", { exact: true })).toHaveValue("");
  await page.getByLabel("Имя", { exact: true }).fill("Борис");
  await page
    .getByRole("button", { name: "Сохранить персонажа", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole("button", { name: "Семьи", exact: true }).click();
  await page.getByRole("button", { name: "Создать семью" }).click();
  await page.getByLabel("Название семьи").fill("Семья для проверки");
  await page.getByLabel("Анна", { exact: true }).check();
  await page.getByLabel("Борис", { exact: true }).check();
  const ids = await page
    .getByLabel("Первый участник")
    .locator("option")
    .evaluateAll((options) =>
      options.map((o) => (o as HTMLOptionElement).value),
    );
  await page.getByLabel("Первый участник").selectOption(ids[1]!);
  await page.getByLabel("Второй участник").selectOption(ids[2]!);
  await page
    .getByRole("button", { name: "Добавить связь", exact: true })
    .click();
  await expect(page.locator(".tree-person")).toHaveCount(2);
  await expect(page.locator(".tree-person img")).toHaveCount(1);
  await page.getByLabel("Кто", { exact: true }).selectOption(ids[1]!);
  await page.getByLabel("Кому", { exact: true }).selectOption(ids[2]!);
  await expect(page.locator(".family-compare strong")).toHaveText("Родитель");
  await page
    .getByRole("button", { name: "Сохранить семью", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Семья для проверки · 2" }).click();
  await expect(page.locator(".tree-person")).toHaveCount(2);
  await page.screenshot({ path: "../family-tree-preview.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".tree-viewport")).toBeVisible();
});
