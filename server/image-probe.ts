import { currentUser, sameOrigin } from "./auth.js";
import { cloudClient } from "./supabase.js";
const model = "gemini-nano-banana-2.1";
const bucket = "studio-images";
const resultPath = "4d66f0e7-cc1e-4b5e-8a43-4f843f77dc73";
const lockPath = "e5847d44-6980-4c96-8813-1301e9252c69";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const imageResponse = (data: Blob | Buffer, type: string) =>
  new Response(data, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Image-Model": model,
      "X-Content-Type-Options": "nosniff",
    },
  });

// Единственная согласованная проба: атомарная запись блокировки предотвращает повторную оплату.
export async function handleImageProbe(request: Request): Promise<Response> {
  const user = await currentUser(request);
  if (!user) return json({ error: "Войдите в студию" }, 401);
  if (user.app_metadata?.studio_role !== "admin" || !sameOrigin(request))
    return json({ error: "Проверка доступна администратору" }, 403);
  if (!["GET", "POST"].includes(request.method))
    return json({ error: "Метод не поддерживается" }, 405);
  const db = cloudClient();
  if (!db) return json({ error: "Облако не настроено" }, 503);
  const storage = db.storage.from(bucket);
  const cached = await storage.download(resultPath);
  if (cached.data)
    return imageResponse(cached.data, cached.data.type || "image/png");
  if (request.method === "GET")
    return json({ error: "Результат пробы пока отсутствует" }, 404);
  if (Date.now() > Date.parse("2026-10-17T00:00:00Z"))
    return json({ error: "Срок проведения пробы истёк" }, 410);
  const key = process.env.GEMINI_API_KEY;
  if (!key || process.env.GENERATION_ENABLED !== "true")
    return json({ error: "Генерация не настроена или выключена" }, 503);
  const lock = await storage.upload(
    lockPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
    { contentType: "image/png", upsert: false },
  );
  if (lock.error)
    return json(
      {
        error:
          "Проба уже запускалась либо не удалось зарезервировать запуск. Повторный платный запрос не отправлен.",
      },
      409,
    );
  try {
    const upstream = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          model,
          store: false,
          input:
            "Generate one illustration of a small cozy wooden countryside tavern at sunset, warm light in the windows, a flower garden, a peaceful rural setting. Painterly fantasy concept art, no text, no people. This is an API connectivity test illustration.",
          response_format: {
            type: "image",
            aspect_ratio: "1:1",
            image_size: "1K",
          },
        }),
      },
    );
    if (!upstream.ok) {
      const data = (await upstream.json().catch(() => ({}))) as {
        error?: { status?: string; message?: string };
      };
      const message = (data.error?.message || "Google отклонил генерацию")
        .split(key)
        .join("[скрыто]")
        .replace(/AIza[A-Za-z0-9_-]+/g, "[скрыто]")
        .slice(0, 1500);
      return json(
        {
          providerStatus: upstream.status,
          providerCode: data.error?.status,
          error: message,
          model,
          generationSucceeded: false,
        },
        upstream.status === 429 ? 429 : 502,
      );
    }
    const data = (await upstream.json()) as {
      steps?: {
        type?: string;
        content?: { type?: string; data?: string; mime_type?: string }[];
      }[];
    };
    const image = data.steps
      ?.filter((s) => s.type === "model_output")
      .flatMap((s) => s.content || [])
      .find((c) => c.type === "image" && c.data);
    if (!image?.data)
      return json(
        { error: "Google ответил, но не вернул изображение", model },
        502,
      );
    const bytes = Buffer.from(image.data, "base64");
    const type = image.mime_type || "image/png";
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(type) ||
      bytes.length > 3000000
    )
      return json(
        { error: "Изображение не соответствует формату хранения" },
        502,
      );
    const saved = await storage.upload(resultPath, bytes, {
      contentType: type,
      upsert: false,
    });
    if (saved.error)
      return json(
        {
          error:
            "Google создал изображение, но сохранить его не удалось. Повторная генерация заблокирована.",
        },
        502,
      );
    return imageResponse(bytes, type);
  } catch {
    return json(
      {
        error:
          "Проба не завершилась вовремя. Автоматическая повторная генерация не выполнялась.",
      },
      504,
    );
  }
}

