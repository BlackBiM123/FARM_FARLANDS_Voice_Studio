import { z } from "zod";
export const journalPageSchema = z
  .array(
    z.object({
      id: z.string().regex(/^event_[1-9][0-9]*$/),
      minute: z.number().int().min(360).max(43560),
      type: z.string().max(100),
      actor: z.string().max(60),
      place: z.string().max(60),
      text: z.string().max(2000),
      witnesses: z.array(z.string().max(60)).max(100),
      data: z.record(z.string(), z.unknown()),
    }),
  )
  .min(1)
  .max(128)
  .superRefine((events, c) => {
    for (let i = 1; i < events.length; i++)
      if (
        Number(events[i]!.id.slice(6)) !==
        Number(events[i - 1]!.id.slice(6)) + 1
      )
        c.addIssue({ code: "custom", message: "Разрыв журнала" });
  });
export function checkJournal(events: { id: string }[], nextEvent: number) {
  if (
    events.length !== nextEvent - 1 ||
    events.some((e, i) => e.id !== `event_${i + 1}`)
  )
    throw Error(
      "Журнал неполон: восстановление остановлено, чтобы не потерять историю.",
    );
}
