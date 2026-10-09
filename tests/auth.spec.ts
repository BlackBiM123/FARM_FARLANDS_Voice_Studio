import { test, expect } from "@playwright/test";
test("password gate hides the studio, then administrator can add and disable users", async ({
  page,
}) => {
  let logged = false;
  const users = [
    {
      id: "17f6e1e9-9f83-4b73-912a-bcb8359736de",
      username: "admin",
      name: "Admin",
      role: "admin",
      enabled: true,
    },
  ];
  await page.route("**/api/session", async (r) => {
    if (r.request().method() === "POST") {
      const body = r.request().postDataJSON();
      if (body.username === "admin" && body.password === "test-master-password")
        logged = true;
      else {
        await r.fulfill({
          status: 401,
          contentType: "application/json",
          body: '{"error":"Неверный логин или пароль"}',
        });
        return;
      }
    } else if (r.request().method() === "DELETE") logged = false;
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: logged,
        user: logged ? users[0] : undefined,
      }),
    });
  });
  await page.route("**/api/cloud", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"configured":false}',
    }),
  );
  await page.route("**/api/users", async (r) => {
    const method = r.request().method();
    if (method === "POST") {
      const body = r.request().postDataJSON();
      users.push({
        id: "c9e1f793-7c6a-47e8-b11a-eed7b9abb72c",
        username: body.username,
        name: body.name,
        role: body.role,
        enabled: true,
      });
    } else if (method === "PATCH") {
      const body = r.request().postDataJSON();
      Object.assign(
        users.find((u) => u.id === body.id)!,
        body,
      );
    }
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ users }),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Создать дубль" })).toHaveCount(
    0,
  );
  await expect(page.locator(".studio")).toHaveCount(0);
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Неверный логин");
  await page.getByLabel("Пароль", { exact: true }).fill("test-master-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Начните с персонажа" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Пользователи", exact: true }).click();
  await page.getByLabel("Логин нового пользователя").fill("voice_artist");
  await page
    .getByLabel("Пароль нового пользователя")
    .fill("strong-test-password");
  await page
    .getByRole("button", { name: "Добавить пользователя", exact: true })
    .click();
  const artist = page
    .locator(".account-row")
    .filter({ hasText: "voice_artist" });
  await expect(artist).toBeVisible();
  await artist.getByRole("button", { name: "Отключить", exact: true }).click();
  await expect(artist).toContainText("Отключён");
  await expect(
    page
      .locator(".account-row")
      .filter({ hasText: "admin" })
      .getByRole("button", { name: "Отключить", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "admin", exact: true }).click();
  await page.getByRole("button", { name: "Выйти из студии" }).click();
  await expect(page.locator(".login-card")).toBeVisible();
  await expect(page.locator(".studio")).toHaveCount(0);
  await page.screenshot({ path: "../voice-studio-login.png", fullPage: true });
});
test("regular user has no user-management interface and mobile login fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/session", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"authenticated":true,"user":{"id":"17f6e1e9-9f83-4b73-912a-bcb8359736de","username":"artist","role":"user"}}',
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
  await expect(
    page.getByRole("heading", { name: "Начните с персонажа" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Пользователи", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
