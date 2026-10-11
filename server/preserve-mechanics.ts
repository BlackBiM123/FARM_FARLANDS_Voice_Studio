import type { z } from "zod";
import type { projectSchema } from "../shared/schema.js";
type Project = z.infer<typeof projectSchema>;
type Raw = {
  scenarios?: Record<string, unknown>[];
  dialogueLines?: Record<string, unknown>[];
  scenarioGuidelines?: unknown;
};
const scenarioFields = [
  "mechanics",
  "outcomes",
  "facts",
  "obligations",
  "sourceText",
  "key",
] as const;
const lineFields = [
  "outcomeIds",
  "requiredFacts",
  "knownFacts",
  "moment",
] as const;
export function needsMechanicsPreservation(raw: Raw) {
  return (
    raw.scenarioGuidelines === undefined ||
    (raw.scenarios ?? []).some(
      (s) =>
        scenarioFields.some((k) => s[k] === undefined) ||
        ((s.effects as Record<string, unknown>[]) ?? []).some(
          (e) => e.outcomeIds === undefined || e.requiredFacts === undefined,
        ),
    ) ||
    (raw.dialogueLines ?? []).some((l) =>
      lineFields.some((k) => l[k] === undefined),
    )
  );
}
export function preserveMechanics(old: Project, next: Project, raw: Raw) {
  if (raw.scenarioGuidelines === undefined)
    next.scenarioGuidelines = old.scenarioGuidelines;
  for (const s of next.scenarios) {
    const previous = old.scenarios.find((p) => p.id === s.id),
      input = raw.scenarios?.find((p) => p.id === s.id);
    if (!previous || !input) continue;
    if (input.mechanics === undefined) s.mechanics = previous.mechanics;
    if (input.outcomes === undefined) s.outcomes = previous.outcomes;
    if (input.facts === undefined) s.facts = previous.facts;
    if (input.obligations === undefined) s.obligations = previous.obligations;
    if (input.sourceText === undefined) s.sourceText = previous.sourceText;
    if (input.key === undefined) s.key = previous.key;
    for (const e of s.effects) {
      const before = previous.effects.find((p) => p.id === e.id),
        value = (input.effects as Record<string, unknown>[] | undefined)?.find(
          (p) => p.id === e.id,
        );
      if (!before || !value) continue;
      if (value.outcomeIds === undefined)
        e.outcomeIds = before.outcomeIds.filter((id) =>
          s.outcomes.some((o) => o.id === id),
        );
      if (value.requiredFacts === undefined)
        e.requiredFacts = before.requiredFacts;
    }
  }
  for (const l of next.dialogueLines) {
    const previous = old.dialogueLines.find((p) => p.id === l.id),
      input = raw.dialogueLines?.find((p) => p.id === l.id);
    if (!previous || !input) continue;
    if (input.outcomeIds === undefined)
      l.outcomeIds = previous.outcomeIds.filter((id) =>
        next.scenarios
          .find((s) => s.id === l.scenarioId)
          ?.outcomes.some((o) => o.id === id),
      );
    if (input.requiredFacts === undefined)
      l.requiredFacts = previous.requiredFacts;
    if (input.knownFacts === undefined) l.knownFacts = previous.knownFacts;
    if (input.moment === undefined) l.moment = previous.moment;
  }
}
