import { describe, expect, it } from "vitest";
import { buildBurn, paceStatus } from "./burn";
import type { Trip, Transaction, TransactionOverride, Stay } from "./schemas";

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
    paymentMethod: null,
    city: null,
    isTransfer: false, isAtm: false,
    raw: null, syncedAt: 0,
    ...over,
  };
}

/** A hand-logged spend: source "manual", no Up category, a payment method. */
function manual(over: Partial<Transaction>): Transaction {
  return tx({
    source: "manual",
    upCategoryParent: null, upCategoryChild: null,
    cardPurchaseMethod: null,
    paymentMethod: "card",
    ...over,
  });
}

const noOverrides: TransactionOverride[] = [];
const noStays: Stay[] = [];

/** Manual rows keep their travel category on the override row. */
function cat(txnId: string, travelCategory: string, over: Partial<TransactionOverride> = {}): TransactionOverride {
  return {
    txnId, tripId: 1, travelCategory, stayId: null, spreadDays: null,
    countAsCredit: false, excluded: false, notes: null, ...over,
  };
}

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

describe("buildBurn - base case", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    tx({ id: "a", occurredAt: ms("2025-09-03"), amountAudCents: -50_00 }), // A$50 day 1
    tx({ id: "b", occurredAt: ms("2025-09-04"), amountAudCents: -120_00 }), // A$120 day 2
    tx({ id: "c", occurredAt: ms("2025-09-05"), amountAudCents: -240_00, upCategoryChild: "public-transport" }), // A$240 day 3 (over target)
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-05" });

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

describe("buildBurn - excludes transfers and ATM top-ups from burn", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    tx({ id: "spend", occurredAt: ms("2025-09-03"), amountAudCents: -50_00 }),
    tx({ id: "atm", occurredAt: ms("2025-09-03"), amountAudCents: -200_00, isAtm: true, cardPurchaseMethod: "ATM" }),
    tx({ id: "xfer-out", occurredAt: ms("2025-09-03"), amountAudCents: -100_00, isTransfer: true }),
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-03" });

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

describe("buildBurn - travel category override wins over Up's default", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    // Up tagged it "Hobbies" → would default to "sights"
    tx({ id: "x", occurredAt: ms("2025-09-03"), amountAudCents: -80_00, upCategoryChild: "hobbies" }),
  ];
  // User overrides to "health"
  const overrides: TransactionOverride[] = [
    { txnId: "x", tripId: 1, travelCategory: "health", stayId: null, spreadDays: null, countAsCredit: false, excluded: false, notes: null },
  ];
  const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, asOf: "2025-09-03" });
  const day = state.series[0]!;
  it("counts under the override bucket (health → Other)", () => {
    expect(day.Other).toBe(80);
    expect(day.Activities).toBe(0);
  });
  it("category breakdown shows 'health' not 'sights'", () => {
    expect(state.catBreakdownToday.items[0]!.cat).toBe("health");
  });
});

