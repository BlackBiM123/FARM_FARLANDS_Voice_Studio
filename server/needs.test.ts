import { describe, it, expect } from "vitest";
import { needsSchema, needsDefaults } from "../shared/needs.js";
import { worldSchema } from "../shared/world.js";
import { createWorld } from "../src/world-defaults.js";
describe("needs rules", () => {
  it("preserves legacy definitions without changing their hash input", () => {
    const world = createWorld([]);
    expect(worldSchema.parse(world)).not.toHaveProperty("needs");
  });
  it("retains configured rules and rejects invalid rates and priorities", () => {
    const world = createWorld([]);
    expect(worldSchema.parse({ ...world, needs: needsDefaults }).needs).toEqual(
      needsDefaults,
    );
    for (const patch of [
      { energyDrain: -1 },
      { mealGain: 1001 },
      { eatPriority: 0 },
      { restGain: 0 },
      { fullnessDrain: 0.5 },
    ])
      expect(
        needsSchema.safeParse({ ...needsDefaults, ...patch }).success,
      ).toBe(false);
    expect(
      needsSchema.parse({ ...needsDefaults, fullnessDrain: 0 }).fullnessDrain,
    ).toBe(0);
  });
});
