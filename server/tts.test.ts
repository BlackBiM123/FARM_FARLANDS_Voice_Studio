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
    const fetch = vi
      .fn()
      .mockResolvedValue(
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
