import { describe, it, expect } from "vitest";
import { projectSchema } from "../shared/schema.js";
import {
  dialogueLineSchema,
  scenarioSchema,
  moveLine,
} from "../shared/content.js";
const group = "33a1765e-741f-43c7-bf15-b1b47e564047",
  scenario = "44a1765e-741f-43c7-bf15-b1b47e564047",
  lineId = "55a1765e-741f-43c7-bf15-b1b47e564047";
const npc = {
  id: "martin",
  name: "Martin",
  role: "Farmer",
  text: "",
  settings: {
    voice: "Charon",
    model: "gemini-3.8-flash-tts",
    emotion: "Calm",
    pace: 1,
    direction: "",
  },
};
const line = dialogueLineSchema.parse({
  id: lineId,
  key: "greeting_001",
  npcId: "martin",
  groupId: group,
  scenarioId: scenario,
});
const event = scenarioSchema.parse({
  id: scenario,
  title: "Conflict",
  kind: "conflict",
  initiatorId: "martin",
});
const project = {
  version: 1,
  npcs: [npc],
  dialogueGroups: [{ id: group, name: "Greetings" }],
  dialogueLines: [line],
  scenarios: [event],
};
describe("dialogue and story integrity", () => {
  it("migrates old projects with empty new collections", () => {
    const old = projectSchema.parse({ version: 1, npcs: [npc] });
    expect(old.dialogueLines).toEqual([]);
    expect(old.scenarios).toEqual([]);
    expect(old.dialogueGroups).toEqual([]);
  });
  it("rejects dangling references, repeated keys and repeated participants", () => {
    expect(projectSchema.safeParse(project).success).toBe(true);
    for (const invalid of [
      { ...project, scenarios: [] },
      { ...project, dialogueGroups: [] },
      { ...project, dialogueLines: [{ ...line, npcId: "missing" }] },
      {
        ...project,
        dialogueLines: [line, { ...line, id: crypto.randomUUID() }],
      },
      { ...project, scenarios: [{ ...event, targets: ["martin"] }] },
      {
        ...project,
        scenarios: [
          {
            ...event,
            effects: [
              {
                id: crypto.randomUUID(),
                fromId: "missing",
                toId: "martin",
                metric: "trust",
                delta: -10,
              },
            ],
          },
        ],
      },
    ])
      expect(projectSchema.safeParse(invalid).success).toBe(false);
  });
  it("moves a line across groups without changing localization or audio binding", () => {
    const a = {
        ...line,
        ru: { text: "Привет", takeId: "66a1765e-741f-43c7-bf15-b1b47e564047" },
      },
      b = { ...line, id: crypto.randomUUID(), key: "b" };
    const result = moveLine(
      [a, b],
      a.id,
      "77a1765e-741f-43c7-bf15-b1b47e564047",
    );
    expect(result.map((l) => l.id)).toEqual([b.id, a.id]);
    expect(result[1]!.ru).toEqual(a.ru);
    expect(a.groupId).toBe(group);
    expect(moveLine([a, b], b.id, group, a.id).map((l) => l.id)).toEqual([
      b.id,
      a.id,
    ]);
  });
  it("bounds text, relationship effects and unique scenario ids", () => {
    expect(
      dialogueLineSchema.safeParse({ ...line, en: { text: "x".repeat(601) } })
        .success,
    ).toBe(false);
    expect(
      scenarioSchema.safeParse({
        ...event,
        effects: [{ id: crypto.randomUUID(), metric: "trust", delta: -101 }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ ...project, scenarios: [event, event] })
        .success,
    ).toBe(false);
  });
});
