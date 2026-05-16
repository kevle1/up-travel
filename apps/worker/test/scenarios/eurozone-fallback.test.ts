import { describe, expect, it } from "vitest";
import { groupByCity } from "@up-travel/shared";
import type { Transaction, ItineraryEntry } from "@up-travel/shared";

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), tripId: 1, source: "up",
  occurredAt: 0, amountAudCents: -1000, foreignAmount: null, foreignCurrency: null,
  description: "x", upCategoryParent: null, upCategoryChild: null,
  isTransfer: false, isAtm: false, countsAsSpend: true, raw: null, syncedAt: 0, ...o,
});

describe("eurozone fallback", () => {
  it("unassigned EUR-only days bucket as Europe (unspecified)", () => {
    const itin: ItineraryEntry[] = [
      { id: 1, tripId: 1, startDate: "2025-09-01", endDate: "2025-09-07", city: "Berlin", country: "DE" },
    ];
    const txns = [
      tx({ occurredAt: Date.parse("2025-09-03T12:00:00Z"), amountAudCents: -1000 }),
      tx({ occurredAt: Date.parse("2025-09-20T12:00:00Z"), amountAudCents: -1000, foreignAmount: -1000, foreignCurrency: "EUR" }),
    ];
    const groups = groupByCity(txns, new Set(), itin);
    expect(groups.find((g) => g.label === "Berlin, DE")?.spent).toBe(1000);
    expect(groups.find((g) => g.label === "Europe (unspecified)")?.spent).toBe(1000);
  });
});
