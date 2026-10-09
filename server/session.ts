import { z } from "zod";
import { cloudClient } from "./supabase.js";
import {
  accessToken,
  admitted,
  cookie,
  currentUser,
  publicUser,
  refreshCookieName,
  sameOrigin,
  sessionHeaders,
  usernamePattern,
  userEmail,
} from "./auth.js";
export async function handleSession(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!sameOrigin(request))
    return Response.json(
      { error: "Недопустимый источник запроса" },
      { status: 403, headers },
    );
  const db = cloudClient();
  if (!db)
    return Response.json(
      { error: "Вход временно недоступен" },
      { status: 503, headers },
    );
  try {
    if (request.method === "DELETE") {
      const token = accessToken(request);
      if (token) await db.auth.admin.signOut(token, "local");
      return Response.json(
        { authenticated: false },
        { headers: sessionHeaders(request) },
      );
    }
    if (request.method === "GET") {
      const user = await currentUser(request);
      if (user)
        return Response.json(
          { authenticated: true, user: publicUser(user) },
          { headers },
        );
      const refresh = cookie(request, refreshCookieName);
      if (refresh && refresh.length < 10000) {
        const { data, error } = await db.auth.refreshSession({
          refresh_token: refresh,
        });
        if (!error && data.session) {
          const checked = await db.auth.getUser(data.session.access_token);
          if (!checked.error && admitted(checked.data.user))
            return Response.json(
              { authenticated: true, user: publicUser(checked.data.user!) },
              { headers: sessionHeaders(request, data.session) },
            );
        }
      }
      return Response.json(
        { authenticated: false },
        { headers: sessionHeaders(request) },
      );
    }
    if (request.method !== "POST")
      return Response.json(
        { error: "Метод не поддерживается" },
        { status: 405, headers },
      );
    const raw = await request.text();
    if (raw.length > 2000)
      return Response.json(
        { error: "Запрос слишком большой" },
        { status: 413, headers },
      );
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {}
    const parsed = z
      .object({
        username: z.string().trim().toLowerCase().regex(usernamePattern),
        password: z.string().min(1).max(128),
      })
      .safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: "Введите логин и пароль" },
        { status: 400, headers },
      );
    const { data, error } = await db.auth.signInWithPassword({
      email: userEmail(parsed.data.username),
      password: parsed.data.password,
    });
    if (error || !data.session)
      return Response.json(
        {
          error:
            error?.status === 429
              ? "Слишком много попыток входа. Повторите позже."
              : "Неверный логин или пароль",
        },
        { status: error?.status === 429 ? 429 : 401, headers },
      );
    const checked = await db.auth.getUser(data.session.access_token);
    if (checked.error || !admitted(checked.data.user))
      return Response.json(
        { error: "Доступ к студии отключён" },
        { status: 403, headers },
      );
    return Response.json(
      { authenticated: true, user: publicUser(checked.data.user!) },
      { headers: sessionHeaders(request, data.session) },
    );
  } catch {
    console.error("session failed", { method: request.method });
    return Response.json(
      { error: "Не удалось выполнить вход. Повторите позже." },
      { status: 502, headers },
    );
  }
}
