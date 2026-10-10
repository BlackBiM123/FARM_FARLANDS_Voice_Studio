import { projectSchema, type NPC, type Settings } from "../shared/schema";
export type Take = {
  remote?: boolean;
  gameCharacter?: boolean;
  id: string;
  npcId: string;
  text: string;
  settings: Settings;
  language: "ru" | "en";
  createdAt: string;
  blob: Blob;
  favorite: boolean;
};
function openDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("farlands-studio", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("takes", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function takesDB(
  mode: "read" | "put" | "delete",
  take?: Take,
  id?: string,
): Promise<Take[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      "takes",
      mode === "read" ? "readonly" : "readwrite",
    );
    const store = tx.objectStore("takes");
    const r =
      mode === "read"
        ? store.getAll()
        : mode === "put"
          ? store.put(
              take ? { ...take, settings: { ...take.settings } } : undefined,
            )
          : store.delete(id!);
    let result: Take[] = [];
    r.onsuccess = () => {
      if (mode === "read") result = r.result as Take[];
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export function loadProject(fallback: NPC[]) {
  try {
    const raw = localStorage.getItem("farlands-empty-studio-project");
    if (raw) return projectSchema.parse(JSON.parse(raw)).npcs;
  } catch {}
  return structuredClone(fallback);
}
export function loadGameCharacter() {
  try {
    const raw = localStorage.getItem("farlands-empty-studio-project");
    return raw ? projectSchema.parse(JSON.parse(raw)).gameCharacter : true;
  } catch {
    return true;
  }
}
export function loadFamilies() {
  try {
    return projectSchema.parse(
      JSON.parse(
        localStorage.getItem("farlands-empty-studio-project") || "null",
      ),
    ).families;
  } catch {
    return [];
  }
}
export function saveProject(
  npcs: NPC[],
  gameCharacter = true,
  families: import("../shared/family").Family[] = [],
  content: Pick<
    import("zod").infer<typeof projectSchema>,
    "dialogueGroups" | "dialogueLines" | "scenarios"
  > = { dialogueGroups: [], dialogueLines: [], scenarios: [] },
) {
  localStorage.setItem(
    "farlands-empty-studio-project",
    JSON.stringify({ version: 1, npcs, gameCharacter, families, ...content }),
  );
}
export function loadContent() {
  try {
    const p = projectSchema.parse(
      JSON.parse(
        localStorage.getItem("farlands-empty-studio-project") || "null",
      ),
    );
    return {
      dialogueGroups: p.dialogueGroups,
      dialogueLines: p.dialogueLines,
      scenarios: p.scenarios,
    };
  } catch {
    return { dialogueGroups: [], dialogueLines: [], scenarios: [] };
  }
}
