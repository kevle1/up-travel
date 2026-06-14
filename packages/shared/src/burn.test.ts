import { describe, expect, it } from "vitest";
import { buildBurn, paceStatus } from "./burn";
import type { Trip, Transaction, TransactionOverride, Stay, CashLog } from "./schemas";

// Helpers ─────────────────────────────────────────────────────────────────────
const ms = (iso: string, hour = 12) => Date.parse(`${iso}T${String(hour).padStart(2, "0")}:00:00Z`);

function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: 1, name: "Test",
    startDate: "2025-09-03", endDate: "2025-11-05",
    budgetAudCents: 14_000_00, // A$14,000
    targetDailyAudCents: 200_00, // A$200/day
    currentCity: "Lisbon",
    isActive: true, createdAt: 0, archivedAt: null,
    ...over,
  };
}

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: "t",
    tripId: 1,
    source: "up",
    occurredAt: ms("2025-09-03"),
    amountAudCents: -1000, // A$10 spend by default
    foreignAmount: null, foreignCurrency: null,
    description: "Test", upCategoryParent: "good-life", upCategoryChild: "restaurants-and-cafes",
    cardPurchaseMethod: "CONTACTLESS",
    city: null,
    isTransfer: false, isAtm: false,
    raw: null, syncedAt: 0,
    ...over,
  };
}

const noOverrides: TransactionOverride[] = [];
const noStays: Stay[] = [];
const noCash: CashLog[] = [];

// Tests ───────────────────────────────────────────────────────────────────────

describe("paceStatus", () => {
  it("classifies under-target as good", () => {
    expect(paceStatus(150, 200)).toBe("good");
  });
  it("classifies near-target as watch", () => {
    expect(paceStatus(205, 200)).toBe("watch");
  });
  it("classifies over-target as over", () => {
    expect(paceStatus(250, 200)).toBe("over");
  });
});

describe("buildBurn — base case", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    tx({ id: "a", occurredAt: ms("2025-09-03"), amountAudCents: -50_00 }), // A$50 day 1
    tx({ id: "b", occurredAt: ms("2025-09-04"), amountAudCents: -120_00 }), // A$120 day 2
    tx({ id: "c", occurredAt: ms("2025-09-05"), amountAudCents: -240_00, upCategoryChild: "public-transport" }), // A$240 day 3 (over target)
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-05" });

  it("returns series spanning trip start → asOf", () => {
    expect(state.series).toHaveLength(3);
    expect(state.series[0]!.date).toBe("2025-09-03");
    expect(state.series[2]!.date).toBe("2025-09-05");
  });

  it("buckets food vs local-transport correctly", () => {
    expect(state.series[0]!.Food).toBe(50);
    expect(state.series[1]!.Food).toBe(120);
    expect(state.series[2]!.Transport).toBe(240);
  });

  it("computes cumulative spend in dollars", () => {
    expect(state.cumulative).toBe(410);
  });

  it("reports today's burn (last day in series)", () => {
    expect(state.todayBurn).toBe(240);
  });

  it("budget left = budget − cumulative", () => {
    expect(state.budgetLeft).toBe(14_000 - 410);
  });
});

describe("buildBurn — excludes transfers and ATM top-ups from burn", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    tx({ id: "spend", occurredAt: ms("2025-09-03"), amountAudCents: -50_00 }),
    tx({ id: "atm", occurredAt: ms("2025-09-03"), amountAudCents: -200_00, isAtm: true, cardPurchaseMethod: "ATM" }),
    tx({ id: "xfer-out", occurredAt: ms("2025-09-03"), amountAudCents: -100_00, isTransfer: true }),
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-03" });

  it("only the real spend counts toward burn", () => {
    expect(state.cumulative).toBe(50);
  });

  it("ATM withdrawal feeds the cash float, not burn", () => {
    expect(state.cashFloat).toBe(200);
  });

  it("ATM row exists in the feed but is marked internal", () => {
    const atmRow = state.feed.find((r) => r.id === "atm");
    expect(atmRow?.internal).toBe(true);
  });
});

