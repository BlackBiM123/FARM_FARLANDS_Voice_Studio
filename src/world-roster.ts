import type { NPC } from "../shared/schema.js";
import { worldSchema, type WorldDefinition } from "../shared/world.js";
export function prepareRoster(
  input: WorldDefinition,
  npcs: NPC[],
): WorldDefinition {
  const world = structuredClone(input);
  for (const npc of npcs.filter((n) => n.profile.lifeStatus === "alive")) {
    let actor = world.agents.find((a) => a.id === npc.id);
    if (!actor) {
      const home = "home_" + npc.id.slice(0, 48),
        wallet = "wallet_" + npc.id.slice(0, 48);
      if (!world.places.some((p) => p.id === home)) {
        const i = world.agents.length;
        world.places.push({
          id: home,
          name: (npc.profile.home || "Дом · " + npc.name).slice(0, 100),
          scene: 6,
          x: 680 + (i % 5) * 55,
          y: 360 + Math.floor(i / 5) * 40,
          kind: "home",
          exists: true,
          godotPath: "",
        });
        world.routes.push({
          id: "route_" + home,
          from: home,
          to: world.places.some((p) => p.id === "tavern")
            ? "tavern"
            : world.places[0]!.id,
          minutes: 10,
          mode: "walk",
          open: true,
        });
      }
      if (!world.accounts.some((a) => a.id === wallet))
        world.accounts.push({
          id: wallet,
          name: npc.name + " · тестовый кошелёк",
          balance: 50,
        });
      actor = {
        id: npc.id,
        name: npc.name,
        home,
        work: home,
        account: wallet,
        employer: wallet,
        wage: 0,
        rent: 0,
        role: "resident",
        goalHouse: false,
        helpfulness: 50,
        setupStatus: "test",
        setupNotes:
          "Предварительная привязка. Координаты дома и дорога условные; 50 денег — тестовый старт. Профессия пока не исполняется: используется поведение жителя. Доход, расходы и жизненные цели требуют проверки.",
      };
      world.agents.push(actor);
    }
    actor.sourceProfession = npc.profile.profession || npc.role;
    actor.sourceHome = npc.profile.home;
    actor.sourceWorkplace = npc.profile.workplace;
    actor.sourceGoal = npc.profile.longGoal;
    actor.setupStatus ??= "test";
    actor.setupNotes ??=
      "Параметры прежнего тестового стенда. Сопоставьте их с анкетой; профессия, доход и стоимость жилья не считаются утверждёнными автоматически.";
  }
  return worldSchema.parse(world);
}
