import { test, expect } from "@playwright/test";
import { projectSchema } from "../shared/schema";
test("event time windows and fact-confirmed outcomes survive editing; preview does not change profiles", async ({
  page,
}) => {
  const scenarioId = "33a1765e-741f-43c7-bf15-b1b47e564047",
    outcomeId = "44a1765e-741f-43c7-bf15-b1b47e564047";
  const npc = (id: string, name: string) => ({
    id,
    name,
    role: "",
    text: "",
    settings: {
      voice: "Charon",
      model: "gemini-3.8-flash-tts",
      emotion: "",
      pace: 1,
      direction: "",
    },
    profile: {
      relationships:
        id === "oswald"
          ? [{ otherId: "nora", otherName: "Нора", trust: 70 }]
          : [],
    },
  });
  let project = projectSchema.parse({
    version: 1,
    npcs: [npc("oswald", "Освальд"), npc("nora", "Нора")],
    scenarioGuidelines: "Рабочие правила",
    scenarios: [
      {
        id: scenarioId,
        key: "test_walk",
        title: "Обещанная прогулка",
        kind: "conflict",
        initiatorId: "oswald",
        targets: ["nora"],
        mechanics: { windowDaysMin: 3, windowDaysMax: 5 },
        outcomes: [
          {
            id: outcomeId,
            key: "g",
            label: "Г. Примирение",
            requiredFacts: ["promise_made"],
          },
        ],
        facts: [
          { key: "promise_made", label: "Обещание дано" },
          { key: "walk_done", label: "Прогулка состоялась" },
        ],
        effects: [
          {
            id: "55a1765e-741f-43c7-bf15-b1b47e564047",
            fromId: "oswald",
            toId: "nora",
            metric: "trust",
            delta: 6,
            outcomeIds: [outcomeId],
            requiredFacts: ["walk_done"],
          },
        ],
        obligations: [
          {
            id: "66a1765e-741f-43c7-bf15-b1b47e564047",
            key: "walk_promise",
            title: "Организовать прогулку",
            fromId: "oswald",
            toId: "nora",
            createdByOutcomeId: outcomeId,
            fulfilledFact: "walk_done",
          },
        ],
      },
    ],
  });
  let revision = 1;
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        authenticated: true,
        user: { id: "test", username: "admin", role: "admin" },
      },
    }),
  );
  await page.route("**/api/cloud", (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({
        json: {
          configured: true,
          project,
          revision,
          takes: [],
          deletedIds: [],
          storedBytes: 0,
        },
      });
    project = projectSchema.parse(r.request().postDataJSON().project);
    revision++;
    return r.fulfill({ json: { revision } });
  });
  await page.goto("/#/stories/" + scenarioId);
  await page.getByLabel("Окно актуальности: минимум дней").fill("7");
  await page.getByLabel("Окно актуальности: максимум дней").fill("10");
  await expect
    .poll(() => project.scenarios[0]?.mechanics.windowDaysMax)
    .toBe(10);
  await page
    .getByText("Проверить последствия исхода · без изменения анкет", {
      exact: true,
    })
    .click();
  await page.getByLabel("Исход для проверки").selectOption(outcomeId);
  await page.getByLabel("Обещание дано", { exact: true }).check();
  await page
    .getByRole("button", { name: "Подтвердить в проверке", exact: true })
    .click();
  await expect(page.locator(".preview-mechanics")).toContainText(
    "применено 0, ждут подтверждения фактов 1",
  );
  await page.getByLabel("Прогулка состоялась", { exact: true }).check();
  await page
    .getByRole("button", { name: "Подтвердить в проверке", exact: true })
    .click();
  await expect(page.locator(".preview-mechanics")).toContainText("применено 1");
  await page
    .getByRole("button", { name: "Подтвердить в проверке", exact: true })
    .click();
  await expect(page.locator(".preview-mechanics")).toContainText("применено 0");
  await expect(page.locator(".preview-mechanics")).toContainText(
    "1 применённых последствий",
  );
  expect(project.npcs[0]!.profile.relationships[0]!.trust).toBe(70);
  await page.reload();
  await expect(page.getByLabel("Окно актуальности: максимум дней")).toHaveValue(
    "10",
  );
  await expect(page.getByLabel("Факт выполнения")).toHaveValue("walk_done");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
