import { afterEach, expect, it, vi } from "vitest";
vi.mock("./auth.js", () => ({ currentUser: vi.fn(), sameOrigin: () => true }));
vi.mock("./supabase.js", () => ({ cloudClient: vi.fn() }));
import { currentUser } from "./auth.js";
import { cloudClient } from "./supabase.js";
import { handleImageProbe } from "./image-probe.js";
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("does not repeat a paid request if a probe is already reserved", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    app_metadata: { studio_role: "admin" },
  } as never);
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GENERATION_ENABLED", "true");
  const storage = {
    download: vi.fn().mockResolvedValue({ data: null }),
    upload: vi.fn().mockResolvedValue({ error: { statusCode: 409 } }),
  };
  vi.mocked(cloudClient).mockReturnValue({
    storage: { from: () => storage },
  } as never);
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  expect(
    (
      await handleImageProbe(
        new Request("https://studio.test/api/image-probe", { method: "POST" }),
      )
    ).status,
  ).toBe(409);
  expect(upstream).not.toHaveBeenCalled();
});
it("returns an existing image without contacting the provider", async () => {
  vi.mocked(currentUser).mockResolvedValue({
    app_metadata: { studio_role: "admin" },
  } as never);
  const storage = {
    download: vi
      .fn()
      .mockResolvedValue({ data: new Blob(["cached"], { type: "image/png" }) }),
    upload: vi.fn(),
  };
  vi.mocked(cloudClient).mockReturnValue({
    storage: { from: () => storage },
  } as never);
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await handleImageProbe(
    new Request("https://studio.test/api/image-probe", { method: "POST" }),
  );
  expect(await response.text()).toBe("cached");
  expect(storage.upload).not.toHaveBeenCalled();
  expect(upstream).not.toHaveBeenCalled();
});
