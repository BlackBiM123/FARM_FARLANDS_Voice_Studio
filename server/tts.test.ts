import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleTTS } from "./tts.js";
const token = "test-only-access-code-123456789";
const payload = {
  voice: "Charon",
  model: "gemini-3.8-flash-tts",
  emotion: "Calm",
  pace: 1,
  direction: "Low voice",
  text: "Hello",
  language: "en",
};
function req(
  body: unknown = payload,
  secret = token,
  origin = "https://studio.test",
) {
  return new Request("https://studio.test/api/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, Origin: origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("STUDIO_ACCESS_TOKEN", token);
  vi.stubEnv("GENERATION_ENABLED", "true");
  vi.stubEnv("GEMINI_API_KEY", "server-secret-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Protected Gemini proxy", () => {
  it("adds the game direction by default and removes it when disabled without changing the transcript", async () => {
    const captured: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url, options) => {
        captured.push(JSON.parse(options.body));
        return Response.json({ steps: [] });
      }),
    );
    await handleTTS(req());
    await handleTTS(req({ ...payload, gameCharacter: false }));
    const items = captured as {
      input: {
        content: { text: string; annotations: { style: string }[] }[];
      }[];
    }[];
    expect(items[0]!.input[0]!.content[0]!.annotations[0]!.style).toContain(
      "Farm & Farlands",
    );
    expect(items[0]!.input[0]!.content[0]!.annotations[0]!.style).toContain(
      "Emotion: Calm",
    );
    expect(items[1]!.input[0]!.content[0]!.annotations[0]!.style).not.toContain(
      "Farm & Farlands",
    );
    expect(items[0]!.input[0]!.content[0]!.text).toBe("Hello");
  });
  it("rejects unauthenticated requests before calling provider", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await handleTTS(req(payload, ""))).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed when generation disabled", async () => {
    vi.stubEnv("GENERATION_ENABLED", "false");
    expect((await handleTTS(req())).status).toBe(503);
  });
  it("rejects foreign origins", async () => {
    expect(
      (await handleTTS(req(payload, token, "https://evil.test"))).status,
    ).toBe(403);
  });
  it("rejects unsupported models and excessive input", async () => {
    expect(
      (await handleTTS(req({ ...payload, model: "unapproved" }))).status,
    ).toBe(400);
    expect(
      (await handleTTS(req({ ...payload, text: "x".repeat(601) }))).status,
    ).toBe(400);
  });
  it("reports exhausted quotas without exposing upstream secrets", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("server-secret-test", { status: 429 })),
    );
    const r = await handleTTS(req());
    expect(r.status).toBe(429);
    expect(await r.text()).not.toContain("server-secret-test");
  });
  it("returns valid WAV and uses server key only upstream", async () => {
    const wav = Buffer.alloc(48);
    wav.write("RIFF");
    wav.write("WAVE", 8);
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        steps: [
          {
            type: "model_output",
            content: [{ type: "audio", data: wav.toString("base64") }],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const r = await handleTTS(req());
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("audio/wav");
    expect(Buffer.from(await r.arrayBuffer())).toEqual(wav);
    expect(fetch.mock.calls[0]![1].headers["x-goog-api-key"]).toBe(
      "server-secret-test",
    );
    const input = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(input.input[0].content[0].text).toBe("Hello");
    expect(input.generation_config.speech_config[0].voice).toBe("Charon");
  });
  it("handles missing audio and upstream timeouts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ steps: [] })),
    );
    expect((await handleTTS(req())).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret")));
    const r = await handleTTS(req());
    expect(r.status).toBe(504);
    expect(await r.text()).not.toContain("secret");
  });
});
vi.mock("./auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth.js")>();
  return {
    ...actual,
    authorized: vi.fn(
      async (request: Request) =>
        request.headers.get("authorization") ===
        "Bearer test-only-access-code-123456789",
    ),
  };
});
