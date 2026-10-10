import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleImage } from "./image.js";
import { cloudClient, cloudGuard } from "./cloud.js";
vi.mock("./cloud.js", () => ({
  cloudClient: vi.fn(),
  cloudGuard: vi.fn(async () => null),
}));
const id = "b3a1765e-741f-43c7-bf15-b1b47e564047";
const request = (
  body: Uint8Array | undefined,
  type = "image/png",
  method = "PUT",
) =>
  new Request("https://studio.test/api/image?id=" + id, {
    method,
    headers: { "Content-Type": type },
    body: body ? Buffer.from(body) : undefined,
  });
beforeEach(() => vi.clearAllMocks());
describe("private character images", () => {
  it("blocks unauthorized reads before storage", async () => {
    vi.mocked(cloudGuard).mockResolvedValueOnce(
      Response.json({}, { status: 401 }),
    );
    expect(
      (await handleImage(request(undefined, "image/png", "GET"))).status,
    ).toBe(401);
    expect(cloudClient).not.toHaveBeenCalled();
  });
  it("rejects unsupported and mismatched images", async () => {
    vi.mocked(cloudClient).mockReturnValue(
      {} as ReturnType<typeof cloudClient>,
    );
    expect(
      (await handleImage(request(new Uint8Array([1]), "image/svg+xml"))).status,
    ).toBe(415);
    expect((await handleImage(request(new Uint8Array([1])))).status).toBe(400);
  });
  it("creates a private bucket and retains uploaded bytes", async () => {
    const upload = vi.fn(async () => ({ error: null })),
      createBucket = vi.fn(async () => ({ error: null }));
    vi.mocked(cloudClient).mockReturnValue({
      storage: {
        getBucket: async () => ({ error: { statusCode: 404 } }),
        createBucket,
        from: () => ({ upload }),
      },
    } as unknown as ReturnType<typeof cloudClient>);
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    expect((await handleImage(request(bytes))).status).toBe(200);
    expect(createBucket).toHaveBeenCalledWith(
      "studio-images",
      expect.objectContaining({ public: false }),
    );
    expect(upload).toHaveBeenCalledWith(id, Buffer.from(bytes), {
      contentType: "image/png",
      upsert: false,
    });
  });
});

