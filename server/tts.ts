import { timingSafeEqual, randomBytes } from "node:crypto";
import { generationSchema } from "../shared/schema.js";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function handleTTS(request: Request): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "Метод не поддерживается" }, 405);
  const secret = process.env.STUDIO_ACCESS_TOKEN,
    supplied =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    secret.length < 24 ||
    Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
  )
    return json({ error: "Введите действительный код доступа к студии" }, 401);
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !== new URL(request.url).origin &&
    origin !== process.env.STUDIO_ORIGIN
  )
    return json({ error: "Недопустимый источник запроса" }, 403);
  if (process.env.GENERATION_ENABLED !== "true")
    return json(
      {
        error:
          "Генерация выключена на сервере. Владелец должен подтвердить включение API после проверки квот.",
      },
      503,
    );
  if (!process.env.GEMINI_API_KEY)
    return json({ error: "На сервере не настроен Gemini API" }, 503);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 12000)
    return json({ error: "Запрос слишком большой" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Некорректный JSON" }, 400);
  }
  const parsed = generationSchema.safeParse(body);
  if (!parsed.success)
    return json({ error: "Проверьте текст и настройки голоса" }, 400);
  const s = parsed.data,
    requestId = randomBytes(6).toString("hex");
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": process.env.GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          model: s.model,
          store: false,
          input: [
            {
              type: "user_input",
              content: [
                {
                  type: "text",
                  text: s.text,
                  annotations: [
                    {
                      type: "speech_metadata",
                      style: `Language: ${s.language === "ru" ? "Russian" : "English"}. Emotion: ${s.emotion}. Speaking pace: ${s.pace}x relative to normal. ${s.direction}`,
                    },
                  ],
                },
              ],
            },
          ],
          response_format: {
            type: "audio",
            mime_type: "audio/wav",
            sample_rate: 24000,
          },
          generation_config: { speech_config: [{ voice: s.voice }] },
        }),
      },
    );
    if (!response.ok) {
      console.error("tts upstream", { requestId, status: response.status });
      return json(
        {
          error:
            response.status === 429
              ? "Квота Gemini исчерпана. Проверьте AI Studio."
              : response.status === 404
                ? "Модель недоступна для вашего проекта."
                : "Gemini отклонил запрос. Проверьте доступ и биллинг в AI Studio.",
          requestId,
        },
        response.status === 429 ? 429 : 502,
      );
    }
    const data = (await response.json()) as {
      steps?: { type: string; content?: { type: string; data?: string }[] }[];
    };
    const audio = data.steps
      ?.filter((x) => x.type === "model_output")
      .flatMap((x) => x.content ?? [])
      .filter((x) => x.type === "audio")
      .at(-1)?.data;
    if (!audio)
      return json({ error: "Gemini не вернул аудио", requestId }, 502);
    const wav = Buffer.from(audio, "base64");
    if (
      wav.subarray(0, 4).toString() !== "RIFF" ||
      wav.subarray(8, 12).toString() !== "WAVE"
    )
      return json({ error: "Неподдерживаемый формат аудио" }, 502);
    if (wav.length > 4000000)
      return json({ error: "Аудио слишком длинное. Сократите реплику." }, 413);
    return new Response(wav, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch {
    console.error("tts failure", { requestId });
    return json(
      { error: "Сервис не ответил вовремя. Повторите позже.", requestId },
      504,
    );
  }
}
