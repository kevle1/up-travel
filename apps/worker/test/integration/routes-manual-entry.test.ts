import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { app } from "../../src/app";
import { drizzle } from "drizzle-orm/d1";
import { trips } from "../../src/db/schema";

describe("manual-entry", () => {
  it("stores AUD entry directly, respects countsAsSpend flag", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    await db.insert(trips).values({
      name: "T", startDate: "2026-06-01", endDate: null,
      budgetAudCents: 8_000_000_00, isActive: 1, createdAt: 0, archivedAt: null,
    });

    const res = await app.fetch(new Request("http://x/api/manual-entry", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amountAudCents: -2500,
        foreignAmount: null,
        foreignCurrency: null,
        occurredAt: Date.parse("2026-06-10T00:00:00Z"),
        description: "Hostel cash",
        category: "good-life",
        countsAsSpend: false,
      }),
    }), env);
    expect(res.status).toBe(201);
    const row = await res.json() as { id: string; countsAsSpend: boolean; amountAudCents: number };
    expect(row.countsAsSpend).toBe(false);
    expect(row.amountAudCents).toBe(-2500);
  });

  it("foreign-currency entry uses FX cache", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    await db.insert(trips).values({
      name: "T", startDate: "2026-06-01", endDate: null,
      budgetAudCents: 8_000_000_00, isActive: 1, createdAt: 0, archivedAt: null,
    });

    await env.KV.put("fx:2026-06-10:JPY", JSON.stringify({ rate: 0.01, actualDate: "2026-06-10" }));

    const res = await app.fetch(new Request("http://x/api/manual-entry", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amountAudCents: 0,
        foreignAmount: -150000,
        foreignCurrency: "JPY",
        occurredAt: Date.parse("2026-06-10T00:00:00Z"),
        description: "Ramen",
        category: "good-life",
        countsAsSpend: true,
      }),
    }), env);
    const row = await res.json() as { amountAudCents: number };
    expect(row.amountAudCents).toBe(-1500);
  });
});