describe("buildBurn - accommodation amortisation", () => {
  const trip = makeTrip();
  // Stay: 8 nights starting day 1
  const stays: Stay[] = [{
    id: 100, tripId: 1, name: "Lisbon stay", city: "Lisbon",
    checkIn: "2025-09-03", nights: 8,
  }];
  // Two payments totalling A$800 - should spread to A$100/night
  const txns: Transaction[] = [
    tx({ id: "deposit", occurredAt: ms("2025-08-20"), amountAudCents: -200_00 }), // deposit (before trip; still linked)
    tx({ id: "balance", occurredAt: ms("2025-09-03"), amountAudCents: -600_00 }),
  ];
  const overrides: TransactionOverride[] = [
    { txnId: "deposit", tripId: 1, travelCategory: null, stayId: 100, spreadDays: null, countAsCredit: false, excluded: false, notes: null },
    { txnId: "balance", tripId: 1, travelCategory: null, stayId: 100, spreadDays: null, countAsCredit: false, excluded: false, notes: null },
  ];
  const state = buildBurn({ trip, transactions: txns, overrides, stays, asOf: "2025-09-10" });

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

describe("buildBurn - cash float", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    tx({ id: "atm", occurredAt: ms("2025-09-03"), amountAudCents: -100_00, isAtm: true, cardPurchaseMethod: "ATM" }),
    manual({ id: "coffee", occurredAt: ms("2025-09-03"), amountAudCents: -30_00, paymentMethod: "cash", description: "coffee" }),
  ];
  const state = buildBurn({
    trip, transactions: txns, overrides: [cat("coffee", "food")], stays: noStays, asOf: "2025-09-03",
  });

  it("a logged spend counts as burn", () => {
    expect(state.series[0]!.Food).toBe(30);
  });
  it("the ATM withdrawal fills the float and the cash spend draws it down", () => {
    expect(state.cashFloat).toBe(100 - 30);
  });

  it("a card-paid spend counts as burn but doesn't touch the float", () => {
    const rows: Transaction[] = [
      tx({ id: "atm", occurredAt: ms("2025-09-03"), amountAudCents: -100_00, isAtm: true, cardPurchaseMethod: "ATM" }),
      manual({ id: "split", occurredAt: ms("2025-09-03"), amountAudCents: -20_00, paymentMethod: "card", description: "split lunch" }),
    ];
    const s = buildBurn({
      trip, transactions: rows, overrides: [cat("split", "food")], stays: noStays, asOf: "2025-09-03",
    });
    expect(s.series[0]!.Food).toBe(20); // counts as burn
    expect(s.cashFloat).toBe(100); // float untouched
    expect(s.feed.find((r) => r.id === "split")?.isCash).toBe(false);
    expect(s.feed.find((r) => r.id === "atm")?.isCash).toBe(true);
  });

  it("cash still leaves the wallet even when the spend is excluded from burn", () => {
    const rows: Transaction[] = [
      tx({ id: "atm", occurredAt: ms("2025-09-03"), amountAudCents: -100_00, isAtm: true, cardPurchaseMethod: "ATM" }),
      manual({ id: "reimbursed", occurredAt: ms("2025-09-03"), amountAudCents: -40_00, paymentMethod: "cash" }),
    ];
    const s = buildBurn({
      trip, transactions: rows,
      overrides: [cat("reimbursed", "food", { excluded: true })],
      stays: noStays, asOf: "2025-09-03",
    });
    expect(s.cumulative).toBe(0);
    expect(s.cashFloat).toBe(60);
  });
});

describe("buildBurn - manual spends behave like any other transaction", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-09-30" });

  it("can be linked to a stay and amortised across its nights", () => {
    const stays: Stay[] = [{
      id: 7, tripId: 1, name: "Kotor hostel", city: "Kotor", checkIn: "2025-09-01", nights: 4,
    }];
    const txns = [manual({ id: "hostel", occurredAt: ms("2025-09-01"), amountAudCents: -400_00, paymentMethod: "cash" })];
    const overrides = [cat("hostel", "accommodation", { stayId: 7 })];
    const s = buildBurn({ trip, transactions: txns, overrides, stays, asOf: "2025-09-04" });

    expect(s.stays[0]!.totalCost).toBe(400);
    expect(s.stays[0]!.perNight).toBe(100);
    expect(s.series[0]!.total).toBe(100); // not a $400 spike on day one
    expect(s.feed.find((r) => r.id === "hostel")!.isAccom).toBe(true);
    // Paying the hostel in cash still empties the wallet.
    expect(s.cashFloat).toBe(-400);
  });

  it("can be spread across days", () => {
    const txns = [manual({ id: "pass", occurredAt: ms("2025-09-01"), amountAudCents: -50_00 })];
    const overrides = [cat("pass", "local-transport", { spreadDays: 5 })];
    const s = buildBurn({ trip, transactions: txns, overrides, stays: noStays, asOf: "2025-09-10" });
    for (let i = 0; i < 5; i++) expect(s.series[i]!.Transport).toBe(10);
    expect(s.cumulative).toBe(50);
  });

  it("back-dated spends land on the day they happened", () => {
    const txns = [manual({ id: "back", occurredAt: ms("2025-09-03"), amountAudCents: -25_00 })];
    const s = buildBurn({
      trip, transactions: txns, overrides: [cat("back", "food")], stays: noStays, asOf: "2025-09-06",
    });
    expect(s.series[2]!.Food).toBe(25); // 2025-09-03 is the third day
    expect(s.todayBurn).toBe(0);
    expect(s.feed.find((r) => r.id === "back")!.date).toBe("2025-09-03");
  });

  it("exposes source and paymentMethod on the feed row", () => {
    const txns = [manual({ id: "m", occurredAt: ms("2025-09-02"), amountAudCents: -12_00, paymentMethod: "other" })];
    const s = buildBurn({
      trip, transactions: txns, overrides: [cat("m", "food")], stays: noStays, asOf: "2025-09-02",
    });
    const row = s.feed.find((r) => r.id === "m")!;
    expect(row.source).toBe("manual");
    expect(row.paymentMethod).toBe("other");
    expect(row.isCash).toBe(false);
  });

  it("shows up among the biggest spends of the trip", () => {
    const txns = [
      tx({ id: "small", occurredAt: ms("2025-09-02"), amountAudCents: -20_00 }),
      manual({ id: "big", occurredAt: ms("2025-09-02"), amountAudCents: -300_00, description: "Boat day" }),
    ];
    const s = buildBurn({
      trip, transactions: txns, overrides: [cat("big", "sights")], stays: noStays, asOf: "2025-09-02",
    });
    expect(s.outliers[0]!.label).toBe("Boat day");
    expect(s.outliers[0]!.aud).toBe(300);
  });
});

