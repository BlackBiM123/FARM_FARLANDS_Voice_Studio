import { z } from "zod";
import { cloudClient, cloudGuard } from "./cloud.js";
export async function handleAudio(request: Request) {
  const denied = cloudGuard(request);
  if (denied) return denied;
  const db = cloudClient();
  if (!db)
    return Response.json({ error: "Облако не настроено" }, { status: 503 });
  const parsed = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success)
    return Response.json({ error: "Некорректный ID аудио" }, { status: 400 });
  const path = parsed.data + ".wav";
  try {
    if (request.method === "PUT") {
      if (!request.headers.get("content-type")?.startsWith("audio/wav"))
        return Response.json(
          { error: "Поддерживается только WAV" },
          { status: 415 },
        );
      if (Number(request.headers.get("content-length")) > 4000000)
        return Response.json(
          { error: "Аудио слишком большое" },
          { status: 413 },
        );
      const wav = Buffer.from(await request.arrayBuffer());
      if (wav.length > 4000000)
        return Response.json(
          { error: "Аудио слишком большое" },
          { status: 413 },
        );
      if (
        wav.length < 44 ||
        wav.subarray(0, 4).toString() !== "RIFF" ||
        wav.subarray(8, 12).toString() !== "WAVE"
      )
        return Response.json({ error: "Некорректный WAV" }, { status: 400 });
      const { error } = await db.storage
        .from("studio-audio")
        .upload(path, wav, { contentType: "audio/wav", upsert: false });
      if (error && Number(error.statusCode) !== 409) throw new Error("upload");
      return Response.json({ uploaded: true });
    }
    if (request.method === "GET") {
      const take = await db
        .from("studio_takes")
        .select("id")
        .eq("id", parsed.data)
        .is("deleted_at", null)
        .maybeSingle();
      if (take.error) throw new Error("read");
      if (!take.data)
        return Response.json({ error: "Дубль не найден" }, { status: 404 });
      const { data, error } = await db.storage
        .from("studio-audio")
        .download(path);
      if (error || !data) throw new Error("download");
      return new Response(data, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return Response.json({ error: "Метод не поддерживается" }, { status: 405 });
  } catch {
    console.error("cloud audio failed", { method: request.method });
    return Response.json(
      { error: "Не удалось сохранить или загрузить аудио из облака" },
      { status: 502 },
    );
  }
}
