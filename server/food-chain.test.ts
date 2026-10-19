import { describe, it, expect } from "vitest";
import { prepareFoodChain, foodDiagnostics } from "../src/food-chain.js";
import { createWorld } from "../src/world-defaults.js";
import { worldSchema } from "../shared/world.js";
describe("food chain", () => {
  it("prepares empty kitchen stocks without changing resources, geography or agents", () => {
    const original = createWorld([]),
      w = prepareFoodChain(original);
    expect(w.places).toEqual(original.places);
    expect(w.routes).toEqual(original.routes);
    expect(w.agents).toEqual(original.agents);
    expect(w.accounts).toEqual(original.accounts);
    expect(w.stocks.filter((s) => s.item !== "cooked_meal")).toEqual(
      original.stocks,
    );
    expect(w.stocks.find((s) => s.item === "cooked_meal")?.amount).toBe(0);
    expect(prepareFoodChain(w)).toEqual(w);
    expect(original.cooking).toBeUndefined();
  });
  it("rejects an enabled kitchen without matching recipe/stock links", () => {
    const w = prepareFoodChain(createWorld([]));
    expect(
      worldSchema.safeParse({
        ...w,
        cooking: { ...w.cooking, input: "potato" },
      }).success,
    ).toBe(false);
    expect(
      worldSchema.safeParse({
        ...w,
        stocks: w.stocks.filter((s) => s.item !== "cooked_meal"),
      }).success,
    ).toBe(false);
  });
  it("reports actual stocks and zero demand when fullness never drains", () => {
    const w = prepareFoodChain(createWorld([]));
    const s: any = {
      agents: {},
      stocks: { kitchen_cooked_meal: 7 },
      accounts: {},
      produced: { cooked_meal: 12 },
      consumed: { cooked_meal: 5 },
    };
    const stats = foodDiagnostics(w, s);
    expect(stats.ready).toBe(7);
    expect(stats.produced).toBe(12);
    expect(stats.eaten).toBe(5);
    expect(stats.portionsPerDay).toBe(0);
    expect(stats.cooks).toBe(0);
  });
});
