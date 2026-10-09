import { cloudClient } from "./supabase.js";
export { cloudClient } from "./supabase.js";
import { z } from "zod";
import { authorized, sameOrigin } from "./auth.js";
import { projectSchema, takeMetadataSchema } from "../shared/schema.js";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function cloudGuard(request: Request) {
  if (!(await authorized(request)))
    return json({ error: "Войдите в студию" }, 401);
  if (!sameOrigin(request))
    return json({ error: "Недопустимый источник запроса" }, 403);
  return null;
}
export async function handleCloud(request: Request) {
  const denied = await cloudGuard(request);
  if (denied) return denied;
  const db = cloudClient();
  if (!db)
    return request.method === "GET"
      ? json({ configured: false })
      : json({ error: "Облачное хранилище не настроено" }, 503);
  try {
    if (request.method === "GET") {
      const [project, takes] = await Promise.all([
        db
          .from("studio_projects")
          .select("payload,revision")
          .eq("id", "main")
          .single(),
        db
          .from("studio_takes")
          .select("id,metadata,bytes,deleted_at")
          .order("created_at", { ascending: false })
          .limit(5001),
      ]);
      if (project.error || takes.error) throw new Error("read");
      if (takes.data.length > 5000)
        return json(
          {
            error:
              "В облаке больше 5000 дублей. Требуется постраничная загрузка.",
          },
          413,
        );
      return json({
        configured: true,
        project: projectSchema.parse(project.data.payload),
        revision: project.data.revision,
        takes: takes.data
          .filter((t) => !t.deleted_at)
          .map((t) => takeMetadataSchema.parse(t.metadata)),
        deletedIds: takes.data.filter((t) => t.deleted_at).map((t) => t.id),
        storedBytes: takes.data.reduce((sum, t) => sum + Number(t.bytes), 0),
      });
    }
    const raw = await request.text();
    if (raw.length > 1000000)
      return json({ error: "Запрос слишком большой" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Некорректный JSON" }, 400);
    }
    if (request.method === "PUT") {
      const parsed = z
        .object({
          project: projectSchema,
          revision: z.number().int().nonnegative(),
        })
        .safeParse(body);
      if (!parsed.success) return json({ error: "Некорректный проект" }, 400);
      const { data, error } = await db
        .from("studio_projects")
        .update({
          payload: parsed.data.project,
          revision: parsed.data.revision + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "main")
        .eq("revision", parsed.data.revision)
        .select("revision")
        .maybeSingle();
      if (error) throw new Error("write");
      if (!data)
        return json(
          {
            error:
              "Проект изменился на другом устройстве. Обновите облачные данные перед сохранением.",
          },
          409,
        );
      return json({ revision: data.revision });
    }
    if (request.method === "POST") {
      const parsed = takeMetadataSchema.safeParse(body);
      if (!parsed.success) return json({ error: "Некорректный дубль" }, 400);
      const t = parsed.data;
      const existing = await db
        .from("studio_takes")
        .select("id,deleted_at")
        .eq("id", t.id)
        .maybeSingle();
      if (existing.error) throw new Error("read");
      if (existing.data?.deleted_at)
        return json({ error: "Этот дубль удалён из облачного проекта" }, 409);
      if (existing.data) return json({ saved: true });
      const file = await db.storage.from("studio-audio").info(t.id + ".wav");
      if (file.error || !file.data)
        return json({ error: "Сначала загрузите аудио дубля" }, 400);
      const bytes = Number(file.data.size ?? file.data.metadata?.size);
      if (!Number.isFinite(bytes) || bytes < 1 || bytes > 4000000)
        return json({ error: "Некорректный размер аудио" }, 400);
      const { error } = await db.from("studio_takes").insert({
        id: t.id,
        npc_id: t.npcId,
        metadata: t,
        audio_path: t.id + ".wav",
        bytes,
        created_at: t.createdAt,
      });
      if (error && error.code !== "23505") throw new Error("insert");
      return json({ saved: true });
    }
    if (request.method === "PATCH" || request.method === "DELETE") {
      const parsed = z
        .object({ id: z.string().uuid(), favorite: z.boolean().optional() })
        .safeParse(body);
      if (!parsed.success) return json({ error: "Некорректный дубль" }, 400);
      const existing = await db
        .from("studio_takes")
        .select("metadata")
        .eq("id", parsed.data.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing.error) throw new Error("read");
      if (!existing.data) return json({ error: "Дубль не найден" }, 404);
      if (request.method === "PATCH" && parsed.data.favorite === undefined)
        return json({ error: "Укажите выбор дубля" }, 400);
      const update =
        request.method === "DELETE"
          ? { deleted_at: new Date().toISOString() }
          : {
              metadata: {
                ...existing.data.metadata,
                favorite: parsed.data.favorite,
              },
            };
      const { error } = await db
        .from("studio_takes")
        .update(update)
        .eq("id", parsed.data.id);
      if (error) throw new Error("update");
      return json({ saved: true });
    }
    return json({ error: "Метод не поддерживается" }, 405);
  } catch {
    console.error("cloud request failed", { method: request.method });
    return json(
      {
        error:
          "Не удалось связаться с облаком. Данные в браузере сохранены; повторите синхронизацию.",
      },
      502,
    );
  }
}
