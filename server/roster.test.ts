import { it, expect } from "vitest";
import { projectSchema } from "../shared/schema.js";
import { createWorld } from "../src/world-defaults.js";
import { prepareRoster } from "../src/world-roster.js";
it("prepares participants without rewriting profiles or approving guessed economics", () => {
  const project = projectSchema.parse({
    version: 1,
    npcs: [
      {
        id: "npc_theo_hartley",
        name: "Тео",
        role: "Конюх",
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
        id: "child_test",
        name: "Ребёнок",
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
          age: 8,
          lifeStage: "child",
          home: "Семейный дом",
          profession: "Школьник",
        },
      },
    ],
  });
  const before = structuredClone(project),
    world = createWorld(project.npcs);
  world.agents[0]!.wage = 123;
  const result = prepareRoster(world, project.npcs);
  expect(project).toEqual(before);
  expect(result.agents).toHaveLength(2);
  expect(result.agents[0]!.wage).toBe(123);
  expect(result.agents[1]).toMatchObject({
    role: "resident",
    wage: 0,
    setupStatus: "test",
    sourceProfession: "Школьник",
    sourceHome: "Семейный дом",
  });
  expect(prepareRoster(result, project.npcs)).toEqual(result);
  expect(world.agents).toHaveLength(1);
});
