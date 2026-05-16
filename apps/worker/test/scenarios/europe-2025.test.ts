// SKIPPED until packages/shared/fixtures/europe-2025/transactions.json is populated.
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Change `describe.skip` to `describe` once transactions.json is populated with real data.
describe.skip("Europe 2025 backfill scenario", () => {
  it("total spend matches expected", async () => {
    const fixtureDir = path.resolve(
      __dirname,
      "../../../../packages/shared/fixtures/europe-2025",
    );
    const rawTxns = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, "transactions.json"), "utf8"),
    ) as unknown[];
    const expected = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, "expected.json"), "utf8"),
    ) as {
      spent: number;
      byCategory: Record<string, number>;
      byCity: Record<string, number>;
    };
    const itineraryTxt = fs.readFileSync(
      path.join(fixtureDir, "itinerary.txt"),
      "utf8",
    );

    const { totals, groupByCity, categoryProgress, UpTransactionSchema, parseItinerary } =
      await import("@up-travel/shared");
    const { classifyUpTransaction } = await import("../../src/sync/classify");

    const { entries: itinerary } = parseItinerary(itineraryTxt, 2025);

    const transactions = rawTxns.map((raw) => {
      const up = UpTransactionSchema.parse(raw);
      const cls = classifyUpTransaction(up);
      const amt = up.attributes.amount.valueInBaseUnits;
      const fa = up.attributes.foreignAmount;
      return {
        id: up.id,
        tripId: 1,
        source: "up" as const,
        occurredAt: Date.parse(up.attributes.createdAt),
        amountAudCents: amt,
        foreignAmount: fa ? fa.valueInBaseUnits : null,
        foreignCurrency: fa ? fa.currencyCode : null,
        description: up.attributes.description,
        upCategoryParent: up.relationships.parentCategory.data?.id ?? null,
        upCategoryChild: up.relationships.category.data?.id ?? null,
        isTransfer: cls.isTransfer,
        isAtm: cls.isAtm,
        countsAsSpend: !cls.isTransfer,
        raw: raw,
        syncedAt: 0,
      };
    });

    const excluded = new Set<string>();
    const { spent } = totals(transactions, excluded);
    expect(spent).toBe(expected.spent);

    const cityGroups = groupByCity(
      transactions,
      excluded,
      itinerary.map((e, i) => ({ id: i + 1, tripId: 1, ...e })),
    );
    for (const [city, expectedSpend] of Object.entries(expected.byCity)) {
      const group = cityGroups.find((g) => g.label === city);
      expect(group?.spent ?? 0).toBe(expectedSpend);
    }

    const catRows = categoryProgress(transactions, excluded, new Map());
    for (const [cat, expectedSpend] of Object.entries(expected.byCategory)) {
      const row = catRows.find((r) => r.categoryKey === cat);
      expect(row?.spent ?? 0).toBe(expectedSpend);
    }
  });
});