describe("buildBurn - spends booked for a future day", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-09-30" });
  const txns: Transaction[] = [
    manual({ id: "today", occurredAt: ms("2025-09-05"), amountAudCents: -2000 }),
    manual({ id: "bus", occurredAt: ms("2025-09-12"), amountAudCents: -3500, description: "Flixbus to Girona" }),
  ];
  const overrides = [cat("today", "food"), cat("bus", "intercity")];
  const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, asOf: "2025-09-05" });

  it("stays visible in the feed rather than vanishing until its date", () => {
    expect(state.feed.find((r) => r.id === "bus")).toBeDefined();
  });

  it("is flagged upcoming so the UI can mark it", () => {
    expect(state.feed.find((r) => r.id === "bus")!.upcoming).toBe(true);
    expect(state.feed.find((r) => r.id === "today")!.upcoming).toBe(false);
  });

  it("doesn't touch burn, budget or the day series yet", () => {
    expect(state.cumulative).toBe(20);
    expect(state.todayBurn).toBe(20);
    expect(state.series.some((d) => d.Transport > 0)).toBe(false);
  });

  it("stays out of the biggest-spends list until it happens", () => {
    expect(state.outliers.map((o) => o.label)).not.toContain("Flixbus to Girona");
  });

  it("starts counting on its own day with no further action", () => {
    const later = buildBurn({ trip, transactions: txns, overrides, stays: noStays, asOf: "2025-09-12" });
    expect(later.series.find((d) => d.date === "2025-09-12")!.Transport).toBe(35);
    expect(later.cumulative).toBe(55);
    expect(later.feed.find((r) => r.id === "bus")!.upcoming).toBe(false);
    expect(later.outliers.map((o) => o.label)).toContain("Flixbus to Girona");
  });

  it("still drops anything past the end of the trip", () => {
    const beyond = [manual({ id: "after", occurredAt: ms("2025-10-15"), amountAudCents: -1000 })];
    const s = buildBurn({ trip, transactions: beyond, overrides: [], stays: noStays, asOf: "2025-09-05" });
    expect(s.feed).toHaveLength(0);
  });
});

describe("buildBurn - yesterday", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-09-30" });
  const txns: Transaction[] = [
    tx({ id: "d1", occurredAt: ms("2025-09-01"), amountAudCents: -40_00 }),
    tx({ id: "d2", occurredAt: ms("2025-09-02"), amountAudCents: -90_00 }),
    tx({ id: "d2b", occurredAt: ms("2025-09-02"), amountAudCents: -30_00, upCategoryChild: "public-transport" }),
    tx({ id: "d3", occurredAt: ms("2025-09-03"), amountAudCents: -10_00 }),
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-03" });

  it("reports the day before asOf", () => {
    expect(state.yesterdayRow?.date).toBe("2025-09-02");
    expect(state.yesterdayRow?.total).toBe(120);
  });

  it("breaks yesterday down by category, biggest first", () => {
    expect(state.catBreakdownYesterday?.items.map((i) => i.cat)).toEqual(["food", "local-transport"]);
    expect(state.catBreakdownYesterday?.total).toBe(120);
  });

  it("is null on the trip's first day", () => {
    const s = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-01" });
    expect(s.yesterdayRow).toBeNull();
    expect(s.catBreakdownYesterday).toBeNull();
  });
});

describe("buildBurn - completed trip", () => {
  const trip = makeTrip({ startDate: "2025-09-03", endDate: "2025-09-05" });
  const txns: Transaction[] = [
    tx({ id: "a", occurredAt: ms("2025-09-03"), amountAudCents: -100_00 }),
    tx({ id: "b", occurredAt: ms("2025-09-04"), amountAudCents: -100_00 }),
    tx({ id: "c", occurredAt: ms("2025-09-05"), amountAudCents: -100_00 }),
  ];
  // asOf in the future → clamps to trip end + flags complete
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2026-01-01" });

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

describe("buildBurn - feed clamps to trip window", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-11-06" });
  const txns: Transaction[] = [
    tx({ id: "before", occurredAt: ms("2025-08-15"), amountAudCents: -50_00 }),
    tx({ id: "in1", occurredAt: ms("2025-09-15"), amountAudCents: -50_00 }),
    tx({ id: "in2", occurredAt: ms("2025-11-06"), amountAudCents: -50_00 }),
    tx({ id: "after", occurredAt: ms("2026-06-13"), amountAudCents: -50_00 }), // post-trip
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2026-06-13" });

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
    const s = buildBurn({ trip, transactions: txns, overrides, stays, asOf: "2026-06-13" });
    expect(s.feed.find((r) => r.id === "before")?.isAccom).toBe(true);
  });
});

