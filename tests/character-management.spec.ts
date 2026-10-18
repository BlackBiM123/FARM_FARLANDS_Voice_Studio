import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
const id = "npc_delete_me";
test("clean links, portrait replacement and typed-name deletion preserve unrelated data", async ({
  page,
}) => {
  const p = projectSchema.parse({
    version: 1,
    npcs: [
      {
        id,
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
      },
      {
        id: "npc_keep",
        name: "Иван Тестов",
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
          relationships: [{ otherId: id, otherName: "Анна Тестова" }],
        },
      },
    ],
    families: [
      {
        id: "a3a1765e-741f-43c7-bf15-b1b47e564047",
        name: "Семья Тестовых",
        home: "",
        description: "",
        members: [id, "npc_keep"],
        links: [
          {
            id: "a3a1765e-741f-43c7-bf15-b1b47e564048",
            from: id,
            to: "npc_keep",
            kind: "parent",
          },
        ],
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
  await page.addInitScript((p) => {
    if (!localStorage.getItem("farlands-empty-studio-project"))
      localStorage.setItem("farlands-empty-studio-project", JSON.stringify(p));
  }, p);
  await page.goto("/characters/" + id + "/edit");
  await expect(page.getByLabel("Имя", { exact: true })).toHaveValue(
    "Анна Тестова",
  );
  await page.reload();
  await expect(page.getByLabel("Имя", { exact: true })).toHaveValue(
    "Анна Тестова",
  );
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Заменить портрет", exact: true })
    .click();
  const file = await chooser;
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 4;
    return c.toDataURL().split(",")[1]!;
  });
  await file.setFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".portrait-upload-button img")).toBeVisible();
  await page
    .getByRole("button", { name: "Сохранить персонажа", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Вернуться к персонажам", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/characters$/);
  await page.goBack();
  await expect(page.getByLabel("Имя", { exact: true })).toHaveValue(
    "Анна Тестова",
  );
  await page.goForward();
  const row = page.getByRole("link", { name: "Открыть персонажа Анна Тестова", exact: true });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/characters\/npc_delete_me\/edit$/);
  await page.goBack();
  await row.click();
  await expect(page).toHaveURL(/\/characters\/npc_delete_me\/edit$/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Открыть голос", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Редактировать", exact: true })).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Удалить Анна Тестова", exact: true })
    .click();
  await expect(page).toHaveURL(/\/characters$/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Введите имя и фамилию полностью").fill("Анна");
  await expect(
    dialog.getByRole("button", { name: "Удалить персонажа", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Анна Тестова", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Удалить Анна Тестова", exact: true })
    .click();
  await dialog
    .getByLabel("Введите имя и фамилию полностью")
    .fill("Анна Тестова");
  await dialog
    .getByRole("button", { name: "Удалить персонажа", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Анна Тестова", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Иван Тестов", exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("farlands-empty-studio-project")!),
  );
  expect(stored.npcs).toHaveLength(1);
  expect(stored.npcs[0].profile.relationships[0].otherId).toBe("");
  expect(stored.families[0].members).toEqual(["npc_keep"]);
  expect(stored.families[0].links).toEqual([]);
});