describe("buildBurn — travel category override wins over Up's default", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    // Up tagged it "Hobbies" → would default to "sights"
    tx({ id: "x", occurredAt: ms("2025-09-03"), amountAudCents: -80_00, upCategoryChild: "hobbies" }),
  ];
  // User overrides to "health"
  const overrides: TransactionOverride[] = [
    { txnId: "x", tripId: 1, travelCategory: "health", stayId: null, spreadDays: null, countAsCredit: false, excluded: false, notes: null },
  ];
  const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-03" });
  const day = state.series[0]!;
  it("counts under the override bucket (health → Other)", () => {
    expect(day.Other).toBe(80);
    expect(day.Activities).toBe(0);
  });
  it("category breakdown shows 'health' not 'sights'", () => {
    expect(state.catBreakdownToday.items[0]!.cat).toBe("health");
  });
});

describe("buildBurn — accommodation amortisation", () => {
  const trip = makeTrip();
  // Stay: 8 nights starting day 1
  const stays: Stay[] = [{
    id: 100, tripId: 1, name: "Lisbon stay", city: "Lisbon",
    checkIn: "2025-09-03", nights: 8,
  }];
  // Two payments totalling A$800 — should spread to A$100/night
  const txns: Transaction[] = [
    tx({ id: "deposit", occurredAt: ms("2025-08-20"), amountAudCents: -200_00 }), // deposit (before trip; still linked)
    tx({ id: "balance", occurredAt: ms("2025-09-03"), amountAudCents: -600_00 }),
  ];
  const overrides: TransactionOverride[] = [
    { txnId: "deposit", tripId: 1, travelCategory: null, stayId: 100, spreadDays: null, countAsCredit: false, excluded: false, notes: null },
    { txnId: "balance", tripId: 1, travelCategory: null, stayId: 100, spreadDays: null, countAsCredit: false, excluded: false, notes: null },
  ];
  const state = buildBurn({ trip, transactions: txns, overrides, stays, cashLogs: noCash, asOf: "2025-09-10" });

  it("spreads the total evenly across the 8 nights", () => {
    expect(state.stays[0]!.totalCost).toBe(800);
    expect(state.stays[0]!.perNight).toBe(100);
  });

  it("adds Stay $100 to every night in the window", () => {
    // 2025-09-03 .. 09-10 = 8 days in series; first 8 nights of stay each get $100
    for (const day of state.series.slice(0, 7)) {
      expect(day.Stay).toBe(100);
    }
  });

  it("doesn't double-count the lump payments as a spike", () => {
    // day 1 should be exactly $100 (stay), not $700 (stay + lump balance).
    expect(state.series[0]!.total).toBe(100);
  });

  it("marks linked transactions as accom in the feed", () => {
    expect(state.feed.find((r) => r.id === "deposit")!.isAccom).toBe(true);
    expect(state.feed.find((r) => r.id === "balance")!.isAccom).toBe(true);
  });

  it("displays linked transactions under the Accommodation travel category", () => {
    expect(state.feed.find((r) => r.id === "deposit")!.category).toBe("accommodation");
    expect(state.feed.find((r) => r.id === "balance")!.category).toBe("accommodation");
    expect(state.feed.find((r) => r.id === "deposit")!.bucket).toBe("Stay");
  });
});

