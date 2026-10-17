import { authenticatedFetch } from "./cloud-client";
export async function readCharacterPhoto(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 3000000
  )
    throw Error("Выберите JPG, PNG или WebP до 3 МБ");
  const bitmap = await createImageBitmap(file);
  bitmap.close();
  if (file.size <= 350000)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("Не удалось прочитать изображение"));
      reader.readAsDataURL(file);
    });
  const response = await authenticatedFetch(
    "/api/image?id=" + crypto.randomUUID(),
    {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    },
  );
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Ошибка загрузки изображения");
  return data.url;
}
