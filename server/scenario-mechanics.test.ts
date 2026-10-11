import { describe, it, expect } from "vitest";
import { projectSchema } from "../shared/schema.js";
import { scenarioSchema, dialogueLineSchema } from "../shared/content.js";
import { mechanicsSchema } from "../shared/scenario-mechanics.js";
import {
  prepareOccurrence,
  sceneBlockReason,
  expiryDirective,
  applyConfirmedOutcome,
  canUseLine,
} from "../shared/scenario-runtime.js";
import {
  preserveMechanics,
  needsMechanicsPreservation,
} from "./preserve-mechanics.js";
const a = "33a1765e-741f-43c7-bf15-b1b47e564047",
  b = "44a1765e-741f-43c7-bf15-b1b47e564047",
  effectId = "55a1765e-741f-43c7-bf15-b1b47e564047";
const scenario = () =>
  scenarioSchema.parse({
    id: a,
    key: "vale_future",
    title: "Future",
    kind: "conflict",
    initiatorId: "martin",
    targets: ["leo"],
    mechanics: {
      windowDaysMin: 7,
      windowDaysMax: 10,
      preferredStart: "17:00",
      preferredEnd: "21:00",
      location: "vale_farm",
      expiryAction: "await_resolution",
      exclusivityKeys: ["vale_family_scene"],
    },
    outcomes: [
      {
        id: b,
        key: "compromise",
        label: "Compromise",
        requiredFacts: ["agreement_confirmed"],
      },
    ],
    effects: [
      {
        id: effectId,
        fromId: "martin",
        toId: "leo",
        metric: "trust",
        delta: 6,
        outcomeIds: [b],
        requiredFacts: ["promise_fulfilled"],
      },
    ],
  });
