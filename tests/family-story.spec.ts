import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";

test("family story reading, chapter navigation, mobile and empty family", async ({
  page,
}) => {
  const project = projectSchema.parse({
    version: 1,
    npcs: [],
    families: [
      {
        id: "b3a1765e-741f-43c7-bf15-b1b47e564047",
        name: "Семья Брукс",
        description: "",
        home: "",
        members: [],
        links: [],
        story:
          "Гидеон Брукс — подлинная история\n\nFARM & FARLANDS\n\nГлава I. Таверна\n\nХанна Брукс (Hannah Brooks).\n\nГлава II. Обещание\n\nТаверна «Промис» (Promise).",
      },
      {
        id: "c3a1765e-741f-43c7-bf15-b1b47e564047",
        name: "Семья Вейл",
        description: "",
        home: "",
        members: [],
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
  await page.goto("/#/families");
  await page.getByRole("button", { name: "Семья Брукс · 0" }).click();
  const trigger = page.getByRole("button", { name: "История Семья Брукс" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("navigation")).toBeVisible();
  await expect(dialog.locator("article")).toContainText("Hannah Brooks");
  await dialog.getByRole("button", { name: "Глава II. Обещание" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Глава II. Обещание" }),
  ).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.height).toBeLessThanOrEqual(844);
  await dialog.getByRole("button", { name: "Закрыть историю" }).click();
  await page.getByRole("button", { name: "Семья Вейл · 0" }).click();
  await page.getByRole("button", { name: "История Семья Вейл" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("article")).toHaveCount(0);
  await expect(dialog.getByRole("navigation")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Семья Брукс · 0" }).click();
  await page
    .getByRole("button", { name: "Сохранить семью", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Семья Брукс · 0" }).click();
  await page.getByRole("button", { name: "История Семья Брукс" }).click();
  await expect(dialog.locator("article")).toContainText("Promise");
});

test("family story entries have independent tabs and disclosure notes", async ({page}) => {
  const project = projectSchema.parse({version:1,npcs:[],families:[{
    id:"a3a1765e-741f-43c7-bf15-b1b47e564047",name:"Семья Крейн",description:"",home:"",members:[],links:[],
    story:"История семьи Крейн\n\nОбщая история.",
    storyEntries:[{key:"crane_grain",title:"Последний мешок зерна",text:"История\nЭдмунд помог жителям.",
      initialKnowledge:"unknown",confirmationRule:"Проверить книгу долгов."}],
    storyDiscoveryNotes:"Рассказы раскрываются независимо."
  }]});
  await page.route("**/api/session",r=>r.fulfill({json:{authenticated:true,user:{id:"admin",username:"admin",role:"admin"}}}));
  await page.route("**/api/cloud",r=>r.fulfill({json:{configured:false}}));
  await page.addInitScript(p=>localStorage.setItem("farlands-empty-studio-project",JSON.stringify(p)),project);
  await page.goto("/#/families");
  await page.getByRole("button",{name:"Семья Крейн · 0"}).click();
  await page.getByRole("button",{name:"История Семья Крейн"}).click();
  await page.getByRole("tab",{name:"Последний мешок зерна",exact:true}).click();
  await expect(page.getByRole("tabpanel")).toContainText("Начальное знание игрока: Неизвестен");
  await expect(page.getByRole("tabpanel")).toContainText("Проверить книгу долгов.");
  await page.getByRole("tab",{name:"Раскрытие историй",exact:true}).click();
  await expect(page.getByRole("tabpanel")).toContainText("раскрываются независимо");
  await page.getByRole("tab",{name:"История семьи",exact:true}).click();
  await expect(page.locator("#story-original-panel")).toContainText("Общая история");
});
