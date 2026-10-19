import { z } from "zod";
import { needsSchema } from "./needs.js";
import {
  lifeDefinition,
  lifeState,
  lifeReferenceError,
  requestStages,
  type LifeState,
} from "./life.js";
import {
  mechanicsSchema,
  mechanicsStateSchema,
  mechanicChangeSchema,
  mechanicsSnapshotError,
  type MechanicsState,
  type MechanicChange,
} from "./mechanics.js";
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
    mechanics: mechanicsSchema.optional(),
    life: lifeDefinition.optional(),
    cooking: z
      .object({
        enabled: z.boolean(),
        input: id,
        output: id,
        inputAmount: z.number().int().min(1).max(100),
        outputAmount: z.number().int().min(1).max(100),
        minutes: z.number().int().min(10).max(1440),
      })
      .optional(),
    needs: needsSchema.optional(),
    protectedFacts: z.array(z.string().max(200)).max(100),
  })
  .superRefine((w, c) => {
    const fail = (message: string) => c.addIssue({ code: "custom", message });
    const lifeError = lifeReferenceError(
      w.life,
      w.agents.map((a) => a.id),
    );
    if (lifeError) fail(lifeError);
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
    if (w.cooking?.enabled) {
      const recipe = w.cooking;
      if (
        recipe.input !== w.production.output ||
        recipe.input === recipe.output ||
        !w.items.some((x) => x.id === recipe.output)
      )
        fail(
          "Кухня должна использовать результат производства и отдельный товар блюда",
        );
      for (const item of [recipe.input, recipe.output])
        if (
          !w.stocks.some(
            (s) =>
              s.place === "tavern" &&
              s.owner === "inn_business" &&
              s.item === item,
          )
        )
          fail("Кухне нужны склады сырья и блюд в таверне");
    }
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
  mechanicTrace?: MechanicChange[];
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
  life?: LifeState;
  mechanics?: MechanicsState;
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
  cookingMinutes?: number;
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
  mechanicTrace: z.array(mechanicChangeSchema).max(12).optional(),
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
  mechanics: mechanicsStateSchema.optional(),
  life: lifeState.optional(),
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
  cookingMinutes: num.optional(),
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
        z.literal(7),
        z.literal(8),
        z.literal(9),
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
    const life = r.state.life;
    if (life && !r.definition.life?.enabled)
      fail("Состояние выключенного жизненного слоя");
    if (!life && r.definition.life?.enabled && (r.rulesVersion ?? 7) >= 8)
      fail("Пропало состояние жизненного слоя");
    if (life) {
      if ((r.rulesVersion ?? 8) >= 9 && life.version !== 2)
        fail("Требуется версия 2 жизненного состояния");
      if (life.processedThrough !== r.state.nextEvent - 1)
        fail("Неверный причинный курсор");
      const ids = Object.keys(r.state.agents);
      for (const group of [life.relations, life.goals, life.traces])
        if (
          Object.keys(group).length !== ids.length ||
          ids.some((id) => !(id in group))
        )
          fail("Разный состав жизненного слоя");
      const causeOK = (cause: string) =>
        !cause ||
        (/^event_[1-9]\d*$/.test(cause) &&
          Number(cause.slice(6)) < r.state.nextEvent);
      for (const [actor, rels] of Object.entries(life.relations))
        for (const [other, scores] of Object.entries(rels))
          if (
            !ids.includes(other) ||
            actor === other ||
            !causeOK(scores.cause) ||
            (r.state.agents[actor]?.relationships[other] ?? 0) !==
              scores.affinity
          )
            fail("Несовместимое направленное отношение");
      for (const [actor, goals] of Object.entries(life.goals))
        for (const [key, g] of Object.entries(goals)) {
          if (
            key !== g.kind ||
            g.updated < 360 ||
            g.updated > r.state.minute ||
            !causeOK(g.cause)
          )
            fail("Неверная причина цели");
          if (
            g.kind === "housing" &&
            (g.status === "completed") !== r.state.agents[actor]?.ownsHouse
          )
            fail("Состояние жилищной цели не совпало");
          if (g.kind === "debt") {
            const npc = r.definition.agents.find((a) => a.id === actor),
              amount = (r.state.obligations ?? [])
                .filter((d) => d.from === npc?.account)
                .reduce((s, d) => s + d.remaining, 0);
            if (
              g.amount !== amount ||
              (g.status === "completed") !== (amount === 0)
            )
              fail("Состояние долговой цели не совпало");
          }
        }
      for (const traces of Object.values(life.traces))
        for (const t of traces)
          if (t.minute > r.state.minute || !causeOK(t.cause))
            fail("Неверный жизненный след");
      for (const [id, q] of Object.entries(life.quests)) {
        const rule = r.definition.life?.requests.find((x) => x.id === id);
        if (rule && life.version === 1 && rule.stages)
          fail("Старое состояние не доказывает новые этапы");
        if (rule && life.version === 2) {
          const plan = requestStages(rule);
          if (
            !q.stages ||
            q.cursor === undefined ||
            q.stages.length !== plan.length ||
            q.cursor > plan.length ||
            (q.status === "completed") !== (q.cursor === plan.length)
          )
            fail("Неверный план просьбы");
          else {
            let last = 0,
              lastTime = q.created;
            for (let i = 0; i < plan.length; i++) {
              const step = q.stages[i]!;
              if (step.id !== plan[i]!.id) fail("Подменён этап");
              if (i < q.cursor) {
                const serial = Number(step.cause.slice(6));
                if (
                  step.status !== "completed" ||
                  !causeOK(step.cause) ||
                  serial <= last ||
                  step.completedAt === undefined ||
                  step.completedAt < lastTime ||
                  step.completedAt > q.updated ||
                  step.completedAt >= q.deadline
                )
                  fail("Нет доказательства этапа");
                last = serial;
                lastTime = step.completedAt ?? 0;
              } else if (
                step.status !== "pending" ||
                step.cause ||
                step.completedAt !== undefined
              )
                fail("Будущий этап изменён");
            }
          }
        }
        if (
          !rule ||
          q.issuer !== rule.issuer ||
          q.actor !== rule.actor ||
          q.target !== rule.target ||
          q.created > q.updated ||
          q.updated > r.state.minute ||
          q.deadline !== q.created + rule.deadlineMinutes ||
          !causeOK(q.cause) ||
          (q.status === "active" && q.deadline <= r.state.minute) ||
          (q.status === "completed" && q.updated >= q.deadline) ||
          (q.status === "expired" && q.updated < q.deadline)
        )
          fail("Неверное состояние просьбы");
      }
    }
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
          "mechanic",
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
    const mechanicsError = mechanicsSnapshotError(
      r.definition.mechanics,
      r.state.mechanics,
      Object.keys(r.state.agents),
      !!r.definition.cooking?.enabled,
    );
    if (mechanicsError) fail(mechanicsError);
    for (const actor of Object.values(r.state.agents)) {
      const pending = (
        actor.action.type === "travel" ? actor.action.after : actor.action
      ) as Record<string, any> | undefined;
      if (pending?.type === "mechanic") {
        const module = r.definition.mechanics?.modules.find(
          (m) => m.enabled && m.id === pending.module,
        );
        const action = module?.actions.find(
          (a) => a.id === pending.mechanicAction,
        );
        if (
          !action ||
          typeof pending.remaining !== "number" ||
          pending.remaining < 1 ||
          pending.remaining > action.minutes
        )
          fail("Неизвестное действие механики в снимке");
      }
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
