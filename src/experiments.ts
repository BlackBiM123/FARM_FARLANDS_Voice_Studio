import { z } from "zod";
import {
  worldSchema,
  type WorldDefinition,
  type WorldEvent,
} from "../shared/world";
import { checkWorld, parseReport, type WorldReport } from "./world-runs";
export const experimentSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  minutes: z.number().int().min(1).max(43200),
  scenario: z.enum(["normal", "no_food", "no_money", "closed"]),
  participants: z.array(z.string()).min(1).max(200),
  checks: z
    .array(z.enum(["money", "goods", "routes", "journal", "restore"]))
    .min(1),
  world: worldSchema,
});
export type Experiment = z.infer<typeof experimentSchema>;
export type Check = {
  id: string;
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
};
export type ExperimentResult = {
  version: 1;
  id: string;
  createdAt: string;
  experiment: Experiment;
  status: "complete" | "cancelled" | "error" | "checkpoint";
  error?: string;
  report: WorldReport;
  checks: Check[];
  elapsedMs: number;
};
export const checkNames = {
  money: "Сохранение денег",
  goods: "Баланс и неотрицательные запасы",
  routes: "Путь и время путешествий",
  journal: "Целостность полного журнала",
  restore: "Точное восстановление на середине",
};
export const scenarioNames = {
  normal: "Обычный мир",
  no_food: "Нет начальной еды",
  no_money: "Нет личных денег",
  closed: "Все дороги закрыты",
};
export function prepareExperiment(e: Experiment): WorldDefinition {
  const w = structuredClone(e.world);
  w.agents = w.agents.filter((a) => e.participants.includes(a.id));
  if (!w.agents.length) throw Error("Выберите хотя бы одного участника");
  const food = w.cooking?.enabled ? w.cooking.output : "potato";
  if (e.scenario === "no_food")
    for (const s of w.stocks) if (s.item === food) s.amount = 0;
  if (e.scenario === "no_money")
    for (const a of w.accounts)
      if (w.agents.some((n) => n.account === a.id)) a.balance = 0;
  if (e.scenario === "closed") for (const r of w.routes) r.open = false;
  return worldSchema.parse(w);
}
function shortest(w: WorldDefinition, from: string, to: string) {
  const dist = new Map<string, number>([[from, 0]]),
    todo = new Set(w.places.filter((p) => p.exists).map((p) => p.id));
  while (todo.size) {
    const at = [...todo].sort(
      (a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity),
    )[0]!;
    todo.delete(at);
    const d = dist.get(at) ?? Infinity;
    if (at === to) return d;
    if (!Number.isFinite(d)) break;
    for (const r of w.routes.filter(
      (r) => r.open && r.mode === "walk" && (r.from === at || r.to === at),
    )) {
      const next = r.from === at ? r.to : r.from;
      if (todo.has(next))
        dist.set(next, Math.min(dist.get(next) ?? Infinity, d + r.minutes));
    }
  }
  return Infinity;
}
export function auditExperiment(
  e: Experiment,
  r: WorldReport,
  restored?: boolean,
): Check[] {
  const events = r.archive ?? [],
    errors = checkWorld(r);
  return e.checks.map((id) => {
    let issues: string[] = [];
    if (id === "money") issues = errors.filter((x) => x.includes("денег"));
    if (id === "goods") {
      issues = errors.filter((x) => x.includes("баланс:"));
      for (const [key, n] of Object.entries(r.state.stocks))
        if (n < 0) issues.push(`Отрицательный запас ${key}`);
    }
    if (id === "journal") {
      if (events.length !== r.state.nextEvent - 1)
        issues.push("Число записей не совпало со счётчиком ядра");
      for (let i = 0; i < events.length; i++)
        if (events[i]!.id !== `event_${i + 1}`) {
          issues.push(`Разрыв возле события ${i + 1}`);
          break;
        }
    }
    if (id === "routes") {
      if (!events.some((e) => e.type === "arrive"))
        return {
          id,
          name: checkNames[id],
          status: "skip",
          detail:
            "В этом отрезке не было завершённых путешествий. Для проверки нужен более длинный прогон или другой сценарий.",
        };
      const trips = new Map<string, WorldEvent>();
      for (const ev of events) {
        if (ev.type === "travel") trips.set(ev.actor, ev);
        if (ev.type === "arrive") {
          const trip = trips.get(ev.actor);
          if (
            !trip ||
            ev.place !== trip.data.to ||
            ev.minute - trip.minute <
              shortest(r.definition, trip.place, ev.place)
          )
            issues.push(
              `${ev.actor}, минута ${ev.minute}: прибытие без допустимого пути/времени`,
            );
          trips.delete(ev.actor);
          if (issues.length >= 10) break;
        }
      }
    }
    if (id === "restore")
      return {
        id,
        name: checkNames[id],
        status: restored === undefined ? "skip" : restored ? "pass" : "fail",
        detail:
          restored === undefined
            ? "Не выполнено: нужен завершённый повторный прогон."
            : restored
              ? "Состояние и полный журнал совпали с продолжением JSON-снимка на середине."
              : "Состояние или журнал отличаются после восстановления.",
      };
    return {
      id,
      name: checkNames[id],
      status: issues.length ? "fail" : "pass",
      detail: issues.length
        ? issues.join("; ")
        : id === "routes"
          ? "Все зарегистрированные прибытия согласованы с открытыми путями и минимальным временем. Это не проверка визуальной карты."
          : id === "journal"
            ? `${events.length} событий без разрывов и повторов.`
            : "Проверено по фактическому состоянию ядра.",
    };
  });
}
export function parseExperimentResult(value: unknown): ExperimentResult {
  const s = z
    .object({
      version: z.literal(1),
      id: z.string(),
      createdAt: z.string(),
      experiment: experimentSchema,
      status: z.enum(["complete", "cancelled", "error", "checkpoint"]),
      error: z.string().optional(),
      report: z.unknown(),
      checks: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          status: z.enum(["pass", "fail", "skip"]),
          detail: z.string(),
        }),
      ),
      elapsedMs: z.number().nonnegative(),
    })
    .parse(value);
  const report = parseReport(s.report);
  if (!report.archive) throw Error("Нужен полный архив отчёта");
  if (stable(report.definition) !== stable(prepareExperiment(s.experiment)))
    throw Error("Определение отчёта не соответствует сценарию");
  if (
    s.status === "complete" &&
    report.state.minute !== 360 + s.experiment.minutes
  )
    throw Error("Завершённый отчёт не дошёл до заданного времени");
  // Imported labels never serve as proof: recompute invariants; replay requires a fresh run.
  return { ...s, report, checks: auditExperiment(s.experiment, report) };
}
export async function experimentStore(
  action: "list" | "put" | "delete",
  value?: ExperimentResult | string,
): Promise<ExperimentResult[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("farlands-experiments", 1);
    open.onupgradeneeded = () =>
      open.result.createObjectStore("results", { keyPath: "id" });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result,
        tx = db.transaction(
          "results",
          action === "list" ? "readonly" : "readwrite",
        ),
        s = tx.objectStore("results");
      let all: ExperimentResult[] = [];
      if (action === "put") s.put(JSON.parse(JSON.stringify(value)));
      if (action === "delete") s.delete(value as string);
      const req = s.getAll();
      req.onsuccess = () => {
        all = req.result;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error ?? Error("Хранилище недоступно"));
      };
    };
  });
}
export function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
