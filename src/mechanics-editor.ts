import type { MechanicsDefinition } from "../shared/mechanics.js";
export function addMechanic(
  input: MechanicsDefinition | undefined,
  demo = false,
): MechanicsDefinition {
  const registry: MechanicsDefinition = JSON.parse(
    JSON.stringify(input ?? { version: 1, modules: [] }),
  );
  let i = 1;
  while (registry.modules.some((m) => m.id === "module_" + i)) i++;
  registry.modules.push({
    id: "module_" + i,
    name: demo ? "Тест подключения" : "Новый модуль " + i,
    version: 1,
    enabled: false,
    variables: demo
      ? [
          {
            id: "test_load",
            name: "Тестовая нагрузка",
            scope: "npc",
            unit: "ед.",
            min: 0,
            max: 100,
            initial: 0,
            perMinute: 1,
          },
          {
            id: "test_clock",
            name: "Тестовый счётчик мира",
            scope: "world",
            unit: "мин",
            min: 0,
            max: 100000,
            initial: 0,
            perMinute: 1,
          },
        ]
      : [],
    actions: demo
      ? [
          {
            id: "test_pause",
            name: "Тестовая пауза " + i,
            variable: "test_load",
            when: "above",
            threshold: 30,
            priority: 110,
            minutes: 5,
            delta: -50,
            place: "current",
          },
        ]
      : [],
  });
  return registry;
}
