import type { WorldDefinition, WorldState } from "../shared/world";
import { reportSchema } from "../shared/world";
export type WorldReport = {
  version: 1;
  coreVersion: "farlands-core-1";
  contentHash: string;
  definition: WorldDefinition;
  state: WorldState;
};
export function parseReport(raw: unknown): WorldReport {
  return reportSchema.parse(raw) as WorldReport;
}
export function saveLocalReport(report: WorldReport) {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("farlands-world-runs", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("runs");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result,
        tx = db.transaction("runs", "readwrite");
      tx.objectStore("runs").put(JSON.parse(JSON.stringify(report)), "latest");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
export function loadLocalReport() {
  return new Promise<WorldReport | null>((resolve) => {
    const req = indexedDB.open("farlands-world-runs", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("runs");
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result,
        tx = db.transaction("runs", "readonly"),
        get = tx.objectStore("runs").get("latest");
      get.onsuccess = () => {
        try {
          resolve(get.result ? parseReport(get.result) : null);
        } catch {
          resolve(null);
        }
      };
      get.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    };
  });
}
export function downloadWorld(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function formatWorldTime(minute: number) {
  return (
    "День " +
    (Math.floor(minute / 1440) + 1) +
    " · " +
    String(Math.floor((minute % 1440) / 60)).padStart(2, "0") +
    ":" +
    String(minute % 60).padStart(2, "0")
  );
}
export function checkWorld(report: WorldReport) {
  const s = report.state,
    w = report.definition,
    total = Object.values(s.accounts).reduce((a, b) => a + b, 0),
    errors: string[] = [];
  if (total !== s.baselineMoney) errors.push("Нарушен баланс денег");
  for (const [item, baseline] of Object.entries(s.baselineItems)) {
    let current = w.stocks
      .filter((x) => x.item === item)
      .reduce((v, x) => v + (s.stocks[x.id] ?? 0), 0);
    for (const a of Object.values(s.agents)) {
      const cargo = (a as any).cargo;
      if (cargo?.item === item) current += cargo.amount;
    }
    if (
      current !==
      baseline + (s.produced[item] ?? 0) - (s.consumed[item] ?? 0)
    )
      errors.push("Нарушен баланс: " + item);
  }
  if (JSON.stringify(s.protectedFacts) !== JSON.stringify(w.protectedFacts))
    errors.push("Изменены защищённые факты");
  return errors;
}
