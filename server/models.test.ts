import { afterEach, expect, it, vi } from "vitest";
vi.mock("./auth.js", () => ({ currentUser: vi.fn(), sameOrigin: () => true }));
import { currentUser } from "./auth.js";
import { handleModels } from "./models.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
it("checks model metadata without generating or exposing credentials", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    app_metadata: { studio_role: "admin" },
  } as never);
  vi.stubEnv("GEMINI_API_KEY", "test-secret");
  const upstream = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        models: [{ name: "models/gemini-flash" }],
        nextPageToken: "next",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        models: [
          {
            name: "models/gemini-3.1-flash-image",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    );
  vi.stubGlobal("fetch", upstream);
  const response = await handleModels(
    new Request("https://studio.test/api/models"),
  );
  const result = await response.json() as { imageModels: unknown[]; generationPerformed: boolean; billingAndQuotaVerified: boolean };
  expect(result.imageModels).toHaveLength(1);
  expect(result.generationPerformed).toBe(false);
  expect(result.billingAndQuotaVerified).toBe(false);
  expect(JSON.stringify(result)).not.toContain("test-secret");
  expect(upstream).toHaveBeenCalledTimes(2);
  expect(
    upstream.mock.calls.every(
      ([url]) => new URL(url).pathname === "/v1beta/models",
    ),
  ).toBe(true);
});
it("rejects non-admin users before contacting Google", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    app_metadata: { studio_role: "user" },
  } as never);
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  expect(
    (await handleModels(new Request("https://studio.test/api/models"))).status,
  ).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});
