import { test, expect } from "vitest";
import { projectSchema } from "../shared/schema.js";
import { scenarioSchema, dialogueLineSchema } from "../shared/content.js";
import { removeCharacter } from "../shared/remove-character.js";
test("deletion cleans graph references, keeps scenario source and unrelated characters", () => {
  const a = "npc_a",
    b = "npc_b",
    sid = "a3a1765e-741f-43c7-bf15-b1b47e564047",
    gid = "a3a1765e-741f-43c7-bf15-b1b47e564048";
  const npc = (id: string) => ({
    id,
    name: id,
    role: "",
    text: "",
    settings: {
      voice: "Kore",
      model: "gemini-3.8-flash-tts",
      emotion: "",
      pace: 1,
      direction: "",
    },
  });
  const p = projectSchema.parse({
    version: 1,
    npcs: [npc(a), npc(b)],
    dialogueGroups: [{ id: gid, name: "Группа" }],
    scenarios: [
      scenarioSchema.parse({
        id: sid,
        title: "Событие",
        kind: "interaction",
        initiatorId: a,
        targets: [b],
        sourceText: "Исходная история",
      }),
    ],
    dialogueLines: [
      dialogueLineSchema.parse({
        id: "a3a1765e-741f-43c7-bf15-b1b47e564049",
        key: "a_line",
        npcId: a,
        groupId: gid,
      }),
      dialogueLineSchema.parse({
        id: "a3a1765e-741f-43c7-bf15-b1b47e564050",
        key: "b_line",
        npcId: b,
        groupId: gid,
        recipientId: a,
      }),
    ],
  });
  const next = projectSchema.parse(removeCharacter(p, a));
  expect(next.npcs.map((n) => n.id)).toEqual([b]);
  expect(next.dialogueLines).toHaveLength(1);
  expect(next.dialogueLines[0]!.recipientId).toBeNull();
  expect(next.scenarios[0]!.initiatorId).toBeNull();
  expect(next.scenarios[0]!.sourceText).toBe("Исходная история");
  expect(p.npcs).toHaveLength(2);
});
