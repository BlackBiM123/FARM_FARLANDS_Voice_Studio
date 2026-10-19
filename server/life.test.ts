import { describe, it, expect } from "vitest";
import { worldSchema } from "../shared/world.js";
import { createWorld } from "../src/world-defaults.js";
import { lifeDefinition, lifeReferenceError } from "../shared/life.js";
import { projectSchema } from "../shared/schema.js";
import { removeCharacter } from "../shared/remove-character.js";
describe("life definition boundaries", () => {
  it("cleans life links when deleting an actor without changing the original project", () => {
    const ids = [
      "npc_theo_hartley",
      "npc_start_farm_martin_001",
      "npc_start_tavern_gideon_002",
    ];
    const p = projectSchema.parse({
      version: 1,
      npcs: ids.map((id) => ({
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
      })),
    });
    p.world = createWorld(p.npcs);
    p.world.life = {
      version: 1,
      enabled: true,
      socialDelta: { affinity: 1, trust: 0, respect: 0, attachment: 0 },
      initialRelations: [
        {
          from: ids[0]!,
          to: ids[1]!,
          scores: { affinity: 10, trust: 0, respect: 0, attachment: 0 },
        },
      ],
      requests: [
        {
          id: "q",
          name: "Request",
          issuer: ids[0]!,
          actor: ids[1]!,
          target: ids[2]!,
          deadlineMinutes: 60,
          priority: 50,
        },
      ],
    };
    const next = removeCharacter(p, ids[1]!);
    expect(projectSchema.safeParse(next).success).toBe(true);
    expect(next.world?.life?.requests).toEqual([]);
    expect(next.world?.life?.initialRelations).toEqual([]);
    expect(p.world.life.requests).toHaveLength(1);
  });
  it("keeps the established world unchanged unless explicitly configured", () => {
    expect(createWorld([]).life).toBeUndefined();
  });
  it("requires distinct known parties for a request", () => {
    const config = lifeDefinition.parse({
      version: 1,
      enabled: false,
      socialDelta: { affinity: 1, trust: 0, respect: 0, attachment: 0 },
      initialRelations: [],
      requests: [
        {
          id: "q",
          name: "Request",
          issuer: "a",
          actor: "b",
          target: "c",
          deadlineMinutes: 60,
          priority: 50,
        },
      ],
    });
    expect(lifeReferenceError(config, ["a", "b", "c"])).toBeUndefined();
    expect(lifeReferenceError(config, ["a", "b"])).toBeTruthy();
    config.requests[0]!.target = "a";
    expect(lifeReferenceError(config, ["a", "b", "c"])).toBeTruthy();
  });
  it("rejects unknown versions and unsafe priorities", () => {
    const w = createWorld([]);
    const config = {
      version: 1,
      enabled: false,
      socialDelta: { affinity: 1, trust: 0, respect: 0, attachment: 0 },
      initialRelations: [],
      requests: [],
    };
    expect(lifeDefinition.safeParse({ ...config, version: 2 }).success).toBe(
      false,
    );
    expect(worldSchema.safeParse({ ...w, life: config }).success).toBe(true);
  });
});
