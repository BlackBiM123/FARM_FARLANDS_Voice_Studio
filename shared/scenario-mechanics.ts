import { z } from "zod";
const factKey = z.string().regex(/^[a-z0-9_.:-]{1,100}$/),
  npcId = z.string().regex(/^[a-z0-9_-]{1,60}$/);
export const factKeys = z.array(factKey).max(30).default([]);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const eventClasses = ["background", "significant", "key_story"] as const;
export const eventClassLabels = {
  background: "Фоновое",
  significant: "Значимое",
  key_story: "Ключевое сюжетное",
};
export const expiryActions = [
  "auto_resolve",
  "await_resolution",
  "cancel",
] as const;
export const expiryActionLabels = {
  auto_resolve: "NPC решают самостоятельно",
  await_resolution: "Ожидает решения, ситуация остаётся актуальной",
  cancel: "Отменить событие",
};
export const repeatPolicies = ["once", "per_context", "repeatable"] as const;
export const repeatPolicyLabels = {
  once: "Однократно",
  per_context: "Один раз для каждой новой ситуации",
  repeatable: "Повторяемое обсуждение",
};
export const recheckEvents = [
  "location_entry",
  "game_time",
  "participant_availability",
  "world_fact_change",
] as const;
export const recheckLabels = {
  location_entry: "Вход в локацию",
  game_time: "Изменение игрового времени",
  participant_availability: "Изменение доступности участников",
  world_fact_change: "Изменение фактов мира",
};
export const mechanicsSchema = z
  .object({
    version: z.literal(1).default(1),
    eventClass: z.enum(eventClasses).default("significant"),
    triggerKey: factKey.or(z.literal("")).default(""),
    location: z.string().max(120).default(""),
    windowDaysMin: z.number().int().min(1).max(365).default(3),
    windowDaysMax: z.number().int().min(1).max(365).default(7),
    preferredStart: time.default("08:00"),
    preferredEnd: time.default("21:00"),
    playerRequired: z.boolean().default(false),
    playerCanIntervene: z.boolean().default(true),
    expiryAction: z.enum(expiryActions).default("auto_resolve"),
    autonomousResolution: z.string().max(1500).default(""),
    invalidation: z.string().max(1500).default(""),
    repeatPolicy: z.enum(repeatPolicies).default("per_context"),
    contextKeySpec: z.string().max(1000).default(""),
    followUpCooldownHours: z.number().min(0).max(8760).default(0),
    exclusivityKeys: factKeys,
    sceneGapHours: z.number().min(0).max(8760).default(6),
    recheckOn: z
      .array(z.enum(recheckEvents))
      .max(4)
      .default([...recheckEvents]),
    aftermath: z.string().max(1500).default(""),
    notes: z.string().max(2500).default(""),
  })
  .superRefine((m, c) => {
    if (m.windowDaysMin > m.windowDaysMax)
      c.addIssue({
        code: "custom",
        message: "Минимальное окно события больше максимального",
      });
    if (new Set(m.exclusivityKeys).size !== m.exclusivityKeys.length)
      c.addIssue({ code: "custom", message: "Повтор ключа взаимоисключения" });
  });
export const outcomeSchema = z.object({
  id: z.string().uuid(),
  key: factKey,
  label: z.string().trim().min(1).max(150),
  description: z.string().max(1500).default(""),
  conditions: z.string().max(1000).default(""),
  requiredFacts: factKeys,
});
export const obligationSchema = z.object({
  id: z.string().uuid(),
  key: factKey,
  title: z.string().trim().min(1).max(150),
  fromId: npcId.nullable().default(null),
  toId: npcId.nullable().default(null),
  createdByOutcomeId: z.string().uuid().nullable().default(null),
  createdFact: factKey.or(z.literal("")).default(""),
  fulfilledFact: factKey.or(z.literal("")).default(""),
  brokenFact: factKey.or(z.literal("")).default(""),
  dueDays: z.number().min(0).max(365).nullable().default(null),
  notes: z.string().max(1000).default(""),
});
export type Mechanics = z.infer<typeof mechanicsSchema>;
export const parseFacts = (text: string) => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];
