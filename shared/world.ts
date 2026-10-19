import { z } from "zod";
import { needsSchema } from "./needs.js";
const id = z.string().regex(/^[a-z0-9_-]{1,60}$/),
  num = z.number().int().min(0).max(10000000),
  name = z.string().min(1).max(100);
export const worldSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(1),
    name,
    seed: num,
    notes: z.string().max(5000),
    places: z
      .array(
        z.object({
          id,
          name,
          scene: z.number().int().min(1).max(9),
          x: z.number().min(0).max(1000),
          y: z.number().min(0).max(1000),
          kind: z.enum(["home", "work", "shop", "nature", "exit"]),
          exists: z.boolean(),
          godotPath: z.string().max(200),
        }),
      )
      .min(1)
      .max(100),
    routes: z
      .array(
        z.object({
          id,
          from: id,
          to: id,
          minutes: z.number().int().min(1).max(1440),
          mode: z.enum(["walk", "cart", "boat"]),
          open: z.boolean(),
        }),
      )
      .max(200),
    accounts: z.array(z.object({ id, name, balance: num })).max(200),
    items: z
      .array(
        z.object({
          id,
          name,
          weight: z.number().min(0).max(10000),
          price: num,
        }),
      )
      .max(100),
    stocks: z
      .array(z.object({ id, place: id, owner: id, item: id, amount: num }))
      .max(200),
    agents: z
      .array(
        z.object({
          id,
          name,
          home: id,
          work: id,
          account: id,
          employer: id,
          wage: num,
          rent: num,
          role: z.enum(["stable", "farmer", "innkeeper", "resident"]),
          goalHouse: z.boolean(),
          helpfulness: z.number().min(0).max(100),
          carryCapacity: z.number().min(0).max(1000).optional(),
          setupStatus: z.enum(["test", "reviewed"]).optional(),
          setupNotes: z.string().max(2000).optional(),
          sourceProfession: z.string().max(250).optional(),
          sourceHome: z.string().max(250).optional(),
          sourceWorkplace: z.string().max(250).optional(),
          sourceGoal: z.string().max(1500).optional(),
        }),
      )
      .max(100),
    house: z.object({ place: id, seller: id, price: num }),
    production: z.object({
      place: id,
      owner: id,
      input: id,
      output: id,
      inputAmount: z.number().int().min(1).max(100),
      outputAmount: z.number().int().min(1).max(100),
      minutes: z.number().int().min(10).max(1440),
    }),
    needs: needsSchema.optional(),
    protectedFacts: z.array(z.string().max(200)).max(100),
  })
  .superRefine((w, c) => {
    const fail = (message: string) => c.addIssue({ code: "custom", message });
    for (const rows of [
      w.places,
      w.routes,
      w.accounts,
      w.items,
      w.stocks,
      w.agents,
    ])
      if (new Set(rows.map((r) => r.id)).size !== rows.length)
        fail("Повтор ID");
    if (
      new Set(w.stocks.map((s) => s.place + ":" + s.owner + ":" + s.item))
        .size !== w.stocks.length
    )
      fail("Повтор склада с тем же владельцем и товаром");
    const p = new Set(w.places.map((x) => x.id)),
      a = new Set(w.accounts.map((x) => x.id)),
      i = new Set(w.items.map((x) => x.id));
    for (const r of w.routes)
      if (!p.has(r.from) || !p.has(r.to) || r.from === r.to)
        fail("Некорректный маршрут");
    for (const s of w.stocks)
      if (!p.has(s.place) || !a.has(s.owner) || !i.has(s.item))
        fail("Некорректный запас");
    for (const n of w.agents)
      if (
        !p.has(n.home) ||
        !p.has(n.work) ||
        !a.has(n.account) ||
        !a.has(n.employer)
      )
        fail("Проверьте ссылки NPC");
    if (!p.has(w.house.place) || !a.has(w.house.seller))
      fail("Некорректное предложение дома");
    if (
      !p.has(w.production.place) ||
      !a.has(w.production.owner) ||
      !i.has(w.production.input) ||
      !i.has(w.production.output)
    )
      fail("Некорректное производство");
  });
