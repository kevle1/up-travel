import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { app } from "../../src/app";
import { drizzle } from "drizzle-orm/d1";
import { trips, transactions } from "../../src/db/schema";

describe("transactions + dashboard", () => {
  it("excludes a transaction and dashboard recomputes", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    const [t] = await db.insert(trips).values({
      name: "T", startDate: "2026-06-01", endDate: "2026-12-31",
      budgetAudCents: 10_000_00, isActive: 1, createdAt: 0, archivedAt: null,
    }).returning();
    await db.insert(transactions).values([
      { id: "a", tripId: t!.id, source: "up", occurredAt: Date.parse("2026-06-05T00:00:00Z"),
        amountAudCents: -1000, foreignAmount: null, foreignCurrency: null, description: "x",
        upCategoryParent: "good-life", upCategoryChild: null,
        isTransfer: 0, isAtm: 0, countsAsSpend: 1, raw: null, syncedAt: 0 },
      { id: "b", tripId: t!.id, source: "up", occurredAt: Date.parse("2026-06-06T00:00:00Z"),
        amountAudCents: -2000, foreignAmount: null, foreignCurrency: null, description: "y",
        upCategoryParent: "good-life", upCategoryChild: null,
        isTransfer: 0, isAtm: 0, countsAsSpend: 1, raw: null, syncedAt: 0 },
    ]);

    const d1 = await app.fetch(new Request("http://x/api/dashboard?trip=active"), env);
    const dash = await d1.json() as { spent: number };
    expect(dash.spent).toBe(3000);

    const ex = await app.fetch(new Request("http://x/api/transactions/a/exclude", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ excluded: true }),
    }), env);
    expect(ex.status).toBe(200);

    const d2 = await app.fetch(new Request("http://x/api/dashboard?trip=active"), env);
    const dash2 = await d2.json() as { spent: number };
    expect(dash2.spent).toBe(2000);
  });
});
