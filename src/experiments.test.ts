import { describe, it, expect } from "vitest";
import { createWorld } from "./world-defaults";
import {
  auditExperiment,
  prepareExperiment,
  stable,
  type Experiment,
} from "./experiments";
import type { WorldReport } from "./world-runs";
import type { WorldEvent } from "../shared/world";
function fixture() {
  const world = createWorld([
    { id: "npc_theo_hartley", name: "Тео" },
  ] as Parameters<typeof createWorld>[0]);
  const e: Experiment = {
    version: 1,
    id: "test",
    name: "Test",
    minutes: 1440,
    scenario: "normal",
    participants: world.agents.map((a) => a.id),
    checks: ["money", "goods", "routes", "journal", "restore"],
    world,
  };
  const r = {
    definition: world,
    state: {
      accounts: Object.fromEntries(
        world.accounts.map((a) => [a.id, a.balance]),
      ),
      stocks: Object.fromEntries(world.stocks.map((s) => [s.id, s.amount])),
      baselineMoney: world.accounts.reduce((s, a) => s + a.balance, 0),
      baselineItems: {},
      produced: {},
      consumed: {},
      protectedFacts: world.protectedFacts,
      agents: {},
      nextEvent: 1,
    },
    archive: [],
  } as unknown as WorldReport;
  return { e, r };
}
describe("experiment evidence", () => {
  it("applies stress conditions only to a copy and keeps shared infrastructure", () => {
    const { e } = fixture(),
      before = stable(e.world);
    e.scenario = "closed";
    expect(prepareExperiment(e).routes.every((r) => !r.open)).toBe(true);
    e.scenario = "no_money";
    const w = prepareExperiment(e);
    expect(
      w.accounts
        .filter((a) => w.agents.some((n) => n.account === a.id))
        .every((a) => a.balance === 0),
    ).toBe(true);
    expect(stable(e.world)).toBe(before);
  });
  it("does not call missing observations or absent replay a success", () => {
    const { e, r } = fixture();
    const checks = auditExperiment(e, r);
    expect(checks.find((c) => c.id === "routes")?.status).toBe("skip");
    expect(checks.find((c) => c.id === "restore")?.status).toBe("skip");
    expect(
      auditExperiment(e, r, false).find((c) => c.id === "restore")?.status,
    ).toBe("fail");
  });
  it("detects early arrival on a closed or too slow route and journal gaps", () => {
    const { e, r } = fixture();
    const edge = r.definition.routes.find((x) => x.mode === "walk" && x.open)!;
    const events = [
      {
        id: "event_1",
        type: "travel",
        actor: "npc",
        place: edge.from,
        minute: 360,
        data: { to: edge.to },
        text: "",
        witnesses: [],
      },
      {
        id: "event_2",
        type: "arrive",
        actor: "npc",
        place: edge.to,
        minute: 360,
        data: {},
        text: "",
        witnesses: [],
      },
    ] as WorldEvent[];
    r.archive = events;
    r.state.nextEvent = 3;
    expect(auditExperiment(e, r).find((c) => c.id === "routes")?.status).toBe(
      "fail",
    );
    events[1]!.minute = 4000;
    expect(auditExperiment(e, r).find((c) => c.id === "routes")?.status).toBe(
      "pass",
    );
    r.definition.routes.forEach((r) => (r.open = false));
    expect(auditExperiment(e, r).find((c) => c.id === "routes")?.status).toBe(
      "fail",
    );
    events[1]!.id = "event_3";
    expect(auditExperiment(e, r).find((c) => c.id === "journal")?.status).toBe(
      "fail",
    );
  });
  it("compares objects independently of JSON field order", () => {
    expect(stable({ b: [1, 2], a: 3 })).toBe(stable({ a: 3, b: [1, 2] }));
    expect(stable([1, 2])).not.toBe(stable([2, 1]));
  });
});