describe("buildBurn — cash float", () => {
  const trip = makeTrip();
  const cashLogs: CashLog[] = [
    { id: "spend1", tripId: 1, kind: "spend", occurredAt: ms("2025-09-03"), amountAudCents: 30_00, foreignAmount: null, foreignCurrency: null, travelCategory: "food", isCash: true, city: null, note: "coffee" },
    { id: "top1", tripId: 1, kind: "topup", occurredAt: ms("2025-09-03"), amountAudCents: 100_00, foreignAmount: null, foreignCurrency: null, travelCategory: "cash", isCash: true, city: null, note: null },
  ];
  const state = buildBurn({ trip, transactions: [], overrides: noOverrides, stays: noStays, cashLogs, asOf: "2025-09-03" });

  it("user spend counts as burn", () => {
    expect(state.series[0]!.Food).toBe(30);
  });
  it("user top-up adds to cash float", () => {
    expect(state.cashFloat).toBe(100 - 30);
  });

  it("isCash:false spend counts as burn but doesn't touch the float", () => {
    const logs: CashLog[] = [
      { id: "top", tripId: 1, kind: "topup", occurredAt: ms("2025-09-03"), amountAudCents: 100_00, foreignAmount: null, foreignCurrency: null, travelCategory: "cash", isCash: true, city: null, note: null },
      { id: "noncash", tripId: 1, kind: "spend", occurredAt: ms("2025-09-03"), amountAudCents: 20_00, foreignAmount: null, foreignCurrency: null, travelCategory: "food", isCash: false, city: null, note: "split lunch" },
    ];
    const s = buildBurn({ trip, transactions: [], overrides: noOverrides, stays: noStays, cashLogs: logs, asOf: "2025-09-03" });
    expect(s.series[0]!.Food).toBe(20); // counts as burn
    expect(s.cashFloat).toBe(100); // float untouched
    expect(s.feed.find((r) => r.id === "noncash")?.isCash).toBe(false);
    expect(s.feed.find((r) => r.id === "top")?.isCash).toBe(true);
  });
});

describe("buildBurn — completed trip", () => {
  const trip = makeTrip({ startDate: "2025-09-03", endDate: "2025-09-05" });
  const txns: Transaction[] = [
    tx({ id: "a", occurredAt: ms("2025-09-03"), amountAudCents: -100_00 }),
    tx({ id: "b", occurredAt: ms("2025-09-04"), amountAudCents: -100_00 }),
    tx({ id: "c", occurredAt: ms("2025-09-05"), amountAudCents: -100_00 }),
  ];
  // asOf in the future → clamps to trip end + flags complete
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2026-01-01" });

  it("clamps asOf to trip end", () => {
    expect(state.asOf).toBe("2025-09-05");
  });
  it("flags isComplete", () => {
    expect(state.isComplete).toBe(true);
  });
  it("computes finalEnd from cumulative", () => {
    expect(state.finalEnd).toBe(14_000 - 300);
  });
});

describe("buildBurn — feed clamps to trip window", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-11-06" });
  const txns: Transaction[] = [
    tx({ id: "before", occurredAt: ms("2025-08-15"), amountAudCents: -50_00 }),
    tx({ id: "in1", occurredAt: ms("2025-09-15"), amountAudCents: -50_00 }),
    tx({ id: "in2", occurredAt: ms("2025-11-06"), amountAudCents: -50_00 }),
    tx({ id: "after", occurredAt: ms("2026-06-13"), amountAudCents: -50_00 }), // post-trip
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2026-06-13" });

  it("clamps asOf to trip end for completed trips", () => {
    expect(state.asOf).toBe("2025-11-06");
  });

  it("feed excludes pre-trip and post-trip transactions", () => {
    const ids = state.feed.map((r) => r.id).sort();
    expect(ids).toEqual(["in1", "in2"]);
  });

  it("but keeps stay-linked transactions even if outside the window", () => {
    const stays: Stay[] = [{
      id: 1, tripId: 1, name: "Lisbon stay", city: "Lisbon",
      checkIn: "2025-09-01", nights: 5,
    }];
    const overrides: TransactionOverride[] = [
      { txnId: "before", tripId: 1, travelCategory: null, stayId: 1, spreadDays: null, countAsCredit: false, excluded: false, notes: null },
    ];
    const s = buildBurn({ trip, transactions: txns, overrides, stays, cashLogs: noCash, asOf: "2026-06-13" });
    expect(s.feed.find((r) => r.id === "before")?.isAccom).toBe(true);
  });
});

describe("buildBurn — spreadDays amortises across N days", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-09-10" });
  // A$100 transit pass on day 1, marked to spread across 5 days.
  const txns: Transaction[] = [
    tx({ id: "pass", occurredAt: ms("2025-09-01"), amountAudCents: -100_00, upCategoryChild: "public-transport" }),
  ];
  const overrides: TransactionOverride[] = [
    { txnId: "pass", tripId: 1, travelCategory: null, stayId: null, spreadDays: 5, countAsCredit: false, excluded: false, notes: null },
  ];
  const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-10" });

  it("each of the 5 days carries 1/5 of the total in the right bucket", () => {
    for (let i = 0; i < 5; i++) {
      expect(state.series[i]!.Transport).toBe(20);
    }
  });
  it("days outside the spread window have nothing on them", () => {
    expect(state.series[5]!.Transport).toBe(0);
  });
  it("cumulative still equals the lump-sum total", () => {
    expect(state.cumulative).toBe(100);
  });
  it("feed row exposes the spread count", () => {
    expect(state.feed.find((r) => r.id === "pass")?.spreadDays).toBe(5);
  });
});

