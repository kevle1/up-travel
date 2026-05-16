import { describe, expect, it } from "vitest";
import { classifyUpTransaction } from "../../src/sync/classify";

const upTxn = (over: Record<string, unknown>) => ({
  id: "x",
  attributes: {
    status: "SETTLED",
    rawText: null,
    description: "Generic",
    amount: { value: "-12.34", valueInBaseUnits: -1234, currencyCode: "AUD" },
    foreignAmount: null,
    createdAt: "2025-09-15T10:00:00+10:00",
  },
  relationships: {
    account: { data: { id: "spending", type: "accounts" } },
    category: { data: { id: "restaurants-and-cafes", type: "categories" } },
    parentCategory: { data: { id: "good-life", type: "categories" } },
    transferAccount: { data: null },
  },
  ...over,
});

describe("classifyUpTransaction", () => {
  it("flags inter-account transfer when transferAccount present", () => {
    const c = classifyUpTransaction(upTxn({
      relationships: {
        account: { data: { id: "spending", type: "accounts" } },
        category: { data: null },
        parentCategory: { data: null },
        transferAccount: { data: { id: "saver-1", type: "accounts" } },
      },
    }));
    expect(c.isTransfer).toBe(true);
  });

  it("flags ATM via cash-withdrawals category", () => {
    const c = classifyUpTransaction(upTxn({
      relationships: {
        account: { data: { id: "spending", type: "accounts" } },
        category: { data: { id: "cash-withdrawals", type: "categories" } },
        parentCategory: { data: { id: "transport", type: "categories" } },
        transferAccount: { data: null },
      },
    }));
    expect(c.isAtm).toBe(true);
  });

  it("flags ATM via description fallback when category absent", () => {
    const c = classifyUpTransaction(upTxn({
      attributes: {
        status: "SETTLED",
        rawText: "ATM CASH WITHDRAWAL CITIBANK",
        description: "ATM Withdrawal",
        amount: { value: "-200", valueInBaseUnits: -20000, currencyCode: "AUD" },
        foreignAmount: null,
        createdAt: "2025-09-15T10:00:00+10:00",
      },
    }));
    expect(c.isAtm).toBe(true);
  });

  it("returns the right account scope flag", () => {
    const c = classifyUpTransaction(upTxn({}), { spendingAccountId: "spending" });
    expect(c.belongsToSpending).toBe(true);
    const d = classifyUpTransaction(upTxn({}), { spendingAccountId: "other" });
    expect(d.belongsToSpending).toBe(false);
  });
});
