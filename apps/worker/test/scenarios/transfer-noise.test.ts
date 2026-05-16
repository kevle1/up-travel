import { describe, expect, it } from "vitest";
import { totals } from "@up-travel/shared";
import type { Transaction } from "@up-travel/shared";

const tx = (o: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), tripId: 1, source: "up",
  occurredAt: 0, amountAudCents: -1000, foreignAmount: null, foreignCurrency: null,
  description: "x", upCategoryParent: null, upCategoryChild: null,
  isTransfer: false, isAtm: false, countsAsSpend: true, raw: null, syncedAt: 0, ...o,
});

describe("transfer noise", () => {
  it("inter-account transfers do not contribute to spend", () => {
    const txns = [
      tx({ amountAudCents: -1000 }),
      tx({ amountAudCents: -50000, isTransfer: true }),
      tx({ amountAudCents: 50000, isTransfer: true }),
      tx({ amountAudCents: -2000 }),
    ];
    expect(totals(txns, new Set()).spent).toBe(3000);
  });
});
