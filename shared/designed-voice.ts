import { z } from "zod";
export const customVoiceId = z.string().regex(/^voice_[A-Za-z0-9_-]{1,180}$/);
export const designRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  gender: z.enum(["female", "male", "neutral"]),
  language: z.enum(["ru-RU", "en-US"]).default("ru-RU"),
  description: z.string().trim().min(10).max(1500),
});
export const designedVoiceSchema = z.object({
  id: customVoiceId,
  name: z.string().max(80),
  gender: z.string().max(30),
  description: z.string().max(1500),
  expiresAt: z.string().max(80).optional(),
});
export type DesignedVoice = z.infer<typeof designedVoiceSchema>;
export const childVoiceDesigns = [
  {
    name: "Девочка 8 лет — любопытная",
    gender: "female" as const,
    description:
      "A fictional eight-year-old girl speaking native Russian. A naturally light, clear child timbre with small vocal resonance, lively curiosity and spontaneous conversational rhythm; believable, warm and gentle, without squeaky cartoon exaggeration.",
  },
  {
    name: "Девочка 8 лет — спокойная",
    gender: "female" as const,
    description:
      "A fictional eight-year-old girl speaking native Russian. A soft, delicate, unmistakably childlike vocal timbre, quiet confidence and thoughtful, natural phrasing; a grounded gentle voice for a cozy farming adventure game.",
  },
  {
    name: "Девочка 8 лет — озорная",
    gender: "female" as const,
    description:
      "A fictional eight-year-old girl speaking native Russian. A bright youthful child timbre, playful energy, clear articulation and animated natural rhythm; light vocal resonance, warm mischievous personality, never shrill or artificially pitch-shifted.",
  },
];