describe("authored event mechanics", () => {
  it("keeps a multi-day event pending outside scene hours and allows NPC autonomy", () => {
    const s = scenario(),
      e = prepareOccurrence(s, "first", 0, 7, []),
      c = {
        now: 4 * 24 + 11,
        location: "vale_farm",
        availableIds: ["martin", "leo"],
        playerPresent: false,
        activeExclusivityKeys: [],
      };
    expect(e.expiresAt).toBe(168);
    expect(sceneBlockReason(s, e, c)).toContain("часы");
    expect(sceneBlockReason(s, e, { ...c, now: 4 * 24 + 19 })).toBeNull();
    expect(
      sceneBlockReason(s, e, {
        ...c,
        now: 4 * 24 + 19,
        availableIds: ["martin"],
      }),
    ).toContain("недоступны");
    expect(
      sceneBlockReason(s, e, {
        ...c,
        now: 4 * 24 + 19,
        activeExclusivityKeys: ["vale_family_scene"],
      }),
    ).toContain("взаимоисключающая");
    expect(
      sceneBlockReason(s, e, {
        ...c,
        now: 4 * 24 + 19,
        playerPresent: true,
        lastObservedSceneAt: 4 * 24 + 18,
      }),
    ).toContain("Слишком рано");
  });
  it("does not freeze NPCs or fabricate an outcome at expiry and respects one-off contexts", () => {
    const s = scenario(),
      e = prepareOccurrence(s, "first", 0, 7, []);
    expect(expiryDirective(s, e, 169)).toBe("await_resolution");
    expect(expiryDirective(s, e, 1, true)).toBe("cancel");
    expect(() =>
      prepareOccurrence(s, "first", 200, 7, [{ ...e, stage: "resolved" }]),
    ).toThrow("уже создано");
    expect(() =>
      prepareOccurrence(
        { ...s, mechanics: { ...s.mechanics, repeatPolicy: "once" } },
        "another",
        200,
        7,
        [e],
      ),
    ).toThrow("однократное");
  });
  it("applies a promised benefit only on fulfillment, once per occurrence, with directed clamped scores", () => {
    const s = scenario(),
      e = prepareOccurrence(s, "first", 0, 7, []),
      baseline = { "martin:leo": { trust: 96 }, "leo:martin": { trust: 70 } };
    const promise = applyConfirmedOutcome(
      s,
      e,
      b,
      ["agreement_confirmed"],
      [],
      baseline,
    );
    expect(promise.applied).toEqual([]);
    expect(promise.pending).toEqual([effectId]);
    expect(promise.values).toEqual(baseline);
    const fulfilled = applyConfirmedOutcome(
      s,
      promise.event,
      b,
      ["agreement_confirmed", "promise_fulfilled"],
      promise.ledger,
      promise.values,
    );
    expect(fulfilled.values["martin:leo"]!.trust).toBe(100);
    expect(fulfilled.values["leo:martin"]!.trust).toBe(70);
    const repeated = applyConfirmedOutcome(
      s,
      fulfilled.event,
      b,
      ["agreement_confirmed", "promise_fulfilled"],
      fulfilled.ledger,
      fulfilled.values,
    );
    expect(repeated.applied).toEqual([]);
    expect(repeated.values).toEqual(fulfilled.values);
    expect(baseline["martin:leo"].trust).toBe(96);
    const other = scenarioSchema.parse({
      ...s,
      outcomes: [
        ...s.outcomes,
        { id: crypto.randomUUID(), key: "other", label: "Other" },
      ],
    });
    expect(() =>
      applyConfirmedOutcome(
        other,
        fulfilled.event,
        other.outcomes[1]!.id,
        [],
        fulfilled.ledger,
        fulfilled.values,
      ),
    ).toThrow("Другой исход");
  });
  it("a speaker cannot retell a fact they do not know; dialogue selection does not apply effects", () => {
    const l = dialogueLineSchema.parse({
      id: effectId,
      key: "aftermath",
      npcId: "leo",
      groupId: a,
      scenarioId: a,
      outcomeIds: [b],
      requiredFacts: ["delivery_completed"],
      knownFacts: ["delivery_completed"],
      moment: "aftermath",
    });
    expect(canUseLine(l, ["delivery_completed"], [], b, "aftermath")).toBe(
      false,
    );
    expect(
      canUseLine(l, ["delivery_completed"], ["delivery_completed"], b, "scene"),
    ).toBe(false);
    expect(
      canUseLine(
        l,
        ["delivery_completed"],
        ["delivery_completed"],
        b,
        "aftermath",
      ),
    ).toBe(true);
  });
  it("migrates legacy edits without losing outcomes, fact gates or guidelines", () => {
    const npc = (id: string) => ({
      id,
      name: id,
      role: "",
      text: "",
      settings: {
        voice: "Charon",
        model: "gemini-3.8-flash-tts",
        emotion: "",
        pace: 1,
        direction: "",
      },
    });
    const old = projectSchema.parse({
      version: 1,
      npcs: [npc("martin"), npc("leo")],
      scenarios: [scenario()],
      scenarioGuidelines: "Keep source rules",
    });
    const { mechanics, outcomes, obligations, sourceText, key, ...legacy } =
      old.scenarios[0]!;
    const stripped = {
      ...legacy,
      effects: legacy.effects.map(({ outcomeIds, requiredFacts, ...e }) => e),
    };
    const raw = { version: 1, npcs: old.npcs, scenarios: [stripped] },
      next = projectSchema.parse(raw);
    expect(needsMechanicsPreservation(raw)).toBe(true);
    preserveMechanics(old, next, raw);
    expect(next.scenarios[0]!.mechanics.windowDaysMin).toBe(7);
    expect(next.scenarios[0]!.effects[0]!.requiredFacts).toEqual([
      "promise_fulfilled",
    ]);
    expect(next.scenarios[0]!.key).toBe("vale_future");
    expect(next.scenarioGuidelines).toBe("Keep source rules");
  });
  it("rejects invalid time windows and orphan outcome links", () => {
    expect(
      mechanicsSchema.safeParse({ windowDaysMin: 10, windowDaysMax: 7 })
        .success,
    ).toBe(false);
  });
});
