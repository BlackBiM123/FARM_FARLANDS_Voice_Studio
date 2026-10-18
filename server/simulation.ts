import { createHash } from "node:crypto";
import { cloudClient, cloudGuard } from "./cloud.js";
import { reportSchema } from "../shared/world.js";
import { z } from "zod";
const bucket = "studio-world-runs";
export async function handleSimulation(request: Request) {
  const denied = await cloudGuard(request);
  if (denied) return denied;
  const db = cloudClient();
  if (!db)
    return Response.json({ error: "Облако не настроено" }, { status: 503 });
  const headers = { "Cache-Control": "no-store" };
  try {
    const url = new URL(request.url),
      rawId = url.searchParams.get("id");
    if (request.method === "GET" && !rawId) {
      const { data, error } = await db.storage
        .from(bucket)
        .list("", {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });
      if (error) {
        const info = await db.storage.getBucket(bucket);
        if (info.error) return Response.json({ runs: [] }, { headers });
        throw error;
      }
      return Response.json(
        {
          runs: data
            .filter((x) => x.name.endsWith(".json"))
            .map((x) => ({ id: x.name.slice(0, -5), createdAt: x.created_at })),
        },
        { headers },
      );
    }
    const id = z.string().uuid().safeParse(rawId);
    if (!id.success)
      return Response.json(
        { error: "Некорректный ID запуска" },
        { status: 400, headers },
      );
    if (request.method === "GET") {
      const { data, error } = await db.storage
        .from(bucket)
        .download(id.data + ".json");
      if (error || !data)
        return Response.json(
          { error: "Запуск не найден" },
          { status: 404, headers },
        );
      return new Response(data, {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    if (request.method !== "PUT")
      return Response.json(
        { error: "Метод не поддерживается" },
        { status: 405, headers },
      );
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 3500000)
      return Response.json(
        { error: "Отчёт больше 3,5 МБ. Экспортируйте файл локально." },
        { status: 413, headers },
      );
    let report;
    try {
      report = reportSchema.parse(JSON.parse(raw));
    } catch {
      return Response.json(
        { error: "Некорректный отчёт симуляции" },
        { status: 400, headers },
      );
    }
    if (
      report.contentHash !== report.state.contentHash ||
      createHash("sha256")
        .update(JSON.stringify(report.definition))
        .digest("hex") !== report.contentHash
    )
      return Response.json(
        { error: "Версии снимка и определений расходятся" },
        { status: 400, headers },
      );
    const info = await db.storage.getBucket(bucket);
    if (info.error) {
      const created = await db.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 3500000,
        allowedMimeTypes: ["application/json"],
      });
      if (created.error) {
        const retry = await db.storage.getBucket(bucket);
        if (retry.error) throw created.error;
      }
    }
    const { error } = await db.storage
      .from(bucket)
      .upload(id.data + ".json", JSON.stringify(report), {
        contentType: "application/json",
        upsert: false,
      });
    if (error)
      return Response.json(
        {
          error:
            "Не удалось сохранить снимок; существующие снимки не перезаписываются",
        },
        { status: 409, headers },
      );
    return Response.json({ saved: true, id: id.data }, { headers });
  } catch {
    return Response.json(
      { error: "Не удалось связаться с облаком запусков" },
      { status: 502, headers },
    );
  }
}
