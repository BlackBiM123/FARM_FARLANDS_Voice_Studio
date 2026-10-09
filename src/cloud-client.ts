import {
  projectSchema,
  takeMetadataSchema,
  type TakeMetadata,
} from "../shared/schema";
import type { Take } from "./storage";
export async function authenticatedFetch(path: string, options?: RequestInit) {
  let r = await fetch(path, options);
  if (r.status === 401) {
    try {
      const refreshed = await fetch("/api/session");
      const state = await refreshed.json();
      if (state.authenticated) r = await fetch(path, options);
    } catch {}
    if (r.status === 401) window.dispatchEvent(new Event("studio-auth-lost"));
  }
  return r;
}
export class CloudError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function cloudRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const binary = body instanceof Blob;
  const r = await authenticatedFetch(path, {
    method,
    headers: body
      ? { "Content-Type": binary ? "audio/wav" : "application/json" }
      : {},
    body: body ? (binary ? body : JSON.stringify(body)) : undefined,
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new CloudError(data.error ?? "Ошибка облачного сохранения", r.status);
  }
  return r.json();
}
export async function readCloud() {
  const data = await cloudRequest("/api/cloud");
  if (!data.configured) return null;
  return {
    project: projectSchema.parse(data.project),
    revision: Number(data.revision),
    takes: (data.takes as unknown[]).map((t) => takeMetadataSchema.parse(t)),
    deletedIds: data.deletedIds as string[],
    storedBytes: Number(data.storedBytes),
  };
}
export function takeMetadata(t: Take): TakeMetadata {
  return takeMetadataSchema.parse({ ...t, settings: { ...t.settings } });
}
export async function uploadTake(t: Take) {
  await cloudRequest(
    "/api/audio?id=" + encodeURIComponent(t.id),
    "PUT",
    t.blob,
  );
  await cloudRequest("/api/cloud", "POST", takeMetadata(t));
}
export async function downloadTake(t: Take) {
  if (t.blob.size) return t.blob;
  const r = await authenticatedFetch(
    "/api/audio?id=" + encodeURIComponent(t.id),
  );
  if (!r.ok) throw new Error("Не удалось скачать аудио из облака");
  return r.blob();
}
