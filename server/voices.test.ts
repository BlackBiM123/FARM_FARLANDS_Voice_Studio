import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { handleVoices } from "./voices.js";
import { currentUser } from "./auth.js";
import { settingsSchema } from "../shared/schema.js";
vi.mock("./auth.js", () => ({
  currentUser: vi.fn(),
  sameOrigin: (r: Request) =>
    !r.headers.get("origin") ||
    r.headers.get("origin") === "https://studio.test",
}));
const req = (method = "GET", body?: unknown, id = "") =>
  new Request("https://studio.test/api/voices" + (id ? "?id=" + id : ""), {
    method,
    headers: { Origin: "https://studio.test" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const design = {
  name: "Тестовый тембр",
  gender: "female",
  description: "A fictional young character speaking Russian.",
};
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "secret-server-only");
  vi.stubEnv("GENERATION_ENABLED", "true");
  vi.mocked(currentUser).mockResolvedValue({
    app_metadata: { studio_role: "admin" },
  } as unknown as Awaited<ReturnType<typeof currentUser>>);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Voice design", () => {
  it("never calls provider without session, admin creation permission or valid origin", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.mocked(currentUser).mockResolvedValueOnce(null);
    expect((await handleVoices(req())).status).toBe(401);
    vi.mocked(currentUser).mockResolvedValueOnce({
      app_metadata: { studio_role: "user" },
    } as unknown as Awaited<ReturnType<typeof currentUser>>);
    expect((await handleVoices(req("POST", design))).status).toBe(403);
    expect(
      (
        await handleVoices(
          new Request("https://studio.test/api/voices", {
            headers: { Origin: "https://evil.test" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("creates a persistent Russian voice, strips sample/key from response, accepts its ID in settings", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        id: "voice_test-123",
        display_name: design.name,
        gender: "female",
        prompted: { input: design.description },
        sample_audio: { data: "private-sample" },
        key: "provider-secret",
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const r = await handleVoices(req("POST", design));
    expect(r.status).toBe(201);
    const data = (await r.json()) as {
      voice: import("../shared/designed-voice.js").DesignedVoice;
    };
    expect(data.voice.id).toBe("voice_test-123");
    expect(JSON.stringify(data)).not.toContain("private-sample");
    expect(JSON.stringify(data)).not.toContain("provider-secret");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      store: true,
      voice: {
        type: "prompted",
        language_code: "ru-RU",
        model: "gemini-3.8-flash-tts",
      },
    });
    expect(
      settingsSchema.safeParse({
        voice: data.voice.id,
        designedVoice: data.voice,
        model: "gemini-3.8-flash-tts",
        emotion: "Calm",
        pace: 1,
        direction: "",
      }).success,
    ).toBe(true);
  });
  it("returns quota failure without exposing upstream messages or retrying generation", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            status: "RESOURCE_EXHAUSTED",
            message: "private-key-value",
          },
        },
        { status: 429 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const r = await handleVoices(req("POST", design));
    expect(r.status).toBe(429);
    expect(await r.text()).not.toContain("private-key-value");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("restricts voice path and keeps valid WAV samples private", async () => {
    const wav = Buffer.from("RIFF0000WAVEtest");
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        sample_audio: {
          mime_type: "audio/wav",
          data: wav.toString("base64"),
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(
      (await handleVoices(req("GET", undefined, "../models"))).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    const r = await handleVoices(req("GET", undefined, "voice_test"));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toContain("private");
    expect(Buffer.from(await r.arrayBuffer())).toEqual(wav);
  });
  it("explains policy rejection in Russian without claiming a voice was created", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            {
              error: {
                status: "INVALID_ARGUMENT",
                message: "Voice prompt was blocked by safety policies.",
              },
            },
            { status: 400 },
          ),
        ),
    );
    const r = await handleVoices(req("POST", design));
    const data = (await r.json()) as {
      policyBlocked: boolean;
      error: string;
      voice?: unknown;
    };
    expect(data.policyBlocked).toBe(true);
    expect(data.error).toContain("Тембр не создан");
    expect(data.voice).toBeUndefined();
  });
});
