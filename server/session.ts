import {
  authorized,
  cookieName,
  makeSession,
  sameOrigin,
  validCode,
} from "./auth.js";
export async function handleSession(request: Request) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (!sameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса" },
      { status: 403, headers },
    );
  if (request.method === "GET")
    return Response.json({ authenticated: authorized(request) }, { headers });
  const suffix = `; Path=/api; HttpOnly; SameSite=Strict${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  if (request.method === "DELETE") {
    headers["Set-Cookie"] = `${cookieName}=; Max-Age=0${suffix}`;
    return Response.json({ authenticated: false }, { headers });
  }
  if (request.method !== "POST")
    return Response.json(
      { error: "Метод не поддерживается" },
      { status: 405, headers },
    );
  const raw = await request.text();
  if (raw.length > 1000)
    return Response.json(
      { error: "Запрос слишком большой" },
      { status: 413, headers },
    );
  let code: unknown;
  try {
    code = JSON.parse(raw).code;
  } catch {}
  if (typeof code !== "string" || !validCode(code))
    return Response.json(
      { error: "Неверный код доступа" },
      { status: 401, headers },
    );
  headers["Set-Cookie"] =
    `${cookieName}=${makeSession()}; Max-Age=2592000${suffix}`;
  return Response.json({ authenticated: true }, { headers });
}