describe("buildBurn - spreadDays amortises across N days", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-09-10" });
  // A$100 transit pass on day 1, marked to spread across 5 days.
  const txns: Transaction[] = [
    tx({ id: "pass", occurredAt: ms("2025-09-01"), amountAudCents: -100_00, upCategoryChild: "public-transport" }),
  ];
  const overrides: TransactionOverride[] = [
    { txnId: "pass", tripId: 1, travelCategory: null, stayId: null, spreadDays: 5, countAsCredit: false, excluded: false, notes: null },
  ];
  const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, asOf: "2025-09-10" });

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

describe("buildBurn - incoming funds: shown in feed, opt-in to count", () => {
  const trip = makeTrip({ startDate: "2025-09-01", endDate: "2025-09-30" });
  const txns: Transaction[] = [
    tx({ id: "spend", occurredAt: ms("2025-09-05"), amountAudCents: -120_00 }),
    // Inter-account transfer - still hidden.
    tx({ id: "xfer-in", occurredAt: ms("2025-09-06"), amountAudCents: 500_00, isTransfer: true }),
    // Salary deposit - now shown in feed but does not count toward burn.
    tx({ id: "salary", occurredAt: ms("2025-09-07"), amountAudCents: 5000_00 }),
    // Refund - same default.
    tx({ id: "refund", occurredAt: ms("2025-09-08"), amountAudCents: 30_00 }),
  ];

  it("feed shows incoming funds but still hides transfers", () => {
    const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-30" });
    expect(state.feed.map((r) => r.id).sort()).toEqual(["refund", "salary", "spend"]);
  });

  it("incoming rows expose the incoming flag and positive aud magnitude", () => {
    const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-30" });
    const refund = state.feed.find((r) => r.id === "refund")!;
    expect(refund.incoming).toBe(true);
    expect(refund.aud).toBe(30);
    expect(refund.countsAsCredit).toBe(false);
  });

  it("burn cumulative unchanged by incoming funds when not opted in", () => {
    const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-30" });
    expect(state.cumulative).toBe(120);
  });

  it("with countAsCredit, a refund subtracts from that day's burn", () => {
    const overrides: TransactionOverride[] = [
      { txnId: "refund", tripId: 1, travelCategory: null, stayId: null, spreadDays: null, countAsCredit: true, excluded: false, notes: null },
    ];
    const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, asOf: "2025-09-30" });
    // Spend 120 on day 5, refund -30 on day 8 → cumulative 90.
    expect(state.cumulative).toBe(90);
    expect(state.feed.find((r) => r.id === "refund")!.countsAsCredit).toBe(true);
  });

  it("outliers still exclude positive-amount transactions", () => {
    const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-30" });
    expect(state.outliers.map((o) => o.label)).not.toContain("salary");
  });
});

describe("buildBurn - foreign amount is positive in the feed", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    // Spend of A$200 = USD -142.30 (signed) in major units
    tx({
      id: "fx", occurredAt: ms("2025-09-03"),
      amountAudCents: -200_00,
      foreignAmount: -142.30, foreignCurrency: "USD",
    }),
  ];
  const state = buildBurn({ trip, transactions: txns, overrides: noOverrides, stays: noStays, asOf: "2025-09-03" });
  const row = state.feed.find((r) => r.id === "fx")!;
  it("returns the absolute value with the currency code", () => {
    expect(row.foreign).toEqual({ value: 142.30, currencyCode: "USD" });
  });
});

describe("buildBurn - excluded transactions vanish from burn", () => {
  const trip = makeTrip();
  const txns: Transaction[] = [
    tx({ id: "real", occurredAt: ms("2025-09-03"), amountAudCents: -50_00 }),
    tx({ id: "noise", occurredAt: ms("2025-09-03"), amountAudCents: -500_00 }),
  ];
  const overrides: TransactionOverride[] = [
    { txnId: "noise", tripId: 1, travelCategory: null, stayId: null, spreadDays: null, countAsCredit: false, excluded: true, notes: "duplicate" },
  ];
  const state = buildBurn({ trip, transactions: txns, overrides, stays: noStays, asOf: "2025-09-03" });
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
