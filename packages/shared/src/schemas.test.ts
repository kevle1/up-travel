import { describe, expect, it } from "vitest";
import {
  TripSchema,
  TransactionSchema,
  ItineraryEntrySchema,
  ManualEntryInputSchema,
  CategoryBudgetSchema,
  UpTransactionSchema,
} from "./schemas";

describe("TripSchema", () => {
  it("accepts a valid trip", () => {
    const trip = {
      id: 1,
      name: "Year Trip",
      startDate: "2026-06-01",
      endDate: null,
      budgetAudCents: 8_000_000_000,
      isActive: true,
      createdAt: 1716000000000,
      archivedAt: null,
    };
    expect(() => TripSchema.parse(trip)).not.toThrow();
  });

  it("rejects negative budget", () => {
    expect(() =>
      TripSchema.parse({
        id: 1,
        name: "x",
        startDate: "2026-06-01",
        endDate: null,
        budgetAudCents: -1,
        isActive: true,
        createdAt: 0,
        archivedAt: null,
      }),
    ).toThrow();
  });
});

describe("TransactionSchema", () => {
  it("accepts a synced Up transaction", () => {
    const txn = {
      id: "abc",
      tripId: 1,
      source: "up" as const,
      occurredAt: 1716000000000,
      amountAudCents: -1234,
      foreignAmount: null,
      foreignCurrency: null,
      description: "Cafe",
      upCategoryParent: "good-life",
      upCategoryChild: "restaurants-and-cafes",
      isTransfer: false,
      isAtm: false,
      countsAsSpend: true,
      raw: { foo: "bar" },
      syncedAt: 1716000001000,
    };
    expect(() => TransactionSchema.parse(txn)).not.toThrow();
  });

  it("requires foreign_amount and currency together", () => {
    const t = {
      id: "x", tripId: 1, source: "manual" as const,
      occurredAt: 0, amountAudCents: -100,
      foreignAmount: 1000, foreignCurrency: null,
      description: "x", upCategoryParent: null, upCategoryChild: null,
      isTransfer: false, isAtm: false, countsAsSpend: true, raw: null, syncedAt: 0,
    };
    expect(() => TransactionSchema.parse(t)).toThrow();
  });
});

describe("ItineraryEntrySchema", () => {
  it("requires end_date >= start_date", () => {
    expect(() =>
      ItineraryEntrySchema.parse({
        id: 1, tripId: 1, startDate: "2026-06-10", endDate: "2026-06-01",
        city: "Tokyo", country: "JP",
      }),
    ).toThrow();
  });

  it("requires 2-letter ISO country", () => {
    expect(() =>
      ItineraryEntrySchema.parse({
        id: 1, tripId: 1, startDate: "2026-06-01", endDate: "2026-06-10",
        city: "Tokyo", country: "JAPAN",
      }),
    ).toThrow();
  });
});

describe("ManualEntryInputSchema", () => {
  it("requires foreignCurrency when foreignAmount given", () => {
    expect(() =>
      ManualEntryInputSchema.parse({
        amountAudCents: -1000,
        foreignAmount: 100,
        foreignCurrency: null,
        occurredAt: 0,
        description: "x",
        category: "good-life",
        countsAsSpend: false,
      }),
    ).toThrow();
  });
});

describe("CategoryBudgetSchema", () => {
  it("accepts valid", () => {
    expect(() =>
      CategoryBudgetSchema.parse({
        tripId: 1, categoryKey: "good-life", targetAudCents: 1_000_000_000,
      }),
    ).not.toThrow();
  });
});

describe("UpTransactionSchema", () => {
  it("parses the slice we care about from Up's response", () => {
    const up = {
      id: "txn-1",
      attributes: {
        status: "SETTLED",
        rawText: "CAFE TOKYO",
        description: "Cafe Tokyo",
        amount: { value: "-12.34", valueInBaseUnits: -1234, currencyCode: "AUD" },
        foreignAmount: { value: "-1500", valueInBaseUnits: -150000, currencyCode: "JPY" },
        createdAt: "2025-09-15T10:00:00+09:00",
      },
      relationships: {
        account: { data: { id: "acct-spending", type: "accounts" } },
        category: { data: { id: "restaurants-and-cafes", type: "categories" } },
        parentCategory: { data: { id: "good-life", type: "categories" } },
        transferAccount: { data: null },
      },
    };
    const parsed = UpTransactionSchema.parse(up);
    expect(parsed.id).toBe("txn-1");
    expect(parsed.attributes.amount.valueInBaseUnits).toBe(-1234);
  });
});
