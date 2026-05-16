import { describe, expect, it } from "vitest";
import { dailyAllowance, paceDelta } from "./analytics-core";

describe("dailyAllowance", () => {
  it("divides remaining by days_left", () => {
    expect(dailyAllowance(10_000_00, 100)).toBe(100_00);
  });
  it("returns 0 when days_left <= 0", () => {
    expect(dailyAllowance(10_000_00, 0)).toBe(0);
    expect(dailyAllowance(10_000_00, -5)).toBe(0);
  });
  it("returns 0 when remaining <= 0", () => {
    expect(dailyAllowance(0, 100)).toBe(0);
    expect(dailyAllowance(-1, 100)).toBe(0);
  });
});

describe("paceDelta", () => {
  it("returns 0 on day 0", () => {
    expect(paceDelta({ spent: 0, daysElapsed: 0, totalDays: 365, budgetAudCents: 8_000_000_00 })).toBe(0);
  });
  it("positive delta means over target daily spend", () => {
    const target = 8_000_000_00 / 365;
    const actual = target + 10_00;
    const r = paceDelta({
      spent: actual * 10,
      daysElapsed: 10,
      totalDays: 365,
      budgetAudCents: 8_000_000_00,
    });
    expect(r).toBeCloseTo(10_00, 0);
  });
  it("negative delta means under (underspending)", () => {
    const target = 8_000_000_00 / 365;
    const actual = target - 20_00;
    const r = paceDelta({
      spent: actual * 50,
      daysElapsed: 50,
      totalDays: 365,
      budgetAudCents: 8_000_000_00,
    });
    expect(r).toBeCloseTo(-20_00, 0);
  });
});
