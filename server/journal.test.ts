import { it, expect, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { handleSimulation } from "./simulation.js";
import { cloudClient, cloudGuard } from "./cloud.js";
import { checkJournal } from "../shared/journal.js";
vi.mock("./cloud.js", () => ({ cloudClient: vi.fn(), cloudGuard: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const page = [
  {
    id: "event_1",
    minute: 360,
    type: "start",
    actor: "",
    place: "",
    text: "Начало",
    witnesses: [],
    data: {},
  },
];
const body = JSON.stringify(page),
  hash = createHash("sha256").update(body).digest("hex");
const request = (part = hash, data: unknown = page) =>
  new Request("https://studio.test/api/simulation?part=" + part, {
    method: "PUT",
    headers: { Origin: "https://studio.test" },
    body: JSON.stringify(data),
  });
it("guards journal endpoints before storage access", async () => {
  vi.mocked(cloudGuard).mockResolvedValue(
    Response.json({ error: "Войдите" }, { status: 401 }),
  );
  expect((await handleSimulation(request())).status).toBe(401);
  expect(cloudClient).not.toHaveBeenCalled();
});
it("stores an immutable page under its content hash", async () => {
  vi.mocked(cloudGuard).mockResolvedValue(null);
  const upload = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(cloudClient).mockReturnValue({
    storage: {
      getBucket: async () => ({ error: null }),
      from: () => ({ upload }),
    },
  } as never);
  expect((await handleSimulation(request())).status).toBe(200);
  expect(upload).toHaveBeenCalledWith("journal/" + hash + ".json", body, {
    contentType: "application/json",
    upsert: false,
  });
});
it("reuses only identical immutable content", async () => {
  vi.mocked(cloudGuard).mockResolvedValue(null);
  const upload = vi.fn().mockResolvedValue({ error: { status: 409 } });
  vi.mocked(cloudClient).mockReturnValue({
    storage: {
      getBucket: async () => ({ error: null }),
      from: () => ({
        upload,
        download: async () => ({ data: new Blob([body]), error: null }),
      }),
    },
  } as never);
  expect((await handleSimulation(request())).status).toBe(200);
});
it("rejects changed content and broken event sequences", async () => {
  vi.mocked(cloudGuard).mockResolvedValue(null);
  const upload = vi.fn();
  vi.mocked(cloudClient).mockReturnValue({
    storage: { from: () => ({ upload }) },
  } as never);
  expect((await handleSimulation(request("0".repeat(64)))).status).toBe(400);
  expect(
    (
      await handleSimulation(
        request(hash, [...page, { ...page[0], id: "event_3" }]),
      )
    ).status,
  ).toBe(400);
  expect(upload).not.toHaveBeenCalled();
  expect(() => checkJournal([{ id: "event_2" }], 2)).toThrow();
});
