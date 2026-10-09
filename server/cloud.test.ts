import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { handleCloud } from "./cloud.js";
import { handleAudio } from "./audio.js";
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
const token = "test-cloud-access-1234567890123456";
function request(path: string, method = "GET", body?: unknown, auth = token) {
  return new Request("https://studio.test" + path, {
    method,
    headers: {
      Authorization: "Bearer " + auth,
      "Content-Type": "application/json",
      Origin: "https://studio.test",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
beforeEach(() => {
  vi.stubEnv("STUDIO_ACCESS_TOKEN", token);
  vi.stubEnv("SUPABASE_URL", "https://cloud.test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
  vi.mocked(createClient).mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it("blocks cloud and audio access before contacting Supabase", async () => {
  expect(
    (await handleCloud(request("/api/cloud", "GET", undefined, ""))).status,
  ).toBe(401);
  expect(
    (await handleAudio(request("/api/audio?id=bad", "GET", undefined, "")))
      .status,
  ).toBe(401);
  expect(createClient).not.toHaveBeenCalled();
});
it("reports unconfigured cloud explicitly and rejects invalid IDs and projects", async () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  expect(await (await handleCloud(request("/api/cloud"))).json()).toEqual({
    configured: false,
  });
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-server-secret");
  vi.mocked(createClient).mockReturnValue(
    {} as ReturnType<typeof createClient>,
  );
  expect((await handleAudio(request("/api/audio?id=../secret"))).status).toBe(
    400,
  );
  expect(
    (
      await handleCloud(
        request("/api/cloud", "PUT", {
          project: { version: 1, npcs: [] },
          revision: -1,
        }),
      )
    ).status,
  ).toBe(400);
});
it("rejects stale revisions instead of overwriting a newer cloud project", async () => {
  const q = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const update = vi.fn().mockReturnValue(q);
  vi.mocked(createClient).mockReturnValue({
    from: () => ({ update }),
  } as unknown as ReturnType<typeof createClient>);
  const r = await handleCloud(
    request("/api/cloud", "PUT", {
      project: { version: 1, npcs: [], gameCharacter: true },
      revision: 4,
    }),
  );
  expect(r.status).toBe(409);
  expect(q.eq).toHaveBeenCalledWith("revision", 4);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ revision: 5 }));
});
it("rejects non-WAV uploads without storing files", async () => {
  const upload = vi.fn();
  vi.mocked(createClient).mockReturnValue({
    storage: { from: () => ({ upload }) },
  } as unknown as ReturnType<typeof createClient>);
  const r = await handleAudio(
    new Request(
      "https://studio.test/api/audio?id=17f6e1e9-9f83-4b73-912a-bcb8359736de",
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "audio/wav",
        },
        body: "not wav",
      },
    ),
  );
  expect(r.status).toBe(400);
  expect(upload).not.toHaveBeenCalled();
});
