import { currentUser, sameOrigin } from "./auth.js";
import {
  customVoiceId,
  designRequestSchema,
} from "../shared/designed-voice.js";
import { quotaDetails } from "./quota.js";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const endpoint = "https://generativelanguage.googleapis.com/v1beta/voices";
type ProviderVoice = {
  id?: string;
  display_name?: string;
  gender?: string;
  description?: string;
  prompted?: { input?: string };
  expire_time?: string;
  sample_audio?: { data?: string; mime_type?: string };
};
function metadata(v: ProviderVoice) {
  return {
    id: v.id,
    name: (v.display_name || v.id || "Свой голос").slice(0, 80),
    gender: (v.gender || "neutral").slice(0, 30),
    description: (v.prompted?.input || v.description || "").slice(0, 1500),
    expiresAt: v.expire_time,
  };
}
export async function handleVoices(request: Request): Promise<Response> {
  const user = await currentUser(request);
  if (!user) return json({ error: "Войдите в студию" }, 401);
  if (!sameOrigin(request))
    return json({ error: "Недопустимый источник запроса" }, 403);
  if (!["GET", "POST"].includes(request.method))
    return json({ error: "Метод не поддерживается" }, 405);
  if (request.method === "POST" && user.app_metadata?.studio_role !== "admin")
    return json({ error: "Создавать голоса может администратор" }, 403);
  if (!process.env.GEMINI_API_KEY)
    return json({ error: "На сервере не настроен Gemini API" }, 503);
  let target = endpoint,
    payload: unknown;
  const id = new URL(request.url).searchParams.get("id");
  if (request.method === "GET" && id) {
    if (!customVoiceId.safeParse(id).success)
      return json({ error: "Некорректный ID голоса" }, 400);
    target += "/" + encodeURIComponent(id);
  }
  if (request.method === "GET" && !id) target += "?type=prompted&page_size=200";
  if (request.method === "POST") {
    if (process.env.GENERATION_ENABLED !== "true")
      return json({ error: "Генерация выключена на сервере" }, 503);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 12000)
      return json({ error: "Запрос слишком большой" }, 413);
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: "Некорректный JSON" }, 400);
    }
    const parsed = designRequestSchema.safeParse(data);
    if (!parsed.success)
      return json({ error: "Проверьте описание голоса" }, 400);
    const v = parsed.data;
    payload = {
      store: true,
      voice: {
        model: "gemini-3.8-flash-tts",
        type: "prompted",
        display_name: v.name,
        gender: v.gender,
        language_code: v.language,
        prompted: { input: v.description },
      },
    };
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(90000),
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!upstream.ok) {
      const data = (await upstream.json().catch(() => ({}))) as {
        error?: { status?: string; message?: string };
      };
      const status = upstream.status;
      const policyBlocked =
        status === 400 &&
        /blocked by safety policies/i.test(data.error?.message ?? "");
      const diagnostic =
        status === 400 && typeof data.error?.message === "string"
          ? data.error.message
              .split(process.env.GEMINI_API_KEY!)
              .join("[скрыто]")
              .replace(/AIza[A-Za-z0-9_-]+/g, "[скрыто]")
              .slice(0, 500)
          : "";
      return json(
        {
          error:
            status === 429
              ? "Квота создания голосов Gemini исчерпана. Платный тариф автоматически не подключается."
              : status === 404
                ? "Gemini Voice Design недоступен для этого API-проекта."
                : status === 403
                  ? "Gemini не разрешает Voice Design для этого проекта или региона."
                  : policyBlocked
                    ? "Google заблокировал это описание голоса по своим правилам безопасности. Тембр не создан. Детские описания могут быть недоступны в Gemini Voice Design."
                    : status === 400
                      ? "Gemini отклонил описание голоса или параметры создания. " +
                        diagnostic
                      : "Gemini не смог выполнить запрос создания голоса.",
          providerStatus: status,
          policyBlocked,
          providerCode:
            typeof data.error?.status === "string"
              ? data.error.status
              : undefined,
          ...(status === 429
            ? { quota: quotaDetails(data, upstream.headers.get("retry-after")) }
            : {}),
        },
        status === 429 ? 429 : status === 404 ? 404 : 502,
      );
    }
    const data = (await upstream.json()) as ProviderVoice & {
      voices?: ProviderVoice[];
      next_page_token?: string;
    };
    if (request.method === "GET" && id) {
      const sample = (data as ProviderVoice).sample_audio;
      if (!sample?.data || sample.mime_type !== "audio/wav")
        return json({ error: "У голоса нет WAV-примера" }, 404);
      const wav = Buffer.from(sample.data, "base64");
      if (
        wav.length > 4000000 ||
        wav.subarray(0, 4).toString() !== "RIFF" ||
        wav.subarray(8, 12).toString() !== "WAVE"
      )
        return json({ error: "Некорректный формат примера" }, 502);
      return new Response(wav, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (request.method === "GET")
      return json({
        voices: (Array.isArray(data.voices) ? data.voices : [])
          .filter((v: ProviderVoice) => customVoiceId.safeParse(v.id).success)
          .map(metadata),
        nextPageToken: data.next_page_token || null,
      });
    if (!customVoiceId.safeParse(data.id).success)
      return json({ error: "Gemini не вернул ID созданного голоса" }, 502);
    return json({ voice: metadata(data) }, 201);
  } catch {
    return json(
      {
        error:
          "Gemini не ответил вовремя. Обновите список голосов перед повторной попыткой: голос мог уже сохраниться.",
      },
      504,
    );
  }
}
