import { createHmac, timingSafeEqual } from "node:crypto";
export const cookieName = "farlands_session";
export function validCode(code: string) {
  const secret = process.env.STUDIO_ACCESS_TOKEN;
  return (
    !!secret &&
    secret.length >= 24 &&
    Buffer.byteLength(secret) === Buffer.byteLength(code) &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(code))
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (
    !origin ||
    origin === new URL(request.url).origin ||
    origin === process.env.STUDIO_ORIGIN
  );
}
export function makeSession() {
  const expires = String(Date.now() + 30 * 86400000);
  return (
    expires +
    "." +
    createHmac("sha256", process.env.STUDIO_ACCESS_TOKEN!)
      .update(expires)
      .digest("hex")
  );
}
export function authorized(request: Request) {
  if (
    validCode(
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "",
    )
  )
    return true;
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (
    !expires ||
    !signature ||
    !process.env.STUDIO_ACCESS_TOKEN ||
    process.env.STUDIO_ACCESS_TOKEN.length < 24 ||
    !Number.isFinite(Number(expires)) ||
    Number(expires) < Date.now() ||
    Number(expires) > Date.now() + 31 * 86400000
  )
    return false;
  const expected = createHmac("sha256", process.env.STUDIO_ACCESS_TOKEN)
    .update(expires)
    .digest("hex");
  return (
    /^[0-9a-f]{64}$/.test(signature) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
