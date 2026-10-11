import type { Scenario, DialogueLine } from "./content.js";
export type Occurrence = {
  id: string;
  scenarioId: string;
  contextKey: string;
  createdAt: number;
  expiresAt: number;
  stage:
    "pending" | "playing" | "awaiting_resolution" | "resolved" | "cancelled";
  outcomeId: string | null;
};
export type SceneContext = {
  now: number;
  location: string;
  availableIds: string[];
  playerPresent: boolean;
  activeExclusivityKeys: string[];
  lastObservedSceneAt?: number;
  invalidated?: boolean;
};
export function prepareOccurrence(
  s: Scenario,
  contextKey: string,
  now: number,
  windowDays: number,
  history: Occurrence[],
): Occurrence {
  if (
    windowDays < s.mechanics.windowDaysMin ||
    windowDays > s.mechanics.windowDaysMax ||
    !Number.isFinite(now) ||
    !contextKey.trim()
  )
    throw Error("Проверьте окно и контекст события");
  const previous = history.filter((x) => x.scenarioId === s.id);
  if (s.mechanics.repeatPolicy === "once" && previous.length)
    throw Error("Это событие однократное");
  if (
    s.mechanics.repeatPolicy === "per_context" &&
    previous.some((x) => x.contextKey === contextKey)
  )
    throw Error("Событие для этой ситуации уже создано");
  if (previous.some((x) => !["resolved", "cancelled"].includes(x.stage)))
    throw Error("Событие уже ожидает или разыгрывается");
  if (previous.some((x) => now - x.createdAt < s.cooldownHours))
    throw Error("Интервал повторения ещё не прошёл");
  return {
    id: crypto.randomUUID(),
    scenarioId: s.id,
    contextKey,
    createdAt: now,
    expiresAt: now + windowDays * 24,
    stage: "pending",
    outcomeId: null,
  };
}
const minutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h! * 60 + m!;
};
export function sceneBlockReason(
  s: Scenario,
  event: Occurrence,
  c: SceneContext,
): string | null {
  if (event.scenarioId !== s.id || event.stage !== "pending")
    return "Событие не ожидает сцены";
  if (c.invalidated) return "Обстоятельства изменились";
  if (c.now < event.createdAt || c.now >= event.expiresAt)
    return "Событие вне окна актуальности";
  if (s.mechanics.location && c.location !== s.mechanics.location)
    return "Другая локация";
  const clock = (((c.now % 24) + 24) % 24) * 60,
    start = minutes(s.mechanics.preferredStart),
    end = minutes(s.mechanics.preferredEnd);
  if (
    start !== end &&
    !(start < end
      ? clock >= start && clock < end
      : clock >= start || clock < end)
  )
    return "Не подходят часы сцены";
  if (
    !s.initiatorId ||
    [s.initiatorId, ...s.targets].some((id) => !c.availableIds.includes(id))
  )
    return "Участники недоступны";
  if (s.mechanics.playerRequired && !c.playerPresent)
    return "Нужно присутствие игрока";
  if (
    s.mechanics.exclusivityKeys.some((key) =>
      c.activeExclusivityKeys.includes(key),
    )
  )
    return "Идёт взаимоисключающая сцена";
  if (
    c.playerPresent &&
    c.lastObservedSceneAt !== undefined &&
    c.now - c.lastObservedSceneAt < s.mechanics.sceneGapHours
  )
    return "Слишком рано для следующей наблюдаемой сцены";
  return null;
}
export function expiryDirective(
  s: Scenario,
  event: Occurrence,
  now: number,
  invalidated = false,
) {
  if (["resolved", "cancelled"].includes(event.stage)) return "none" as const;
  if (invalidated) return "cancel" as const;
  if (now < event.expiresAt) return "none" as const;
  // Selecting an autonomous outcome requires the game's real world facts; expiry alone cannot invent it.
  return s.mechanics.expiryAction;
}
type Metric = Scenario["effects"][number]["metric"];
export type RelationshipValues = Record<
  string,
  Partial<Record<Metric, number>>
>;
export function applyConfirmedOutcome(
  s: Scenario,
  event: Occurrence,
  outcomeId: string,
  facts: string[],
  previouslyApplied: string[],
  baseline: RelationshipValues,
) {
  const outcome = s.outcomes.find((o) => o.id === outcomeId);
  if (!outcome) throw Error("Исход не найден");
  if (event.scenarioId !== s.id || event.stage === "cancelled")
    throw Error("Событие недоступно");
  if (event.outcomeId && event.outcomeId !== outcomeId)
    throw Error("Другой исход уже подтверждён для этого события");
  if (!outcome.requiredFacts.every((f) => facts.includes(f)))
    throw Error("Факты исхода ещё не подтверждены");
  const values = Object.fromEntries(
      Object.entries(baseline).map(([key, value]) => [key, { ...value }]),
    ),
    ledger = new Set(previouslyApplied),
    applied: string[] = [],
    pending: string[] = [];
  for (const effect of s.effects) {
    if (!effect.outcomeIds.includes(outcomeId)) continue;
    const key = event.id + ":" + effect.id;
    if (ledger.has(key)) continue;
    if (
      !effect.fromId ||
      !effect.toId ||
      !effect.requiredFacts.every((f) => facts.includes(f))
    ) {
      pending.push(effect.id);
      continue;
    }
    const pair = effect.fromId + ":" + effect.toId,
      current = values[pair]?.[effect.metric] ?? 0;
    values[pair] = {
      ...values[pair],
      [effect.metric]: Math.max(
        effect.metric === "tension" ? 0 : -100,
        Math.min(100, current + effect.delta),
      ),
    };
    ledger.add(key);
    applied.push(effect.id);
  }
  return {
    event: { ...event, stage: "resolved" as const, outcomeId },
    values,
    ledger: [...ledger],
    applied,
    pending,
  };
}
export function canUseLine(
  line: DialogueLine,
  facts: string[],
  speakerKnownFacts: string[],
  outcomeId: string | null,
  moment: "scene" | "aftermath",
) {
  return (
    (line.moment === "any" || line.moment === moment) &&
    (!line.outcomeIds.length ||
      (!!outcomeId && line.outcomeIds.includes(outcomeId))) &&
    line.requiredFacts.every((f) => facts.includes(f)) &&
    line.knownFacts.every((f) => speakerKnownFacts.includes(f))
  );
}