describe("buildBurn — incoming funds: shown in feed, opt-in to count", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-09-30" });
  const txns: Transaction[] = [
    tx({ id: "spend", occurredAt: ms("2025-09-05"), amountAudCents: -120_00 }),
    // Inter-account transfer — still hidden.
    tx({ id: "xfer-in", occurredAt: ms("2025-09-06"), amountAudCents: 500_00, isTransfer: true }),
    // Salary deposit — now shown in feed but does not count toward burn.
    tx({ id: "salary", occurredAt: ms("2025-09-07"), amountAudCents: 5000_00 }),
    // Refund — same default.
    tx({ id: "refund", occurredAt: ms("2025-09-08"), amountAudCents: 30_00 }),
  ];

  it("feed shows incoming funds but still hides transfers", () => {
    const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-30" });
    expect(state.feed.map((r) => r.id).sort()).toEqual(["refund", "salary", "spend"]);
  });

  it("incoming rows expose the incoming flag and positive aud magnitude", () => {
    const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-30" });
    const refund = state.feed.find((r) => r.id === "refund")!;
    expect(refund.incoming).toBe(true);
    expect(refund.aud).toBe(30);
    expect(refund.countsAsCredit).toBe(false);
  });

  it("burn cumulative unchanged by incoming funds when not opted in", () => {
    const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-30" });
    expect(state.cumulative).toBe(120);
  });

  it("with countAsCredit, a refund subtracts from that day's burn", () => {
    const overrides: TransactionOverride[] = [
      { txnId: "refund", tripId: 1, travelCategory: null, stayId: null, spreadDays: null, countAsCredit: true, excluded: false, notes: null },
    ];
    const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-30" });
    // Spend 120 on day 5, refund -30 on day 8 → cumulative 90.
    expect(state.cumulative).toBe(90);
    expect(state.feed.find((r) => r.id === "refund")!.countsAsCredit).toBe(true);
  });

  it("outliers still exclude positive-amount transactions", () => {
    const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-30" });
    expect(state.outliers.map((o) => o.label)).not.toContain("salary");
  });
});

describe("buildBurn — foreign amount is positive in the feed", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    // Spend of A$200 = USD -142.30 (signed) in major units
    tx({
      id: "fx", occurredAt: ms("2025-09-03"),
      amountAudCents: -200_00,
      foreignAmount: -142.30, foreignCurrency: "USD",
    }),
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-03" });
  const row = state.feed.find((r) => r.id === "fx")!;
  it("returns the absolute value with the currency code", () => {
    expect(row.foreign).toEqual({ value: 142.30, currencyCode: "USD" });
  });
});

describe("buildBurn — excluded transactions vanish from burn", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    tx({ id: "real", occurredAt: ms("2025-09-03"), amountAudCents: -50_00 }),
    tx({ id: "noise", occurredAt: ms("2025-09-03"), amountAudCents: -500_00 }),
  ];
  const overrides: TransactionOverride[] = [
    { txnId: "noise", tripId: 1, travelCategory: null, stayId: null, spreadDays: null, countAsCredit: false, excluded: true, notes: "duplicate" },
  ];
  const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, cashLogs: noCash, asOf: "2025-09-03" });
  it("excluded amount removed from cumulative", () => {
    expect(state.cumulative).toBe(50);
  });
  it("excluded row stays in the feed but is flagged so the UI can grey it", () => {
    const row = state.feed.find((r) => r.id === "noise");
    expect(row).toBeDefined();
    expect(row!.excluded).toBe(true);
  });
  it("non-excluded rows have excluded:false on the feed", () => {
    expect(state.feed.find((r) => r.id === "real")!.excluded).toBe(false);
  });
});
