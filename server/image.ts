import { z } from "zod";
import { cloudClient, cloudGuard } from "./cloud.js";
const bucket = "studio-images";
const json = (error: string, status: number) =>
  Response.json({ error }, { status });
export async function handleImage(request: Request) {
  const denied = await cloudGuard(request);
  if (denied) return denied;
  const db = cloudClient();
  if (!db) return json("Облако не настроено", 503);
  const id = z
    .string()
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return json("Некорректный ID изображения", 400);
  const path = id.data;
  try {
    if (request.method === "GET") {
      const { data, error } = await db.storage.from(bucket).download(path);
      if (error || !data) return json("Изображение не найдено", 404);
      return new Response(data, {
        headers: {
          "Content-Type": data.type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (request.method !== "PUT") return json("Метод не поддерживается", 405);
    const type = request.headers.get("content-type")?.split(";")[0] || "";
    if (!["image/png", "image/jpeg", "image/webp"].includes(type))
      return json("Нужен PNG, JPG или WebP", 415);
    if (Number(request.headers.get("content-length")) > 3000000)
      return json("Изображение больше 3 МБ", 413);
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length > 3000000) return json("Изображение больше 3 МБ", 413);
    const valid =
      type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid) return json("Некорректное изображение", 400);
    const info = await db.storage.getBucket(bucket);
    if (info.error) {
      const created = await db.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 3000000,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      });
      if (created.error) {
        const retry = await db.storage.getBucket(bucket);
        if (retry.error) throw Error("bucket");
      }
    }
    const { error } = await db.storage
      .from(bucket)
      .upload(path, bytes, { contentType: type, upsert: false });
    if (error)
      return json(
        "Не удалось загрузить изображение",
        Number(error.statusCode) === 409 ? 409 : 502,
      );
    return Response.json({ url: "/api/image?id=" + id.data });
  } catch {
    console.error("Image storage failed", { method: request.method });
    return json("Не удалось загрузить изображение", 502);
  }
}
