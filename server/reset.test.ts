import { expect, it } from "vitest";
import { nextDailyReset, pacificDay } from "../src/quota.js";
it("uses Pacific midnight with daylight saving time, not a fixed UTC offset", () => {
  expect(
    new Date(nextDailyReset(Date.parse("2026-10-09T12:00:00Z"))).toISOString(),
  ).toBe("2026-10-10T07:00:00.000Z");
  expect(
    new Date(nextDailyReset(Date.parse("2026-12-09T12:00:00Z"))).toISOString(),
  ).toBe("2026-12-10T08:00:00.000Z");
  expect(pacificDay(Date.parse("2026-10-09T06:00:00Z"))).toBe("2026-10-08");
  expect(
    new Date(nextDailyReset(Date.parse("2026-11-01T12:00:00Z"))).toISOString(),
  ).toBe("2026-11-02T08:00:00.000Z");
});
