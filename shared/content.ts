import { z } from "zod";
import {
  mechanicsSchema,
  outcomeSchema,
  obligationSchema,
  factKeys,
} from "./scenario-mechanics.js";
const npcId = z.string().regex(/^[a-z0-9_-]{1,60}$/);
export const lineTypes = [
  "greeting",
  "farewell",
  "ambient",
  "trade",
  "quest",
  "reaction",
  "relationship",
  "conflict",
  "custom",
] as const;
export const lineTypeLabels: Record<(typeof lineTypes)[number], string> = {
  greeting: "Приветствия",
  farewell: "Прощания",
  ambient: "Повседневные",
  trade: "Торговля",
  quest: "Задания",
  reaction: "Реакции на события",
  relationship: "Отношения",
  conflict: "Конфликты",
  custom: "Другие",
};
export const lineStatuses = ["draft", "ready", "approved"] as const;
export const lineStatusLabels = {
  draft: "Черновик",
  ready: "Текст готов",
  approved: "Утверждено",
};
export const dialogueGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
});
const locale = z.object({
  text: z.string().max(600).default(""),
  takeId: z.string().uuid().nullable().default(null),
});
export const dialogueLineSchema = z.object({
  id: z.string().uuid(),
  key: z.string().regex(/^[a-z0-9_-]{1,80}$/),
  npcId,
  groupId: z.string().uuid(),
  type: z.enum(lineTypes).default("ambient"),
  status: z.enum(lineStatuses).default("draft"),
  ru: locale.default({ text: "", takeId: null }),
  en: locale.default({ text: "", takeId: null }),
  context: z.string().max(1000).default(""),
  conditions: z.string().max(1000).default(""),
  emotion: z.string().max(100).default(""),
  direction: z.string().max(1000).default(""),
  scenarioId: z.string().uuid().nullable().default(null),
  recipientId: npcId.nullable().default(null),
  outcomeIds: z.array(z.string().uuid()).max(20).default([]),
  requiredFacts: factKeys,
  knownFacts: factKeys,
  moment: z.enum(["scene", "aftermath", "any"]).default("scene"),
});
export const scenarioStates = [
  "draft",
  "active",
  "escalated",
  "resolved",
  "archived",
] as const;
export const scenarioStateLabels = {
  draft: "Черновики",
  active: "Активные",
  escalated: "Обострение",
  resolved: "Разрешены",
  archived: "Архив",
};
export const scenarioTypes = [
  "conversation",
  "help",
  "trade",
  "gift",
  "family",
  "rivalry",
  "resources",
  "values",
  "secret",
  "custom",
] as const;
export const scenarioTypeLabels = {
  conversation: "Разговор",
  help: "Помощь",
  trade: "Торговля",
  gift: "Подарок",
  family: "Семейная ситуация",
  rivalry: "Соперничество",
  resources: "Ресурсы и имущество",
  values: "Ценности и цели",
  secret: "Тайна",
  custom: "Другое",
};
export const effectMetrics = [
  "trust",
  "affection",
  "respect",
  "tension",
] as const;
export const effectMetricLabels = {
  trust: "Доверие",
  affection: "Привязанность",
  respect: "Уважение",
  tension: "Напряжение",
};
export const scenarioSchema = z.object({
  id: z.string().uuid(),
  key: z
    .string()
    .regex(/^$|^[a-z0-9_-]{1,80}$/)
    .default(""),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(["interaction", "conflict"]),
  type: z.enum(scenarioTypes).default("conversation"),
  state: z.enum(scenarioStates).default("draft"),
  initiatorId: npcId.nullable().default(null),
  targets: z.array(npcId).max(10).default([]),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  intensity: z.number().int().min(0).max(100).default(25),
  description: z.string().max(1500).default(""),
  cause: z.string().max(1000).default(""),
  trigger: z.string().max(1000).default(""),
  conditions: z.string().max(1000).default(""),
  playerInfluence: z.string().max(1500).default(""),
  resolution: z.string().max(1500).default(""),
  memory: z.string().max(1000).default(""),
  cooldownHours: z.number().min(0).max(8760).default(0),
  sourceText: z.string().max(50000).default(""),
  mechanics: mechanicsSchema.default(() => mechanicsSchema.parse({})),
  outcomes: z.array(outcomeSchema).max(20).default([]),
  facts: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_.:-]{1,100}$/),
        label: z.string().trim().min(1).max(250),
        description: z.string().max(1000).default(""),
      }),
    )
    .max(100)
    .default([]),
  obligations: z.array(obligationSchema).max(20).default([]),
  effects: z
    .array(
      z.object({
        id: z.string().uuid(),
        fromId: npcId.nullable().default(null),
        toId: npcId.nullable().default(null),
        metric: z.enum(effectMetrics),
        delta: z.number().min(-100).max(100),
        note: z.string().max(500).default(""),
        outcomeIds: z.array(z.string().uuid()).max(20).default([]),
        requiredFacts: factKeys,
      }),
    )
    .max(30)
    .default([]),
});
export type DialogueLine = z.infer<typeof dialogueLineSchema>;
export type DialogueGroup = z.infer<typeof dialogueGroupSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export function moveLine(
  lines: DialogueLine[],
  id: string,
  groupId: string,
  beforeId?: string,
) {
  const current = lines.find((l) => l.id === id);
  if (!current || id === beforeId) return lines;
  const next = lines.filter((l) => l.id !== id),
    index = beforeId ? next.findIndex((l) => l.id === beforeId) : next.length;
  next.splice(index < 0 ? next.length : index, 0, { ...current, groupId });
  return next;
}
export function contentErrors(p: {
  npcs: { id: string }[];
  dialogueGroups: DialogueGroup[];
  dialogueLines: DialogueLine[];
  scenarios: Scenario[];
}) {
  const ids = new Set(p.npcs.map((n) => n.id)),
    groups = new Set(p.dialogueGroups.map((g) => g.id)),
    scenarios = new Set(p.scenarios.map((s) => s.id));
  const errors: string[] = [];
  for (const collection of [p.dialogueGroups, p.dialogueLines, p.scenarios])
    if (new Set(collection.map((x) => x.id)).size !== collection.length)
      errors.push("Повтор ID содержимого");
  if (
    new Set(p.dialogueLines.map((l) => l.key)).size !== p.dialogueLines.length
  )
    errors.push("Ключи реплик должны быть уникальны");
  for (const l of p.dialogueLines)
    if (
      !ids.has(l.npcId) ||
      !groups.has(l.groupId) ||
      (l.recipientId && !ids.has(l.recipientId)) ||
      (l.scenarioId && !scenarios.has(l.scenarioId))
    )
      errors.push(
        "У реплики есть ссылка на отсутствующего персонажа, группу или сценарий",
      );
  for (const l of p.dialogueLines) {
    const s = p.scenarios.find((s) => s.id === l.scenarioId);
    if (l.outcomeIds.some((id) => !s?.outcomes.some((o) => o.id === id)))
      errors.push("У реплики есть ссылка на отсутствующий исход");
  }
  for (const s of p.scenarios) {
    if (
      (s.initiatorId && !ids.has(s.initiatorId)) ||
      s.targets.some((id) => !ids.has(id)) ||
      s.effects.some(
        (e) => (e.fromId && !ids.has(e.fromId)) || (e.toId && !ids.has(e.toId)),
      )
    )
      errors.push("У сценария есть ссылка на отсутствующего персонажа");
    if (
      new Set(s.targets).size !== s.targets.length ||
      s.targets.includes(s.initiatorId ?? "")
    )
      errors.push("Участники сценария повторяются");
    if (new Set(s.effects.map((e) => e.id)).size !== s.effects.length)
      errors.push("Повтор ID последствия");
    const outcomeIds = new Set(s.outcomes.map((o) => o.id));
    if (new Set(s.facts.map((f) => f.key)).size !== s.facts.length)
      errors.push("Ключи фактов сценария повторяются");
    if (
      outcomeIds.size !== s.outcomes.length ||
      new Set(s.outcomes.map((o) => o.key)).size !== s.outcomes.length
    )
      errors.push("Исходы сценария должны иметь уникальные ID и ключи");
    if (s.effects.some((e) => e.outcomeIds.some((id) => !outcomeIds.has(id))))
      errors.push("Последствие ссылается на отсутствующий исход");
    if (
      new Set(s.obligations.map((o) => o.id)).size !== s.obligations.length ||
      new Set(s.obligations.map((o) => o.key)).size !== s.obligations.length
    )
      errors.push("Обязательства должны иметь уникальные ID и ключи");
    if (
      s.obligations.some(
        (o) =>
          (o.fromId && !ids.has(o.fromId)) ||
          (o.toId && !ids.has(o.toId)) ||
          (o.createdByOutcomeId && !outcomeIds.has(o.createdByOutcomeId)),
      )
    )
      errors.push(
        "Обязательство ссылается на отсутствующего участника или исход",
      );
  }
  const keys = p.scenarios.map((s) => s.key).filter(Boolean);
  if (new Set(keys).size !== keys.length)
    errors.push("Ключи сценариев должны быть уникальными");
  return [...new Set(errors)];
}
