import { expect, it } from "vitest";
import { npcSchema, projectSchema } from "../shared/schema.js";
import { emptyProfile } from "../shared/character.js";
const legacy = {
  id: "existing-npc",
  name: "Existing",
  role: "Farmer",
  text: "Hello",
  settings: {
    voice: "Kore",
    model: "gemini-3.8-flash-tts",
    emotion: "Calm",
    pace: 1,
    direction: "Natural",
  },
};
it("loads existing characters without changing their voice settings and creates independent defaults", () => {
  const n = npcSchema.parse(legacy);
  expect(n.settings).toEqual(legacy.settings);
  expect(n.profile.aging).toBe("none");
  expect(n.profile.mortality).toBe("rare_events");
  const one = emptyProfile(),
    two = emptyProfile();
  one.mechanics.push("trading");
  expect(two.mechanics).toEqual([]);
});
it("preserves social, story and custom attributes across JSON round trips", () => {
  const profile = emptyProfile();
  profile.biography = "A life in the village";
  profile.age = 42;
  profile.attributes.empathy = 87;
  profile.custom.push({
    key: "Farm knowledge",
    value: "Expert",
    notes: "Inherited from family",
  });
  profile.relationships.push({
    kind: "mother",
    otherId: "",
    otherName: "A parent",
    trust: 80,
    affection: 90,
    respect: 75,
    tension: 10,
    status: "Close",
    notes: "Family history",
  });
  const parsed = projectSchema.parse(
    JSON.parse(
      JSON.stringify({
        version: 1,
        npcs: [{ ...legacy, profile }],
        gameCharacter: true,
      }),
    ),
  );
  expect(parsed.npcs[0]!.profile).toEqual(profile);
});
