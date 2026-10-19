import type { WorldEvent } from "../shared/world";
function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("farlands-world-journal", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("events", { keyPath: ["journal", "number"] });
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
}
export async function appendJournal(journal: string, events: WorldEvent[]) {
  if (!events.length) return;
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction("events", "readwrite");
      for (const event of events)
        tx.objectStore("events").put({
          journal,
          number: Number(event.id.slice(6)),
          event,
        });
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  }).finally(() => db.close());
}
export async function readJournal(journal: string): Promise<WorldEvent[]> {
  const db = await database();
  return new Promise<WorldEvent[]>((resolve, reject) => {
    try {
      const tx = db.transaction("events", "readonly"),
        r = tx
          .objectStore("events")
          .getAll(
            IDBKeyRange.bound([journal, 0], [journal, Number.MAX_SAFE_INTEGER]),
          );
      r.onsuccess = () => resolve(r.result.map((row) => row.event));
      r.onerror = () => reject(r.error);
    } catch (e) {
      reject(e);
    }
  }).finally(() => db.close());
}
export async function journalHash(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
