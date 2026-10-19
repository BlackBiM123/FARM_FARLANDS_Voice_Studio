import { createHash } from "node:crypto";
import { cloudClient, cloudGuard } from "./cloud.js";
import { reportSchema } from "../shared/world.js";
import { z } from "zod";
import { journalPageSchema } from "../shared/journal.js";
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
    const part = url.searchParams.get("part");
    if (part !== null) {
      if (!/^[a-f0-9]{64}$/.test(part))
        return Response.json(
          { error: "Некорректная страница журнала" },
          { status: 400, headers },
        );
      const path = "journal/" + part + ".json";
      if (request.method === "GET") {
        const result = await db.storage.from(bucket).download(path);
        return result.error || !result.data
          ? Response.json(
              { error: "Страница журнала не найдена" },
              { status: 404, headers },
            )
          : new Response(result.data, {
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
          { error: "Страница слишком велика" },
          { status: 413, headers },
        );
      let events;
      try {
        events = journalPageSchema.parse(JSON.parse(raw));
      } catch {
        return Response.json(
          { error: "Некорректная страница журнала" },
          { status: 400, headers },
        );
      }
      const body = JSON.stringify(events);
      if (createHash("sha256").update(body).digest("hex") !== part)
        return Response.json(
          { error: "Хеш журнала не совпадает" },
          { status: 400, headers },
        );
      const info = await db.storage.getBucket(bucket);
      if (info.error) {
        const created = await db.storage.createBucket(bucket, {
          public: false,
          fileSizeLimit: 3500000,
          allowedMimeTypes: ["application/json"],
        });
        if (created.error && (await db.storage.getBucket(bucket)).error)
          throw created.error;
      }
      const result = await db.storage
        .from(bucket)
        .upload(path, body, { contentType: "application/json", upsert: false });
      if (result.error) {
        const previous = await db.storage.from(bucket).download(path);
        if (
          previous.error ||
          !previous.data ||
          createHash("sha256")
            .update(await previous.data.text())
            .digest("hex") !== part
        )
          throw result.error;
      }
      return Response.json({ saved: true, hash: part }, { headers });
    }
    if (request.method === "GET" && !rawId) {
      const { data, error } = await db.storage.from(bucket).list("", {
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
      if (report.state.journalMode === "external") {
        if (
          !report.journal ||
          report.journal.count !== report.state.nextEvent - 1
        )
          throw Error("Нет полного журнала");
        let cursor = 1;
        for (const part of report.journal.parts) {
          if (
            part.first !== cursor ||
            part.count < 1 ||
            part.count > 128 ||
            part.last !== part.first + part.count - 1
          )
            throw Error("Разрыв журнала");
          cursor = part.last + 1;
        }
        if (cursor !== report.state.nextEvent) throw Error("Неполный журнал");
      }
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
