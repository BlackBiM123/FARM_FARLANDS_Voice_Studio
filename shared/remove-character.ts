import type { z } from "zod";
import type { projectSchema } from "./schema.js";
type Project = z.infer<typeof projectSchema>;
export function removeCharacter(project: Project, id: string): Project {
  const next = structuredClone(project);
  const deleted = next.npcs.find((n) => n.id === id);
  next.npcs = next.npcs.filter((n) => n.id !== id);
  if (next.world)
    next.world.agents = next.world.agents.filter((a) => a.id !== id);
  for (const n of next.npcs)
    for (const r of n.profile.relationships)
      if (r.otherId === id) {
        r.otherId = "";
        r.otherName ||= deleted?.name || "";
      }
  for (const family of next.families) {
    family.members = family.members.filter((member) => member !== id);
    family.links = family.links.filter((l) => l.from !== id && l.to !== id);
  }
  next.dialogueLines = next.dialogueLines.filter((l) => l.npcId !== id);
  for (const line of next.dialogueLines)
    if (line.recipientId === id) line.recipientId = null;
  for (const scenario of next.scenarios) {
    if (scenario.initiatorId === id) scenario.initiatorId = null;
    scenario.targets = scenario.targets.filter((target) => target !== id);
    scenario.effects = scenario.effects.filter(
      (e) => e.fromId !== id && e.toId !== id,
    );
    scenario.obligations = scenario.obligations.filter(
      (o) => o.fromId !== id && o.toId !== id,
    );
  }
  return next;
}
