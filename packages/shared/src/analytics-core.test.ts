import { describe, expect, it } from "vitest";
import { dailyAllowance, paceDelta } from "./analytics-core";
import {
  categoryProgress,
  groupByCity,
  cashOnHand,
  dailyTrend,
  totals,
} from "./analytics-core";
import type { ItineraryEntry, Transaction } from "./schemas";

const tx = (over: Partial<Transaction>): Transaction => ({
  id: over.id ?? Math.random().toString(36),
  tripId: 1,
  source: "up",
  occurredAt: 0,
  amountAudCents: -1000,
  foreignAmount: null,
  foreignCurrency: null,
  description: "x",
  upCategoryParent: "good-life",
  upCategoryChild: null,
  isTransfer: false,
  isAtm: false,
  countsAsSpend: true,
  raw: null,
  syncedAt: 0,
  ...over,
});

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

describe("totals", () => {
  it("sums absolute spend respecting excludes and transfers", () => {
    const txns = [
      tx({ amountAudCents: -1000 }),
      tx({ amountAudCents: -2000, isTransfer: true }),
      tx({ amountAudCents: -5000, countsAsSpend: false }),
      tx({ amountAudCents: -700 }),
      tx({ amountAudCents: 300 }),
    ];
    const { spent } = totals(txns, new Set());
    expect(spent).toBe(1700 - 300);
  });

  it("respects exclude overrides", () => {
    const txns = [tx({ id: "a", amountAudCents: -1000 }), tx({ id: "b", amountAudCents: -2000 })];
    const excluded = new Set(["a"]);
    const { spent } = totals(txns, excluded);
    expect(spent).toBe(2000);
  });
});

describe("categoryProgress", () => {
  it("sums by parent and reports vs target", () => {
    const txns = [
      tx({ amountAudCents: -1000, upCategoryParent: "good-life" }),
      tx({ amountAudCents: -500, upCategoryParent: "good-life" }),
      tx({ amountAudCents: -2000, upCategoryParent: "transport" }),
    ];
    const budgets = new Map([
      ["good-life", 5000],
      ["transport", 5000],
    ]);
    const out = categoryProgress(txns, new Set(), budgets);
    const gl = out.find((r) => r.categoryKey === "good-life")!;
    expect(gl.spent).toBe(1500);
    expect(gl.target).toBe(5000);
    expect(gl.pct).toBeCloseTo(0.3);
  });

  it("buckets ATM withdrawals under cash regardless of Up parent", () => {
    const txns = [
      tx({ amountAudCents: -10000, isAtm: true, upCategoryParent: "personal" }),
    ];
    const out = categoryProgress(txns, new Set(), new Map());
    expect(out.find((r) => r.categoryKey === "cash")?.spent).toBe(10000);
  });
});

describe("groupByCity", () => {
  const itin: ItineraryEntry[] = [
    { id: 1, tripId: 1, startDate: "2026-06-01", endDate: "2026-06-10", city: "Tokyo", country: "JP" },
    { id: 2, tripId: 1, startDate: "2026-06-11", endDate: "2026-06-20", city: "Kyoto", country: "JP" },
  ];

  it("buckets by itinerary date range", () => {
    const d = (iso: string) => Date.parse(iso + "T12:00:00Z");
    const txns = [
      tx({ occurredAt: d("2026-06-05"), amountAudCents: -1000 }),
      tx({ occurredAt: d("2026-06-15"), amountAudCents: -2000 }),
    ];
    const groups = groupByCity(txns, new Set(), itin);
    expect(groups.find((g) => g.label === "Tokyo, JP")?.spent).toBe(1000);
    expect(groups.find((g) => g.label === "Kyoto, JP")?.spent).toBe(2000);
  });

  it("falls back to currency-derived country when itinerary has no match", () => {
    const txns = [
      tx({ occurredAt: Date.parse("2026-07-01T00:00:00Z"), foreignAmount: -1000, foreignCurrency: "THB" }),
      tx({ occurredAt: Date.parse("2026-07-02T00:00:00Z"), foreignAmount: -1000, foreignCurrency: "EUR" }),
    ];
    const groups = groupByCity(txns, new Set(), itin);
    expect(groups.find((g) => g.label === "Thailand")?.spent).toBe(1000);
    expect(groups.find((g) => g.label === "Europe (unspecified)")?.spent).toBe(1000);
  });
});

describe("cashOnHand", () => {
  it("ATM withdrawals minus non-counting manual entries", () => {
    const txns = [
      tx({ id: "atm1", isAtm: true, amountAudCents: -50000 }),
      tx({ id: "m1", source: "manual", countsAsSpend: false, amountAudCents: -1500 }),
      tx({ id: "m2", source: "manual", countsAsSpend: false, amountAudCents: -800 }),
      tx({ id: "m3", source: "manual", countsAsSpend: true, amountAudCents: -2000 }),
    ];
    expect(cashOnHand(txns)).toBe(50000 - 1500 - 800);
  });
});

describe("dailyTrend", () => {
  it("returns one entry per day in range with zero for empty days", () => {
    const d = (iso: string) => Date.parse(iso + "T00:00:00Z");
    const txns = [
      tx({ occurredAt: d("2026-06-01"), amountAudCents: -1000 }),
      tx({ occurredAt: d("2026-06-01"), amountAudCents: -500 }),
      tx({ occurredAt: d("2026-06-03"), amountAudCents: -700 }),
    ];
    const trend = dailyTrend(txns, new Set(), "2026-06-01", "2026-06-03");
    expect(trend).toEqual([
      { date: "2026-06-01", spent: 1500 },
      { date: "2026-06-02", spent: 0 },
      { date: "2026-06-03", spent: 700 },
    ]);
  });
});
