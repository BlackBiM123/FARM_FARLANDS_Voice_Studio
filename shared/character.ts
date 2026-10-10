import { z } from "zod";
const text = z.string().max(1500).default(""),
  short = z.string().max(250).default(""),
  score = z.number().min(0).max(100).nullable().default(null);
export const relationshipKinds = [
  "mother",
  "father",
  "parent",
  "child",
  "sibling",
  "grandparent",
  "spouse",
  "partner",
  "romantic_interest",
  "friend",
  "rival",
  "enemy",
  "mentor",
  "apprentice",
  "colleague",
  "other",
] as const;
export const characterProfileSchema = z.object({
  gender: z
    .enum(["unspecified", "male", "female", "other"])
    .default("unspecified"),
  age: z.number().int().min(0).max(150).nullable().default(null),
  lifeStage: z
    .enum(["unspecified", "child", "teen", "adult", "mature", "elder"])
    .default("unspecified"),
  species: short,
  culture: short,
  appearance: text,
  region: short,
  settlement: short,
  home: short,
  biography: text,
  background: text,
  personality: text,
  traits: short,
  values: text,
  fears: text,
  likes: text,
  dislikes: text,
  habits: text,
  profession: short,
  workplace: short,
  services: text,
  products: text,
  skills: text,
  income: z.number().min(0).nullable().default(null),
  wealth: z
    .enum(["unspecified", "poor", "modest", "comfortable", "wealthy"])
    .default("unspecified"),
  faction: short,
  reputation: text,
  socialRole: text,
  mechanics: z
    .array(z.string().max(80))
    .max(30)
    .default(() => []),
  household: short,
  familyHistory: text,
  maritalStatus: z
    .enum([
      "unspecified",
      "single",
      "partnered",
      "married",
      "widowed",
      "divorced",
    ])
    .default("unspecified"),
  romanceAvailable: z.boolean().default(false),
  romanceNotes: text,
  childrenNotes: text,
  aging: z.enum(["none", "elderly_only", "custom"]).default("none"),
  mortality: z.enum(["rare_events", "none", "custom"]).default("rare_events"),
  lifeStatus: z
    .enum(["alive", "missing", "deceased", "other"])
    .default("alive"),
  health: text,
  shortGoal: text,
  longGoal: text,
  secret: text,
  internalConflict: text,
  externalConflict: text,
  storyArc: text,
  fateEvents: text,
  deathConditions: text,
  futurePaths: text,
  quests: text,
  attributes: z
    .object({
      strength: score,
      stamina: score,
      agility: score,
      intelligence: score,
      charisma: score,
      willpower: score,
      empathy: score,
      ambition: score,
      sociability: score,
      caution: score,
    })
    .default(() => ({
      strength: null,
      stamina: null,
      agility: null,
      intelligence: null,
      charisma: null,
      willpower: null,
      empathy: null,
      ambition: null,
      sociability: null,
      caution: null,
    })),
  relationships: z
    .array(
      z.object({
        kind: z.enum(relationshipKinds).default("friend"),
        otherId: z.string().max(60).default(""),
        otherName: z.string().max(80).default(""),
        trust: z.number().min(-100).max(100).default(0),
        affection: z.number().min(-100).max(100).default(0),
        respect: z.number().min(-100).max(100).default(0),
        tension: z.number().min(0).max(100).default(0),
        status: z.string().max(250).default(""),
        notes: z.string().max(1000).default(""),
      }),
    )
    .max(50)
    .default(() => []),
  schedule: z
    .array(
      z.object({
        day: z
          .enum(["daily", "mon", "tue", "wed", "thu", "fri", "sat", "sun"])
          .default("daily"),
        start: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .default("08:00"),
        end: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .default("18:00"),
        place: z.string().max(250).default(""),
        activity: z.string().max(500).default(""),
      }),
    )
    .max(50)
    .default(() => []),
  custom: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        value: z.string().max(1000),
        notes: z.string().max(500).default(""),
      }),
    )
    .max(50)
    .default(() => []),
});
export type CharacterProfile = z.infer<typeof characterProfileSchema>;
export const emptyProfile = () => characterProfileSchema.parse({});
