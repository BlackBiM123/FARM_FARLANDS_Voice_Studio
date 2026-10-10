import { z } from "zod";
import { characterProfileSchema, emptyProfile } from "./character.js";
import { familySchema, familyError } from "./family.js";
export const voices = [
  "Sadachbia",
  "Algenib",
  "Alnilam",
  "Gacrux",
  "Leda",
  "Schedar",
  "Fenrir",
  "Iapetus",
  "Charon",
  "Kore",
  "Puck",
  "Aoede",
  "Zephyr",
  "Orus",
] as const;
export const models = [
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
] as const;
export const settingsSchema = z.object({
  voice: z.enum(voices),
  model: z.enum(models),
  emotion: z.string().max(100),
  pace: z.number().min(0.5).max(1.5),
  direction: z.string().max(1000),
});
export const generationSchema = settingsSchema.extend({
  text: z.string().trim().min(1).max(600),
  language: z.enum(["ru", "en"]),
  gameCharacter: z.boolean().default(true),
});
export const npcSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,60}$/),
  name: z.string().min(1).max(80),
  role: z.string().max(120),
  text: z.string().max(600),
  settings: settingsSchema,
  photo: z
    .string()
    .max(100000)
    .regex(/^$|^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  fullImage: z
    .string()
    .max(100000)
    .regex(/^$|^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  profile: characterProfileSchema.default(emptyProfile),
});
export const projectSchema = z
  .object({
    version: z.literal(1),
    npcs: z.array(npcSchema).max(100),
    gameCharacter: z.boolean().default(true),
    families: z
      .array(familySchema)
      .max(100)
      .default(() => []),
  })
  .superRefine((p, ctx) => {
    const ids = new Set(p.npcs.map((n) => n.id));
    const seen = new Set<string>();
    for (const f of p.families) {
      const error =
        familyError(f) ||
        (f.members.some((id) => !ids.has(id))
          ? "Участник семьи не найден"
          : "") ||
        (seen.has(f.id) ? "Повтор ID семьи" : "");
      seen.add(f.id);
      if (error)
        ctx.addIssue({ code: "custom", message: error, path: ["families"] });
    }
  });
export type NPC = z.infer<typeof npcSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export const takeMetadataSchema = z.object({
  id: z.string().uuid(),
  npcId: z.string().regex(/^[a-z0-9_-]{1,60}$/),
  text: z.string().max(600),
  settings: settingsSchema,
  language: z.enum(["ru", "en"]),
  createdAt: z.string().datetime(),
  gameCharacter: z.boolean().optional(),
  favorite: z.boolean(),
});
export type TakeMetadata = z.infer<typeof takeMetadataSchema>;
