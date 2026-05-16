import { describe, expect, it } from "vitest";
import { totals, cashOnHand } from "@up-travel/shared";
import type { Transaction } from "@up-travel/shared";

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), tripId: 1, source: "up",
  occurredAt: 0, amountAudCents: -1000, foreignAmount: null, foreignCurrency: null,
  description: "x", upCategoryParent: null, upCategoryChild: null,
  isTransfer: false, isAtm: false, countsAsSpend: true, raw: null, syncedAt: 0,
  ...over,
});

describe("ATM + manual entries scenario", () => {
  it("ATM counts as spend; non-counting manual entries do not double-count", () => {
    const txns: Transaction[] = [
      tx({ isAtm: true, amountAudCents: -50000 }),
      tx({ source: "manual", countsAsSpend: false, amountAudCents: -3000 }),
      tx({ source: "manual", countsAsSpend: false, amountAudCents: -2000 }),
    ];
    expect(totals(txns, new Set()).spent).toBe(50000);
    expect(cashOnHand(txns)).toBe(50000 - 3000 - 2000);
  });

  it("counts_as_spend=true manual entry adds to total", () => {
    const txns: Transaction[] = [
      tx({ isAtm: true, amountAudCents: -50000 }),
      tx({ source: "manual", countsAsSpend: true, amountAudCents: -10000 }),
    ];
    expect(totals(txns, new Set()).spent).toBe(60000);
  });
});
