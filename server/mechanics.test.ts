import { describe, it, expect } from "vitest";
import {
  mechanicsSchema,
  mechanicsSnapshotError,
  type MechanicsState,
} from "../shared/mechanics.js";
import { addMechanic } from "../src/mechanics-editor.js";
import { worldSchema } from "../shared/world.js";
import { createWorld } from "../src/world-defaults.js";
describe("mechanics registry", () => {
  it("keeps examples disabled and independent from the author world", () => {
    const source = createWorld([]),
      r = addMechanic(undefined, true);
    expect(mechanicsSchema.parse(r)).toEqual(r);
    expect(r.modules[0]!.enabled).toBe(false);
    expect(source.mechanics).toBeUndefined();
    expect(worldSchema.parse({ ...source, mechanics: r }).mechanics).toEqual(r);
    const next = addMechanic(r);
    expect(next.modules[1]!.id).not.toBe(r.modules[0]!.id);
    expect(r.modules).toHaveLength(1);
  });
  it("rejects version changes, invalid ranges, missing references and action collisions", () => {
    const r = addMechanic(undefined, true),
      m = r.modules[0]!;
    for (const change of [
      { ...r, version: 2 },
      { ...r, modules: [{ ...m, version: 2 }] },
      { ...r, modules: [{ ...m, id: "core_needs" }] },
      {
        ...r,
        modules: [
          {
            ...m,
            variables: m.variables.map((v) => ({ ...v, initial: v.max + 1 })),
          },
        ],
      },
      {
        ...r,
        modules: [
          {
            ...m,
            actions: m.actions.map((a) => ({ ...a, variable: "unknown" })),
          },
        ],
      },
      {
        ...r,
        modules: [
          { ...m, actions: m.actions.map((a) => ({ ...a, name: "Работа" })) },
        ],
      },
      { ...r, modules: [m, m] },
    ])
      expect(mechanicsSchema.safeParse(change).success).toBe(false);
  });
  it("requires exact owners, versions and bounded values when restoring enabled modules", () => {
    const r = addMechanic(undefined, true);
    r.modules[0]!.enabled = true;
    const m = r.modules[0]!;
    const state: MechanicsState = {
      version: 1,
      versions: { core_needs: 1, [m.id]: 1 },
      values: {
        [m.id + ":test_load"]: { npc1: 20 },
        [m.id + ":test_clock"]: { world: 45 },
      },
      recent: [],
    };
    expect(mechanicsSnapshotError(r, state, ["npc1"])).toBeUndefined();
    expect(
      mechanicsSnapshotError(undefined, undefined, ["npc1"]),
    ).toBeUndefined();
    expect(mechanicsSnapshotError(r, undefined, ["npc1"])).toBeTruthy();
    expect(
      mechanicsSnapshotError(
        r,
        { ...state, versions: { ...state.versions, [m.id]: 2 } },
        ["npc1"],
      ),
    ).toBeTruthy();
    expect(
      mechanicsSnapshotError(r, { ...state, values: {} }, ["npc1"]),
    ).toBeTruthy();
    expect(mechanicsSnapshotError(r, state, ["npc1", "npc2"])).toBeTruthy();
    expect(
      mechanicsSnapshotError(
        r,
        {
          ...state,
          values: { ...state.values, [m.id + ":test_load"]: { npc1: 101 } },
        },
        ["npc1"],
      ),
    ).toBeTruthy();
  });
});
