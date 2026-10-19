import { z } from "zod";
const id = z.string().regex(/^[a-z0-9_-]{1,60}$/),
  point = z.number().int().min(-100).max(100),
  minute = z.number().int().min(0).max(43560);
export const relationshipScores = z.object({
  affinity: point,
  trust: point,
  respect: point,
  attachment: point,
});
export const lifeDefinition = z.object({
  // Этапы интерпретирует только доверенное GDScript-ядро.
  version: z.literal(1),
  enabled: z.boolean(),
  socialDelta: relationshipScores,
  initialRelations: z
    .array(z.object({ from: id, to: id, scores: relationshipScores }))
    .max(1000),
  requests: z
    .array(
      z.object({
        id,
        name: z.string().min(1).max(120),
        issuer: id,
        actor: id,
        target: id,
        deadlineMinutes: z.number().int().min(1).max(43200),
        priority: z.number().int().min(1).max(119),
        stages: z
          .array(
            z.object({
              id,
              kind: z.literal("conversation"),
              with: z.enum(["target", "issuer"]),
              label: z.string().min(1).max(120),
            }),
          )
          .min(1)
          .max(8)
          .optional(),
      }),
    )
    .max(64),
});
const cause = z.string().max(100),
  goal = z.object({
    kind: z.enum(["housing", "debt"]),
    status: z.enum(["active", "completed"]),
    updated: minute,
    cause,
    amount: z.number().int().nonnegative().optional(),
  });
export const lifeState = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  processedThrough: z.number().int().nonnegative(),
  relations: z.record(
    z.string(),
    z.record(z.string(), relationshipScores.extend({ cause })),
  ),
  goals: z.record(z.string(), z.record(z.string(), goal)),
  quests: z.record(
    z.string(),
    z.object({
      status: z.enum(["active", "completed", "expired"]),
      created: minute,
      deadline: z.number().int().max(86760).nonnegative(),
      updated: minute,
      cause,
      issuer: id,
      actor: id,
      target: id,
      cursor: z.number().int().min(0).max(8).optional(),
      stages: z
        .array(
          z.object({
            id,
            status: z.enum(["pending", "completed"]),
            cause,
            completedAt: minute.optional(),
          }),
        )
        .min(1)
        .max(8)
        .optional(),
    }),
  ),
  traces: z.record(
    z.string(),
    z
      .array(
        z.object({
          kind: z.enum(["money", "move"]),
          minute,
          cause,
          delta: z.number().int().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        }),
      )
      .max(12),
  ),
});
export type LifeDefinition = z.infer<typeof lifeDefinition>;
export function needsRequestStagePreservation(raw: unknown) {
  const w = raw as { life?: { requests?: { stages?: unknown }[] } } | undefined;
  return !!w?.life?.requests?.some((r) => r.stages === undefined);
}
export function preserveRequestStages(
  old: LifeDefinition | undefined,
  next: LifeDefinition | undefined,
  raw: unknown,
) {
  if (!old || !next) return;
  const input =
    (
      raw as
        { life?: { requests?: { id: string; stages?: unknown }[] } } | undefined
    )?.life?.requests ?? [];
  for (const r of next.requests) {
    const value = input.find((x) => x.id === r.id),
      previous = old.requests.find((x) => x.id === r.id);
    if (value && value.stages === undefined && previous?.stages)
      r.stages = structuredClone(previous.stages);
  }
}
export function requestStages(rule: LifeDefinition["requests"][number]) {
  return (
    rule.stages ?? [
      {
        id: "meet_target",
        kind: "conversation" as const,
        with: "target" as const,
        label: "Поговорить с нужным NPC",
      },
    ]
  );
}
export function retainLifeActors(
  life: LifeDefinition | undefined,
  actors: string[],
) {
  if (!life) return;
  const ids = new Set(actors);
  return {
    ...structuredClone(life),
    initialRelations: life.initialRelations
      .filter((r) => ids.has(r.from) && ids.has(r.to))
      .map((r) => structuredClone(r)),
    requests: life.requests
      .filter((r) => [r.issuer, r.actor, r.target].every((id) => ids.has(id)))
      .map((r) => structuredClone(r)),
  };
}
export type LifeState = z.infer<typeof lifeState>;
export function lifeReferenceError(
  def: LifeDefinition | undefined,
  actors: string[],
): string | undefined {
  if (!def) return;
  const ids = new Set(actors),
    pairs = new Set<string>(),
    requests = new Set<string>();
  for (const r of def.initialRelations) {
    const key = r.from + ":" + r.to;
    if (r.from === r.to || !ids.has(r.from) || !ids.has(r.to) || pairs.has(key))
      return "Неизвестная или повторная направленная связь";
    pairs.add(key);
  }
  for (const r of def.requests) {
    const stages = requestStages(r);
    if (new Set(stages.map((s) => s.id)).size !== stages.length)
      return "Повтор ID этапа просьбы";
    if (
      new Set([r.issuer, r.actor, r.target]).size !== 3 ||
      ![r.issuer, r.actor, r.target].every((x) => ids.has(x)) ||
      requests.has(r.id)
    )
      return "Просьба требует трёх разных известных участников и уникального ID";
    requests.add(r.id);
  }
}
