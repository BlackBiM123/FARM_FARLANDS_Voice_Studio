import { currentUser, sameOrigin } from "./auth.js";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function handleModels(request: Request): Promise<Response> {
  const user = await currentUser(request);
  if (!user) return json({ error: "Войдите в студию" }, 401);
  if (user.app_metadata?.studio_role !== "admin" || !sameOrigin(request))
    return json({ error: "Проверка доступна администратору" }, 403);
  if (request.method !== "GET")
    return json({ error: "Метод не поддерживается" }, 405);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ configured: false }, 503);
  try {
    const models: { name: string; displayName: string; methods: string[] }[] =
      [];
    let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const url = new URL(
        "https://generativelanguage.googleapis.com/v1beta/models",
      );
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        return json(
          {
            configured: true,
            keyAccepted: false,
            providerStatus: response.status,
          },
          502,
        );
      const data = (await response.json()) as {
        models?: {
          name?: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
        }[];
        nextPageToken?: string;
      };
      for (const model of data.models || []) {
        if (model.name && /image|imagen|nano-banana/i.test(model.name))
          models.push({
            name: model.name,
            displayName: model.displayName || model.name,
            methods: model.supportedGenerationMethods || [],
          });
      }
      pageToken = data.nextPageToken || "";
      if (!pageToken) break;
    }
    return json({
      configured: true,
      keyAccepted: true,
      imageModels: models,
      complete: !pageToken,
      generationPerformed: false,
      billingAndQuotaVerified: false,
    });
  } catch {
    return json({ error: "Не удалось запросить список моделей Google" }, 502);
  }
}
