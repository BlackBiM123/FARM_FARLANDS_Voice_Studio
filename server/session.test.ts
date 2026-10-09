import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleSession } from "./session.js";
import { authorized } from "./auth.js";
import { quotaDetails } from "./quota.js";
beforeEach(() =>
  vi.stubEnv("STUDIO_ACCESS_TOKEN", "test-only-long-secret-1234567890"),
);
afterEach(() => vi.unstubAllEnvs());
it("remembers login with a signed HttpOnly cookie and rejects tampering", async () => {
  const r = await handleSession(
    new Request("https://studio.test/api/session", {
      method: "POST",
      headers: { Origin: "https://studio.test" },
      body: JSON.stringify({ code: "test-only-long-secret-1234567890" }),
    }),
  );
  expect(r.status).toBe(200);
  const cookie = r.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=Strict");
  expect(cookie).toContain("Max-Age=2592000");
  expect(cookie).not.toContain("test-only-long-secret");
  const value = cookie.split(";")[0]!;
  expect(
    authorized(
      new Request("https://studio.test/api/tts", {
        headers: { Cookie: value },
      }),
    ),
  ).toBe(true);
  expect(
    authorized(
      new Request("https://studio.test/api/tts", {
        headers: { Cookie: value + "bad" },
      }),
    ),
  ).toBe(false);
  expect(
    (
      await handleSession(
        new Request("https://studio.test/api/session", {
          headers: { Cookie: value },
        }),
      )
    ).status,
  ).toBe(200);
});
it("rejects wrong credentials and cross-origin login; logout clears cookie", async () => {
  const body = JSON.stringify({ code: "wrong" });
  expect(
    (
      await handleSession(
        new Request("https://studio.test/api/session", {
          method: "POST",
          body,
        }),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await handleSession(
        new Request("https://studio.test/api/session", {
          method: "POST",
          headers: { Origin: "https://evil.test" },
          body,
        }),
      )
    ).status,
  ).toBe(403);
  const r = await handleSession(
    new Request("https://studio.test/api/session", { method: "DELETE" }),
  );
  expect(r.headers.get("set-cookie")).toContain("Max-Age=0");
});
it("extracts only safe quota numbers and cooldown from Google errors", () => {
  expect(
    quotaDetails(
      {
        error: {
          message: "secret",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.RetryInfo",
              retryDelay: "21.5s",
            },
            {
              "@type": "type.googleapis.com/google.rpc.QuotaFailure",
              violations: [
                {
                  quotaId: "GenerateRequestsPerDayPerProject",
                  quotaMetric: "requests",
                  quotaValue: "10",
                },
                {
                  quotaId: "InputTokensPerMinute",
                  quotaMetric: "token_count",
                  quotaValue: "1000",
                },
              ],
            },
          ],
        },
      },
      null,
    ),
  ).toEqual({
    retryAfterSeconds: 22,
    limits: [
      { period: "day", kind: "requests", limit: 10 },
      { period: "minute", kind: "tokens", limit: 1000 },
    ],
  });
  expect(quotaDetails({}, null)).toEqual({
    retryAfterSeconds: null,
    limits: [],
  });
});
