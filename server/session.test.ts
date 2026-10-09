import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createClient, type User } from "@supabase/supabase-js";
import { handleSession } from "./session.js";
import { authorized } from "./auth.js";
import { handleUsers } from "./users.js";
import { quotaDetails } from "./quota.js";
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
const access = "eyJ.test.signature",
  refresh = "opaque-refresh-token";
const user = {
  id: "17f6e1e9-9f83-4b73-912a-bcb8359736de",
  email: "admin@accounts.farlands.invalid",
  user_metadata: { display_name: "Admin" },
  app_metadata: {
    studio_access: true,
    studio_enabled: true,
    studio_role: "admin",
  },
  created_at: "2026-10-09T12:00:00Z",
} as unknown as User;
let getUser: ReturnType<typeof vi.fn>,
  signIn: ReturnType<typeof vi.fn>,
  refreshSession: ReturnType<typeof vi.fn>,
  listUsers: ReturnType<typeof vi.fn>,
  createUser: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://cloud.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-key");
  vi.stubEnv(
    "STUDIO_BOOTSTRAP_TOKEN",
    "test-bootstrap-secret-1234567890123456789",
  );
  getUser = vi.fn(async (token: string) => ({
    data: { user: token === access ? user : null },
    error: token === access ? null : { message: "bad" },
  }));
  signIn = vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: access,
        refresh_token: refresh,
        expires_in: 3600,
      },
    },
    error: null,
  });
  refreshSession = vi.fn().mockResolvedValue({
    data: {
      session: {
        access_token: access,
        refresh_token: refresh,
        expires_in: 3600,
      },
    },
    error: null,
  });
  listUsers = vi
    .fn()
    .mockResolvedValue({ data: { users: [user] }, error: null });
  createUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  vi.mocked(createClient).mockReturnValue({
    auth: {
      getUser,
      signInWithPassword: signIn,
      refreshSession,
      admin: {
        listUsers,
        createUser,
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  } as unknown as ReturnType<typeof createClient>);
});
afterEach(() => vi.unstubAllEnvs());
it("sets secure HttpOnly login cookies without exposing tokens in JSON", async () => {
  const r = await handleSession(
    new Request("https://studio.test/api/session", {
      method: "POST",
      headers: { Origin: "https://studio.test" },
      body: JSON.stringify({
        username: "admin",
        password: "strong-test-password",
      }),
    }),
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("set-cookie")).toContain("HttpOnly");
  expect(r.headers.get("set-cookie")).toContain("Secure");
  expect(r.headers.get("set-cookie")).toContain("SameSite=Strict");
  const body = await r.text();
  expect(body).toContain("admin");
  expect(body).not.toContain(access);
  expect(body).not.toContain(refresh);
  expect(signIn).toHaveBeenCalledWith({
    email: "admin@accounts.farlands.invalid",
    password: "strong-test-password",
  });
});
it("rejects the legacy code and cookie and fails closed for blocked users", async () => {
  expect(
    await authorized(
      new Request("https://studio.test/api/tts", {
        headers: {
          Authorization: "Bearer old-code",
          Cookie: "farlands_session=old-signed-cookie",
        },
      }),
    ),
  ).toBe(false);
  getUser.mockResolvedValue({
    data: {
      user: {
        ...user,
        app_metadata: { ...user.app_metadata, studio_enabled: false },
      },
    },
    error: null,
  });
  expect(
    await authorized(
      new Request("https://studio.test/api/tts", {
        headers: { Cookie: "farlands_access=" + access },
      }),
    ),
  ).toBe(false);
});
it("refreshes expired access and logout clears both cookies", async () => {
  const r = await handleSession(
    new Request("https://studio.test/api/session", {
      headers: { Cookie: "farlands_refresh=" + refresh },
    }),
  );
  expect(((await r.json()) as { authenticated: boolean }).authenticated).toBe(
    true,
  );
  expect(refreshSession).toHaveBeenCalledWith({ refresh_token: refresh });
  const out = await handleSession(
    new Request("https://studio.test/api/session", { method: "DELETE" }),
  );
  expect(out.headers.get("set-cookie")).toContain(
    "farlands_access=; Max-Age=0",
  );
  expect(out.headers.get("set-cookie")).toContain(
    "farlands_refresh=; Max-Age=0",
  );
});
it("rejects cross-origin login and wrong password", async () => {
  expect(
    (
      await handleSession(
        new Request("https://studio.test/api/session", {
          method: "POST",
          headers: { Origin: "https://evil.test" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(403);
  signIn.mockResolvedValue({ data: { session: null }, error: { status: 400 } });
  expect(
    (
      await handleSession(
        new Request("https://studio.test/api/session", {
          method: "POST",
          body: JSON.stringify({ username: "admin", password: "wrong" }),
        }),
      )
    ).status,
  ).toBe(401);
});
it("does not trust user-editable metadata for administrator access", async () => {
  getUser.mockResolvedValue({
    data: {
      user: {
        ...user,
        app_metadata: { studio_access: true, studio_role: "user" },
        user_metadata: { role: "admin" },
      },
    },
    error: null,
  });
  const r = await handleUsers(
    new Request("https://studio.test/api/users", {
      headers: { Cookie: "farlands_access=" + access },
    }),
  );
  expect(r.status).toBe(403);
  expect(listUsers).not.toHaveBeenCalled();
});
it("prevents repeat bootstrap once a studio account exists", async () => {
  const r = await handleUsers(
    new Request("https://studio.test/api/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-bootstrap-secret-1234567890123456789",
      },
      body: JSON.stringify({
        username: "admin",
        password: "strong-test-password",
        role: "admin",
      }),
    }),
  );
  expect(r.status).toBe(403);
  expect(createUser).not.toHaveBeenCalled();
});
it("forbids users not explicitly admitted by an administrator", async () => {
  getUser.mockResolvedValue({
    data: { user: { ...user, app_metadata: {} } },
    error: null,
  });
  expect(
    await authorized(
      new Request("https://studio.test/api/cloud", {
        headers: { Cookie: "farlands_access=" + access },
      }),
    ),
  ).toBe(false);
});
it("extracts safe quota details", () => {
  expect(
    quotaDetails(
      {
        error: {
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.RetryInfo",
              retryDelay: "21.5s",
            },
          ],
        },
      },
      null,
    ),
  ).toEqual({ retryAfterSeconds: 22, limits: [] });
});
it("creates the requested initial admin only during bootstrap and protects own admin access", async () => {
  listUsers.mockResolvedValueOnce({ data: { users: [] }, error: null });
  const created = await handleUsers(
    new Request("https://studio.test/api/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-bootstrap-secret-1234567890123456789",
      },
      body: JSON.stringify({
        username: "admin",
        password: "bootstrap-test-password",
        role: "admin",
      }),
    }),
  );
  expect(created.status).toBe(201);
  expect(createUser).toHaveBeenCalledWith(
    expect.objectContaining({
      password: "bootstrap-test-password",
      app_metadata: expect.objectContaining({
        studio_role: "admin",
        studio_access: true,
      }),
    }),
  );
  const disable = await handleUsers(
    new Request("https://studio.test/api/users", {
      method: "PATCH",
      headers: { Cookie: "farlands_access=" + access },
      body: JSON.stringify({ id: user.id, enabled: false }),
    }),
  );
  expect(disable.status).toBe(400);
});
