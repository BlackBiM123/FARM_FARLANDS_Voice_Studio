import type { User } from "@supabase/supabase-js";
import { cloudClient } from "./supabase.js";
export const cookieName = "farlands_access",
  refreshCookieName = "farlands_refresh";
export function cookie(request: Request, name: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + "="))
      ?.slice(name.length + 1) ?? ""
  );
}
export function accessToken(request: Request) {
  const token =
    cookie(request, cookieName) ||
    request.headers.get("authorization")?.replace(/^Bearer /, "") ||
    "";
  return token.split(".").length === 3 ? token : "";
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (
    !origin ||
    origin === new URL(request.url).origin ||
    origin === process.env.STUDIO_ORIGIN
  );
}
export function publicUser(user: User) {
  return {
    id: user.id,
    username: user.email?.split("@")[0] ?? "user",
    name: user.user_metadata?.display_name ?? "",
    role: user.app_metadata?.studio_role === "admin" ? "admin" : "user",
    enabled: user.app_metadata?.studio_enabled !== false,
    createdAt: user.created_at,
    lastLogin: user.last_sign_in_at ?? null,
  };
}
export function admitted(user: User | null) {
  return (
    !!user &&
    user.app_metadata?.studio_access === true &&
    user.app_metadata?.studio_enabled !== false
  );
}
export async function currentUser(request: Request) {
  const token = accessToken(request);
  if (!token) return null;
  const db = cloudClient();
  if (!db) return null;
  try {
    const { data, error } = await db.auth.getUser(token);
    return !error && admitted(data.user) ? data.user : null;
  } catch {
    return null;
  }
}
export async function authorized(request: Request) {
  return !!(await currentUser(request));
}
export const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export function userEmail(username: string) {
  return username.toLowerCase() + "@accounts.farlands.invalid";
}
export function sessionHeaders(
  request: Request,
  session?: { access_token: string; refresh_token: string; expires_in: number },
) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const suffix = `; Path=/api; HttpOnly; SameSite=Strict${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  headers.append(
    "Set-Cookie",
    `${cookieName}=${session?.access_token ?? ""}; Max-Age=${session?.expires_in ?? 0}${suffix}`,
  );
  headers.append(
    "Set-Cookie",
    `${refreshCookieName}=${session?.refresh_token ?? ""}; Max-Age=${session ? 2592000 : 0}${suffix}`,
  );
  headers.append("Set-Cookie", `farlands_session=; Max-Age=0${suffix}`);
  return headers;
}