export type WorldDefinition = z.infer<typeof worldSchema>;
export type WorldEvent = {
  id: string;
  minute: number;
  type: string;
  actor: string;
  place: string;
  text: string;
  witnesses: string[];
  data: Record<string, any>;
};
export type WorldAgent = {
  knownEventCount?: number;
  cargo?: { item: string; amount: number; owner: string; source: string };
  id: string;
  place: string;
  energy: number;
  hunger: number;
  action: Record<string, any>;
  reason: string;
  choices: { action: string; score: number; reason: string }[];
  goal: string;
  knowledge: string[];
  relationships: Record<string, number>;
  workMinutes: number;
  lastPaidDay: number;
  home: string;
  ownsHouse: boolean;
};
export type WorldState = {
  journalMode?: "external";
  obligations?: {
    id: string;
    from: string;
    to: string;
    amount: number;
    remaining: number;
    created: number;
    day: number;
    actor: string;
    kind: "wage" | "rent";
    label: string;
  }[];
  version: 1;
  coreVersion: string;
  contentHash: string;
  minute: number;
  seed: number;
  rng: number;
  agents: Record<string, WorldAgent>;
  accounts: Record<string, number>;
  stocks: Record<string, number>;
  owners: Record<string, string>;
  events: WorldEvent[];
  nextEvent: number;
  productionMinutes: number;
  ledger: string[];
  protectedFacts: string[];
  baselineMoney: number;
  baselineItems: Record<string, number>;
  produced: Record<string, number>;
  consumed: Record<string, number>;
};
const action = z.record(z.string(), z.unknown());
const agentState = z.object({
  knownEventCount: num.optional(),
  id,
  place: id,
  energy: z.number().int().min(0).max(1000),
  hunger: z.number().int().min(0).max(1000),
  action,
  reason: z.string().max(2000),
  choices: z
    .array(
      z.object({ action: z.string(), score: z.number(), reason: z.string() }),
    )
    .max(30),
  goal: z.string().max(500),
  knowledge: z.array(z.string()).max(15000),
  relationships: z.record(z.string(), z.number().min(-100).max(100)),
  workMinutes: num,
  lastPaidDay: z.number().int().min(-1),
  home: id,
  ownsHouse: z.boolean(),
  cargo: z.object({ item: id, amount: num, owner: id, source: id }).optional(),
});
const stateSchema = z.object({
  journalMode: z.literal("external").optional(),
  obligations: z
    .array(
      z.object({
        id: z.string().max(200),
        from: id,
        to: id,
        amount: num,
        remaining: num,
        created: num,
        day: num,
        actor: id,
        kind: z.enum(["wage", "rent"]),
        label: z.string().max(200),
      }),
    )
    .max(10000)
    .optional(),
  version: z.literal(1),
  coreVersion: z.literal("farlands-core-1"),
  contentHash: z.string().max(128),
  minute: num,
  seed: num,
  rng: z.number().int().min(0).max(2147483647),
  agents: z.record(z.string(), agentState),
  accounts: z.record(z.string(), num),
  stocks: z.record(z.string(), num),
  owners: z.record(z.string(), z.string()),
  events: z
    .array(
      z.object({
        id: z.string(),
        minute: num,
        type: z.string(),
        actor: z.string(),
        place: z.string(),
        text: z.string().max(2000),
        witnesses: z.array(z.string()),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .max(15000),
  nextEvent: num,
  productionMinutes: num,
  ledger: z.array(z.string()).max(20000),
  protectedFacts: z.array(z.string()),
  baselineMoney: num,
  baselineItems: z.record(z.string(), num),
  produced: z.record(z.string(), num),
  consumed: z.record(z.string(), num),
});
export const reportSchema = z
  .object({
    version: z.literal(1),
    rulesVersion: z
      .union([
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
      ])
      .optional(),
    coreVersion: z.literal("farlands-core-1"),
    contentHash: z.string().min(1).max(128),
    definition: worldSchema,
    state: stateSchema,
    journalId: z.string().uuid().optional(),
    archive: z
      .array(
        z.object({
          id: z.string(),
          minute: num,
          type: z.string(),
          actor: z.string(),
          place: z.string(),
          text: z.string().max(2000),
          witnesses: z.array(z.string()),
          data: z.record(z.string(), z.unknown()),
        }),
      )
      .max(1000000)
      .optional(),
    journal: z
      .object({
        count: num,
        parts: z
          .array(
            z.object({
              hash: z.string().regex(/^[a-f0-9]{64}$/),
              first: num,
              last: num,
              count: num,
            }),
          )
          .max(10000),
      })
      .optional(),
  })
  .superRefine((r, c) => {
    const fail = (message: string) => c.addIssue({ code: "custom", message });
    if (r.state.contentHash !== r.contentHash) fail("Разные версии снимка");
    const places = new Set(r.definition.places.map((p) => p.id));
    const accounts = new Set(r.definition.accounts.map((a) => a.id));
    const debts = r.state.obligations ?? [];
    if (new Set(debts.map((d) => d.id)).size !== debts.length)
      fail("Повтор обязательства");
    for (const debt of debts) {
      if (
        !accounts.has(debt.from) ||
        !accounts.has(debt.to) ||
        !r.state.agents[debt.actor] ||
        debt.remaining > debt.amount ||
        debt.created > r.state.minute
      )
        fail("Некорректное обязательство");
    }
    for (const n of r.definition.agents) {
      const a = r.state.agents[n.id];
      if (!a || !places.has(a.place) || !places.has(a.home))
        fail("Некорректное состояние NPC");
    }
    for (const a of Object.values(r.state.agents)) {
      const action = a.action as Record<string, any>;
      if (
        Object.keys(action).length &&
        (![
          "idle",
          "rest",
          "work",
          "travel",
          "eat",
          "buy",
          "pickup",
          "import_pickup",
          "deliver",
          "return_cargo",
          "meet",
          "social",
        ].includes(action.type) ||
          !Number.isInteger(action.remaining) ||
          action.remaining < 1)
      )
        fail("Некорректное действие");
      if (
        action.type === "travel" &&
        (!Array.isArray(action.legs) ||
          !action.legs.length ||
          !action.after ||
          !Number.isInteger(action.elapsed) ||
          !Number.isInteger(action.total) ||
          !places.has(action.to) ||
          !action.legs.every(
            (l: any) =>
              places.has(l.from) &&
              places.has(l.to) &&
              Number.isInteger(l.minutes) &&
              l.minutes > 0,
          ))
      )
        fail("Некорректный маршрут снимка");
    }
    const expectedMoney = r.definition.accounts.reduce(
      (sum, a) => sum + a.balance,
      0,
    );
    if (
      r.state.baselineMoney !== expectedMoney ||
      Object.values(r.state.accounts).reduce((sum, a) => sum + a, 0) !==
        expectedMoney
    )
      fail("Нарушен баланс денег");
    if (r.state.minute < 360 || r.state.minute > 43560)
      fail("Недопустимое время запуска");
    if (
      JSON.stringify(r.state.protectedFacts) !==
      JSON.stringify(r.definition.protectedFacts)
    )
      fail("Изменены защищённые факты");
    if (Object.keys(r.state.agents).length !== r.definition.agents.length)
      fail("Разный состав NPC");
    for (const [key, a] of Object.entries(r.state.agents))
      if (a.id !== key) fail("ID NPC не совпадает с ключом");
    for (const item of r.definition.items) {
      const initial = r.definition.stocks
        .filter((s) => s.item === item.id)
        .reduce((sum, s) => sum + s.amount, 0);
      let total = r.definition.stocks
        .filter((s) => s.item === item.id)
        .reduce((sum, s) => sum + (r.state.stocks[s.id] ?? 0), 0);
      for (const a of Object.values(r.state.agents))
        if (a.cargo?.item === item.id) total += a.cargo.amount;
      if (
        (r.state.baselineItems[item.id] ?? 0) !== initial ||
        total !==
          initial +
            (r.state.produced[item.id] ?? 0) -
            (r.state.consumed[item.id] ?? 0)
      )
        fail("Нарушен баланс товара " + item.id);
    }
    if (new Set(r.state.events.map((e) => e.id)).size !== r.state.events.length)
      fail("Повтор события");
    for (const a of r.definition.accounts)
      if (!(a.id in r.state.accounts)) fail("Нет счёта в снимке");
    for (const s of r.definition.stocks)
      if (!(s.id in r.state.stocks)) fail("Нет запаса в снимке");
  });
