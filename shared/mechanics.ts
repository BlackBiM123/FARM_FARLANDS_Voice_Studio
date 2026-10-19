import { z } from "zod";
const key = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const integer = z.number().int().min(-1000000).max(1000000);
const builtinNames = [
  "Отдых",
  "Поесть",
  "Купить дом",
  "Работа",
  "Перевозка",
  "Общение",
  "Свободное время",
  "Пополнить запас еды",
];
export const mechanicsSchema = z
  .object({
    version: z.literal(1),
    modules: z
      .array(
        z.object({
          id: key,
          name: z.string().min(1).max(80),
          version: z.literal(1),
          enabled: z.boolean(),
          variables: z
            .array(
              z.object({
                id: key,
                name: z.string().min(1).max(80),
                scope: z.enum(["npc", "world"]),
                unit: z.string().max(24),
                min: integer,
                max: integer,
                initial: integer,
                perMinute: z.number().int().min(-1000).max(1000),
              }),
            )
            .max(16),
          actions: z
            .array(
              z.object({
                id: key,
                name: z.string().min(1).max(80),
                variable: key,
                when: z.enum(["below", "above"]),
                threshold: integer,
                priority: z.number().int().min(1).max(200),
                minutes: z.number().int().min(1).max(1440),
                delta: integer,
                place: z.enum(["current", "home", "work"]),
              }),
            )
            .max(16),
        }),
      )
      .max(16),
  })
  .superRefine((r, c) => {
    const fail = (message: string) => c.addIssue({ code: "custom", message });
    if (new Set(r.modules.map((m) => m.id)).size !== r.modules.length)
      fail("Повтор ID модуля");
    let variables = 0,
      actions = 0;
    const names = new Set(builtinNames);
    for (const m of r.modules) {
      if (["core_needs", "core_cooking"].includes(m.id))
        fail("ID системного модуля зарезервирован");
      if (
        new Set(m.variables.map((v) => v.id)).size !== m.variables.length ||
        new Set(m.actions.map((a) => a.id)).size !== m.actions.length
      )
        fail("Повтор ID внутри модуля");
      variables += m.variables.length;
      actions += m.actions.length;
      for (const v of m.variables)
        if (v.min >= v.max || v.initial < v.min || v.initial > v.max)
          fail("Начальное значение должно находиться внутри диапазона");
      for (const a of m.actions) {
        const v = m.variables.find((v) => v.id === a.variable);
        if (!v || a.threshold < v.min || a.threshold > v.max)
          fail(
            "Действию нужен показатель своего модуля и порог в его диапазоне",
          );
        if (names.has(a.name))
          fail("Названия действий должны быть уникальны, включая системные");
        names.add(a.name);
      }
    }
    if (variables > 64 || actions > 16)
      fail("Не больше 64 показателей и 16 действий на мир");
  });
export type MechanicsDefinition = z.infer<typeof mechanicsSchema>;
export const mechanicChangeSchema = z.object({
  minute: z.number().int().min(360).max(43560),
  variable: z.string().max(100),
  rule: z.string().max(80),
  before: integer,
  after: integer,
  delta: integer,
});
export const mechanicsStateSchema = z.object({
  version: z.literal(1),
  versions: z.record(z.string(), z.number().int().min(1)),
  values: z.record(z.string(), z.record(z.string(), integer)),
  recent: z.array(mechanicChangeSchema).max(12),
});
export type MechanicsState = z.infer<typeof mechanicsStateSchema>;
export type MechanicChange = z.infer<typeof mechanicChangeSchema>;
export function mechanicsSnapshotError(
  def: MechanicsDefinition | undefined,
  state: MechanicsState | undefined,
  actors: string[],
  cooking = false,
): string | undefined {
  const modules = def?.modules.filter((m) => m.enabled) ?? [],
    expectedVersions: Record<string, number> = { core_needs: 1 };
  if (cooking) expectedVersions.core_cooking = 1;
  for (const m of modules) expectedVersions[m.id] = m.version;
  if (!state)
    return modules.length
      ? "В снимке нет состояния включённых механик"
      : undefined;
  if (
    Object.keys(state.versions).length !==
      Object.keys(expectedVersions).length ||
    Object.entries(expectedVersions).some(([id, v]) => state.versions[id] !== v)
  )
    return "Версии механик снимка не совпадают с определениями";
  const ids: string[] = [];
  for (const m of modules)
    for (const v of m.variables) {
      const id = m.id + ":" + v.id;
      ids.push(id);
      const owners = v.scope === "world" ? ["world"] : actors,
        values = state.values[id];
      if (
        !values ||
        Object.keys(values).length !== owners.length ||
        owners.some(
          (owner) =>
            values[owner] === undefined ||
            values[owner]! < v.min ||
            values[owner]! > v.max,
        )
      )
        return "Показатели механики неполны или вне диапазона";
    }
  if (Object.keys(state.values).length !== ids.length)
    return "В снимке есть неизвестные показатели";
  return undefined;
}
