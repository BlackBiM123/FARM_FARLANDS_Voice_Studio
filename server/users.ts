import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { cloudClient } from "./supabase.js";
import {
  currentUser,
  publicUser,
  sameOrigin,
  userEmail,
  usernamePattern,
} from "./auth.js";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const creation = z.object({
  username: z.string().trim().toLowerCase().regex(usernamePattern),
  password: z.string().min(7).max(128),
  name: z.string().max(80).default(""),
  role: z.enum(["admin", "user"]).default("user"),
});
export async function handleUsers(request: Request) {
  if (!sameOrigin(request))
    return json({ error: "Недопустимый источник запроса" }, 403);
  const db = cloudClient();
  if (!db) return json({ error: "Сервис пользователей не настроен" }, 503);
  const secret = process.env.STUDIO_BOOTSTRAP_TOKEN,
    supplied =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const bootstrap =
    request.method === "POST" &&
    !!secret &&
    secret.length >= 32 &&
    Buffer.byteLength(secret) === Buffer.byteLength(supplied) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
  const actor = bootstrap ? null : await currentUser(request);
  if (!bootstrap && !actor) return json({ error: "Войдите в студию" }, 401);
  if (!bootstrap && actor?.app_metadata.studio_role !== "admin")
    return json({ error: "Требуются права администратора" }, 403);
  try {
    const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listed.error) throw Error("list");
    const users = listed.data.users.filter(
      (u) => u.app_metadata.studio_access === true,
    );
    if (bootstrap && users.length)
      return json({ error: "Первичный администратор уже создан" }, 403);
    if (request.method === "GET") return json({ users: users.map(publicUser) });
    const raw = await request.text();
    if (raw.length > 4000)
      return json({ error: "Запрос слишком большой" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Некорректный запрос" }, 400);
    }
    if (request.method === "POST") {
      const parsed = creation.safeParse(body);
      if (!parsed.success)
        return json(
          { error: "Логин: 3–32 латинских символа; пароль: 12–128 символов" },
          400,
        );
      if (users.length >= 100)
        return json({ error: "Лимит студии: 100 пользователей" }, 400);
      const input = parsed.data;
      if (!bootstrap && input.password.length < 12)
        return json(
          {
            error:
              "Пароль нового пользователя должен содержать минимум 12 символов",
          },
          400,
        );
      if (bootstrap && (input.username !== "admin" || input.role !== "admin"))
        return json(
          { error: "Первичная учётная запись должна быть admin" },
          400,
        );
      const { data, error } = await db.auth.admin.createUser({
        email: userEmail(input.username),
        password: input.password,
        email_confirm: true,
        user_metadata: { display_name: input.name },
        app_metadata: {
          studio_access: true,
          studio_enabled: true,
          studio_role: input.role,
        },
      });
      if (error)
        return json(
          {
            error:
              "Не удалось создать пользователя. Возможно, логин уже занят.",
          },
          400,
        );
      return json({ user: publicUser(data.user) }, 201);
    }
    if (request.method === "PATCH") {
      const parsed = z
        .object({
          id: z.string().uuid(),
          role: z.enum(["admin", "user"]).optional(),
          enabled: z.boolean().optional(),
          password: z.string().min(12).max(128).optional(),
        })
        .safeParse(body);
      if (!parsed.success)
        return json({ error: "Некорректные настройки пользователя" }, 400);
      const input = parsed.data,
        target = users.find((u) => u.id === input.id);
      if (!target) return json({ error: "Пользователь не найден" }, 404);
      if (
        target.id === actor!.id &&
        (input.enabled === false || input.role === "user")
      )
        return json(
          {
            error:
              "Нельзя отключить собственный доступ или снять с себя роль администратора",
          },
          400,
        );
      const metadata = {
        ...target.app_metadata,
        ...(input.role ? { studio_role: input.role } : {}),
        ...(input.enabled !== undefined
          ? { studio_enabled: input.enabled }
          : {}),
      };
      const { data, error } = await db.auth.admin.updateUserById(input.id, {
        app_metadata: metadata,
        ...(input.password ? { password: input.password } : {}),
      });
      if (error) throw Error("update");
      return json({ user: publicUser(data.user) });
    }
    return json({ error: "Метод не поддерживается" }, 405);
  } catch {
    console.error("users operation failed", { method: request.method });
    return json(
      { error: "Не удалось выполнить операцию с пользователями" },
      502,
    );
  }
}
