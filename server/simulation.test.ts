import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { createWorld } from "../src/world-defaults.js";
import { handleSimulation } from "./simulation.js";
import { cloudClient, cloudGuard } from "./cloud.js";
vi.mock("./cloud.js", () => ({ cloudClient: vi.fn(), cloudGuard: vi.fn() }));
const req = (
  method = "GET",
  body?: unknown,
  id = "123e4567-e89b-42d3-a456-426614174000",
) =>
  new Request("https://studio.test/api/simulation" + (id ? "?id=" + id : ""), {
    method,
    headers: { Origin: "https://studio.test" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
beforeEach(() => {
  vi.mocked(cloudGuard).mockResolvedValue(null);
});
afterEach(() => vi.resetAllMocks());
it("protects all run endpoints before storage access", async () => {
  vi.mocked(cloudGuard).mockResolvedValue(
    Response.json({ error: "Войдите" }, { status: 401 }),
  );
  expect((await handleSimulation(req())).status).toBe(401);
  expect(cloudClient).not.toHaveBeenCalled();
});
it("rejects malformed reports and identifiers without writing", async () => {
  const upload = vi.fn();
  vi.mocked(cloudClient).mockReturnValue({
    storage: { from: () => ({ upload }) },
  } as never);
  expect((await handleSimulation(req("PUT", { version: 999 }))).status).toBe(
    400,
  );
  expect(
    (await handleSimulation(req("GET", undefined, "../secret"))).status,
  ).toBe(400);
  expect(upload).not.toHaveBeenCalled();
});
it("stores immutable private snapshots and detects changed definitions", async () => {
  const world = createWorld([]),
    hash = createHash("sha256").update(JSON.stringify(world)).digest("hex");
  const state = {
    version: 1,
    coreVersion: "farlands-core-1",
    contentHash: hash,
    minute: 360,
    seed: 42,
    rng: 42,
    agents: {},
    accounts: Object.fromEntries(world.accounts.map((a) => [a.id, a.balance])),
    stocks: Object.fromEntries(world.stocks.map((a) => [a.id, a.amount])),
    owners: { house: "seller" },
    events: [],
    nextEvent: 1,
    productionMinutes: 0,
    ledger: [],
    protectedFacts: world.protectedFacts,
    baselineMoney: world.accounts.reduce((sum, a) => sum + a.balance, 0),
    baselineItems: Object.fromEntries(
      world.items.map((i) => [
        i.id,
        world.stocks
          .filter((s) => s.item === i.id)
          .reduce((sum, s) => sum + s.amount, 0),
      ]),
    ),
    produced: {},
    consumed: {},
  };
  const report = {
    version: 1,
    coreVersion: "farlands-core-1",
    contentHash: hash,
    definition: world,
    state,
  };
  const upload = vi.fn().mockResolvedValue({ error: null }),
    createBucket = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(cloudClient).mockReturnValue({
    storage: {
      getBucket: vi.fn().mockResolvedValue({ error: true }),
      createBucket,
      from: () => ({ upload }),
    },
  } as never);
  expect((await handleSimulation(req("PUT", report))).status).toBe(200);
  expect(createBucket).toHaveBeenCalledWith(
    "studio-world-runs",
    expect.objectContaining({ public: false }),
  );
  expect(upload).toHaveBeenCalledWith(
    expect.stringContaining(".json"),
    expect.any(String),
    { contentType: "application/json", upsert: false },
  );
  world.name = "Изменённый мир";
  expect((await handleSimulation(req("PUT", report))).status).toBe(400);
});
