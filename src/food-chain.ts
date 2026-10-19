import {
  worldSchema,
  type WorldDefinition,
  type WorldState,
} from "../shared/world.js";
import { needsDefaults } from "../shared/needs.js";
export function prepareFoodChain(input: WorldDefinition): WorldDefinition {
  const w = worldSchema.parse(input),
    meal = "cooked_meal";
  if (w.production.output === meal)
    throw Error(
      "Результат фермы уже использует ID блюда; сначала разделите товары.",
    );
  if (!w.items.some((i) => i.id === meal))
    w.items.push({
      id: meal,
      name: "Готовое блюдо · тестовый рецепт",
      price: 3,
      weight: 0.3,
    });
  for (const item of [w.production.output, meal])
    if (
      !w.stocks.some(
        (s) =>
          s.place === "tavern" && s.owner === "inn_business" && s.item === item,
      )
    ) {
      let id = "kitchen_" + item,
        n = 0;
      while (w.stocks.some((s) => s.id === id))
        id = "kitchen_" + item + "_" + ++n;
      w.stocks.push({
        id,
        place: "tavern",
        owner: "inn_business",
        item,
        amount: 0,
      });
    }
  w.cooking = {
    enabled: true,
    input: w.production.output,
    output: meal,
    inputAmount: 1,
    outputAmount: 4,
    minutes: 30,
  };
  return worldSchema.parse(w);
}
export function foodDiagnostics(w: WorldDefinition, s: WorldState) {
  const r = w.cooking?.enabled ? w.cooking : undefined,
    item = r?.output ?? "potato";
  const stock = (id: string) =>
    w.stocks
      .filter(
        (x) =>
          x.place === "tavern" && x.owner === "inn_business" && x.item === id,
      )
      .reduce((sum, x) => sum + (s.stocks[x.id] ?? 0), 0);
  const actors = Object.values(s.agents),
    needs = w.needs ?? needsDefaults,
    price = w.items.find((i) => i.id === item)?.price ?? 0;
  return {
    item,
    ready: stock(item),
    ingredients: r ? stock(r.input) : 0,
    produced: s.produced[item] ?? 0,
    eaten: s.consumed[item] ?? 0,
    hungry: actors.filter((a) => a.hunger < needs.eatThreshold).length,
    cannotAfford: actors.filter(
      (a) =>
        (s.accounts[w.agents.find((n) => n.id === a.id)!.account] ?? 0) < price,
    ).length,
    portionsPerDay:
      Math.ceil((1440 * needs.fullnessDrain) / Math.max(1, needs.mealGain)) *
      actors.length,
    cooks: w.agents.filter((a) => a.role === "innkeeper" && a.work === "tavern")
      .length,
    couriers: w.agents.filter((a) => a.role === "stable").length,
  };
}
