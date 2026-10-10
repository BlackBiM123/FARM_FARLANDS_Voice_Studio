import { z } from "zod";
export const familySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(3000),
  home: z.string().max(200),
  members: z.array(z.string().max(60)).max(100),
  links: z
    .array(
      z.object({
        id: z.string().uuid(),
        from: z.string(),
        to: z.string(),
        kind: z.enum(["parent", "adoptive", "spouse", "partner", "former"]),
      }),
    )
    .max(300),
});
export type Family = z.infer<typeof familySchema>;
export function familyError(family: Family): string {
  const members = new Set(family.members);
  if (members.size !== family.members.length) return "Участник добавлен дважды";
  const seen = new Set<string>();
  const parents = family.links.filter(
    (l) => l.kind === "parent" || l.kind === "adoptive",
  );
  for (const l of family.links) {
    if (l.from === l.to) return "Нельзя связать персонажа с самим собой";
    if (!members.has(l.from) || !members.has(l.to))
      return "Оба персонажа должны входить в семью";
    const pair = ["parent", "adoptive"].includes(l.kind)
      ? l.from + ":" + l.to
      : [l.from, l.to].sort().join(":");
    const key =
      (["parent", "adoptive"].includes(l.kind) ? "parent" : "union") +
      ":" +
      pair;
    if (seen.has(key)) return "Такая связь уже существует";
    seen.add(key);
  }
  const visit = (id: string, path: Set<string>): boolean => {
    if (path.has(id)) return true;
    const next = new Set(path);
    next.add(id);
    return parents.filter((l) => l.from === id).some((l) => visit(l.to, next));
  };
  if (family.members.some((id) => visit(id, new Set())))
    return "Нельзя создать замкнутую цепочку предков";
  return "";
}
export function kinship(f: Family, a: string, b: string): string {
  if (a === b) return "Один и тот же персонаж";
  const parents = f.links.filter((l) =>
    ["parent", "adoptive"].includes(l.kind),
  );
  const up = (id: string) =>
    parents.filter((l) => l.to === id).map((l) => l.from);
  const direct = f.links.find(
    (l) => (l.from === a && l.to === b) || (l.from === b && l.to === a),
  );
  if (direct) {
    if (["parent", "adoptive"].includes(direct.kind))
      return direct.from === a
        ? direct.kind === "adoptive"
          ? "Приёмный родитель"
          : "Родитель"
        : direct.kind === "adoptive"
          ? "Приёмный ребёнок"
          : "Ребёнок";
    return {
      spouse: "Супруг / супруга",
      partner: "Партнёр",
      former: "Бывший партнёр",
    }[direct.kind as "spouse" | "partner" | "former"];
  }
  if (up(a).some((id) => up(b).includes(id))) return "Брат / сестра";
  const distance = (ancestor: string, child: string): number => {
    const queue: [string, number][] = [[child, 0]];
    const seen = new Set<string>();
    while (queue.length) {
      const [id, d] = queue.shift()!;
      if (id === ancestor) return d;
      if (seen.has(id)) continue;
      seen.add(id);
      up(id).forEach((p) => queue.push([p, d + 1]));
    }
    return -1;
  };
  const d = distance(a, b),
    r = distance(b, a);
  if (d === 2) return "Дедушка / бабушка";
  if (r === 2) return "Внук / внучка";
  if (d > 2) return `Предок (${d} поколения)`;
  if (r > 2) return `Потомок (${r} поколения)`;
  if (up(b).some((p) => up(p).some((g) => up(a).includes(g))))
    return "Дядя / тётя";
  if (up(a).some((p) => up(p).some((g) => up(b).includes(g))))
    return "Племянник / племянница";
  if (
    up(a).some((p) => up(p).some((g) => up(b).some((q) => up(q).includes(g))))
  )
    return "Двоюродный брат / сестра";
  return "Прямое родство не определено";
}
