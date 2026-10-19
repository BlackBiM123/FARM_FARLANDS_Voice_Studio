import { z } from "zod";
export const needsDefaults = {
  initialEnergy: 900,
  initialFullness: 900,
  fullnessDrain: 1,
  energyDrain: 1,
  restGain: 5,
  mealGain: 650,
  eatThreshold: 300,
  restThreshold: 150,
  eatPriority: 120,
  restPriority: 130,
  nightPriority: 100,
};
const level = z.number().int().min(0).max(1000);
export const needsSchema = z.object({
  initialEnergy: level,
  initialFullness: level,
  fullnessDrain: z.number().int().min(0).max(20),
  energyDrain: z.number().int().min(0).max(20),
  restGain: z.number().int().min(1).max(50),
  mealGain: level,
  eatThreshold: level,
  restThreshold: level,
  eatPriority: z.number().int().min(1).max(200),
  restPriority: z.number().int().min(1).max(200),
  nightPriority: z.number().int().min(1).max(200),
});
export type NeedsRules = z.infer<typeof needsSchema>;
