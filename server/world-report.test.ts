import { expect, it } from "vitest";
import { reportSchema } from "../shared/world.js";
import { createWorld } from "../src/world-defaults.js";
function snapshot() {
  const definition = createWorld([
    { id: "npc_theo_hartley", name: "Тео" },
  ] as never);
  const agent = definition.agents[0]!;
  const obligation = {
    id: "wage:test",
    from: agent.employer,
    to: agent.account,
    amount: 35,
    remaining: 28,
    created: 360,
    day: 0,
    actor: agent.id,
    kind: "wage",
    label: "Оплата работы",
  };
  return {
    version: 1,
    rulesVersion: 3,
    coreVersion: "farlands-core-1",
    contentHash: "test",
    definition,
    state: {
      version: 1,
      coreVersion: "farlands-core-1",
      contentHash: "test",
      minute: 360,
      seed: 42,
      rng: 42,
      agents: {
        [agent.id]: {
          id: agent.id,
          place: agent.home,
          home: agent.home,
          energy: 900,
          hunger: 900,
          action: {},
          reason: "",
          choices: [],
          goal: "",
          knowledge: [],
          relationships: {},
          workMinutes: 240,
          lastPaidDay: -1,
          ownsHouse: false,
        },
      },
      accounts: Object.fromEntries(
        definition.accounts.map((a) => [a.id, a.balance]),
      ),
      stocks: Object.fromEntries(
        definition.stocks.map((s) => [s.id, s.amount]),
      ),
      owners: {},
      events: [],
      nextEvent: 1,
      productionMinutes: 0,
      ledger: [],
      protectedFacts: definition.protectedFacts,
      baselineMoney: definition.accounts.reduce((s, a) => s + a.balance, 0),
      baselineItems: Object.fromEntries(
        definition.items.map((i) => [
          i.id,
          definition.stocks
            .filter((s) => s.item === i.id)
            .reduce((s, a) => s + a.amount, 0),
        ]),
      ),
      produced: {},
      consumed: {},
      obligations: [obligation],
    },
  };
}
it("preserves partial obligations without treating receivables as created money", () => {
  const report = snapshot();
  const parsed = reportSchema.parse(report);
  expect(parsed.state.obligations?.[0]?.remaining).toBe(28);
  expect(parsed.rulesVersion).toBe(3);
});
it.each(["amount", "account", "duplicate", "future"])(
  "rejects invalid obligation: %s",
  (issue) => {
    const report = snapshot();
    const debt = report.state.obligations[0]!;
    if (issue === "amount") debt.remaining = 36;
    if (issue === "account") debt.from = "missing";
    if (issue === "duplicate") report.state.obligations.push({ ...debt });
    if (issue === "future") debt.created = 361;
    expect(reportSchema.safeParse(report).success).toBe(false);
  },
);
