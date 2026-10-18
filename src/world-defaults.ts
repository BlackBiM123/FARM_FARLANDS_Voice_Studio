import { worldSchema, type WorldDefinition } from "../shared/world.js";
import type { NPC } from "../shared/schema.js";
export function createWorld(npcs: NPC[]): WorldDefinition {
  const roles = [
    [
      "npc_theo_hartley",
      "stable",
      "stable",
      "tavern",
      "theo",
      "stable_business",
      35,
      5,
    ],
    [
      "npc_start_farm_martin_001",
      "farmer",
      "martin_farm",
      "martin_farm",
      "martin",
      "farm_business",
      25,
      0,
    ],
    [
      "npc_start_tavern_gideon_002",
      "innkeeper",
      "tavern",
      "tavern",
      "gideon",
      "inn_business",
      25,
      0,
    ],
  ] as const;
  return worldSchema.parse({
    version: 1,
    revision: 1,
    name: "Ровенвуд · лаборатория мира",
    seed: 42,
    notes:
      "Тестовый баланс, не утверждённая экономика. Размещение города условно. Ферма Мартина отдельна от фермы игрока. Производство: переработка начального зерна в муку.",
    places: [
      ["forest", "Лес", 1, 130, 180, "nature"],
      ["meadow", "Луга и тракт", 2, 490, 160, "exit"],
      ["cave", "Основная пещера", 3, 820, 160, "nature"],
      ["player_farm", "Ферма игрока", 4, 170, 470, "home"],
      ["road", "Сельская дорога", 5, 490, 490, "nature"],
      ["tavern", "Таверна «Промис»", 6, 760, 430, "shop"],
      ["stable", "Конюшня", 6, 880, 480, "work"],
      ["martin_farm", "Ферма Мартина · условно", 6, 700, 540, "work"],
      ["house", "Дом на продажу · тест", 6, 850, 570, "home"],
      ["coast", "Западный берег", 7, 180, 810, "nature"],
      ["waterfall", "Водопад", 8, 490, 810, "nature"],
      ["pier", "Причал", 9, 810, 810, "exit"],
    ].map(([id, name, scene, x, y, kind]) => ({
      id,
      name,
      scene,
      x,
      y,
      kind,
      exists: true,
      godotPath:
        id === "player_farm"
          ? "res://scenes/region/s4_map.tscn"
          : id === "road"
            ? "res://scenes/region/s5_map.tscn"
            : "",
    })),
    routes: [
      ["player_farm", "road", 20],
      ["road", "tavern", 25],
      ["tavern", "stable", 10],
      ["tavern", "martin_farm", 15],
      ["tavern", "house", 10],
      ["road", "forest", 30],
      ["forest", "meadow", 25],
      ["meadow", "cave", 30],
      ["road", "waterfall", 25],
      ["waterfall", "pier", 20],
      ["waterfall", "coast", 25],
    ].map(([from, to, minutes], i) => ({
      id: "route_" + i,
      from,
      to,
      minutes,
      mode: "walk",
      open: true,
    })),
    accounts: [
      ["theo", "Тео · личные", 70],
      ["martin", "Мартин · личные", 100],
      ["gideon", "Гидеон · личные", 100],
      ["stable_business", "Конюшня", 1200],
      ["farm_business", "Ферма Мартина", 1200],
      ["inn_business", "Таверна «Промис»", 1200],
      ["seller", "Продавец дома · тестовый счёт", 0],
      ["outside", "Внешний рынок", 3000],
    ].map(([id, name, balance]) => ({ id, name, balance })),
    items: [
      { id: "wheat", name: "Пшеница", weight: 0.08, price: 2 },
      { id: "flour", name: "Мука", weight: 0.5, price: 4 },
      { id: "potato", name: "Картофель", weight: 0.25, price: 3 },
    ],
    stocks: [
      {
        id: "grain",
        place: "martin_farm",
        owner: "farm_business",
        item: "wheat",
        amount: 100,
      },
      {
        id: "flour_farm",
        place: "martin_farm",
        owner: "farm_business",
        item: "flour",
        amount: 0,
      },
      {
        id: "flour_inn",
        place: "tavern",
        owner: "inn_business",
        item: "flour",
        amount: 0,
      },
      {
        id: "food_inn",
        place: "tavern",
        owner: "inn_business",
        item: "potato",
        amount: 100,
      },
      {
        id: "external_food",
        place: "pier",
        owner: "outside",
        item: "potato",
        amount: 200,
      },
    ],
    agents: roles.flatMap(
      ([id, role, work, home, account, employer, wage, rent]) => {
        const n = npcs.find((n) => n.id === id);
        return n
          ? [
              {
                id,
                name: n.name,
                role,
                work,
                home,
                account,
                employer,
                wage,
                rent,
                goalHouse: role === "stable",
                helpfulness: role === "stable" ? 80 : 50,
              },
            ]
          : [];
      },
    ),
    house: { place: "house", seller: "seller", price: 220 },
    production: {
      place: "martin_farm",
      owner: "farm_business",
      input: "wheat",
      output: "flour",
      inputAmount: 2,
      outputAmount: 1,
      minutes: 60,
    },
    protectedFacts: [
      "История Эвелин и Ханны защищена.",
      "Томас и Розалин — равноправные партнёры.",
      "Молли и Эмма — отдельные личности.",
    ],
  });
}
export async function worldHash(world: WorldDefinition) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(world)),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
