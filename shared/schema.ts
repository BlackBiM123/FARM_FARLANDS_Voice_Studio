import { z } from 'zod'
export const voices=['Sadachbia','Algenib','Alnilam','Gacrux','Leda','Schedar','Fenrir','Iapetus','Charon','Kore','Puck','Aoede','Zephyr','Orus'] as const
export const models=['gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts'] as const
export const settingsSchema=z.object({voice:z.enum(voices),model:z.enum(models),emotion:z.string().max(100),pace:z.number().min(0.5).max(1.5),direction:z.string().max(1000)})
export const generationSchema=settingsSchema.extend({text:z.string().trim().min(1).max(600),language:z.enum(['ru','en'])})
export const npcSchema=z.object({id:z.string().regex(/^[a-z0-9_-]{1,60}$/),name:z.string().min(1).max(80),role:z.string().max(120),text:z.string().max(600),settings:settingsSchema})
export const projectSchema=z.object({version:z.literal(1),npcs:z.array(npcSchema).max(100)})
export type NPC=z.infer<typeof npcSchema>
export type Settings=z.infer<typeof settingsSchema>

