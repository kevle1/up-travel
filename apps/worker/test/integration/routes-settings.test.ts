import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { app } from "../../src/app";
import { drizzle } from "drizzle-orm/d1";
import { trips } from "../../src/db/schema";

describe("settings", () => {
  it("updates trip dates + budget and sets category targets", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    await db.insert(trips).values({
      name: "T", startDate: "2026-06-01", endDate: null,
      budgetAudCents: 100, isActive: 1, createdAt: 0, archivedAt: null,
    });

    const res = await app.fetch(new Request("http://x/api/settings", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-06-15", endDate: "2027-06-15", budgetAudCents: 8_000_000_00,
        categoryTargets: { "good-life": 2_000_000_00, "transport": 1_000_000_00 },
      }),
    }), env);
    expect(res.status).toBe(200);

    const get = await app.fetch(new Request("http://x/api/settings"), env);
    const data = await get.json() as { budgetAudCents: number; categoryTargets: Record<string, number> };
    expect(data.budgetAudCents).toBe(8_000_000_00);
    expect(data.categoryTargets["good-life"]).toBe(2_000_000_00);
  });
});
