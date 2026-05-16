import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { app } from "../../src/app";
import { drizzle } from "drizzle-orm/d1";
import { trips } from "../../src/db/schema";

describe("itinerary", () => {
  it("replaces entries atomically", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    await db.insert(trips).values({
      name: "T", startDate: "2026-06-01", endDate: null,
      budgetAudCents: 100, isActive: 1, createdAt: 0, archivedAt: null,
    });

    const res = await app.fetch(new Request("http://x/api/itinerary", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ paste: "1-10 Jun Tokyo, JP\n11-20 Jun Kyoto, JP", year: 2026 }),
    }), env);
    expect(res.status).toBe(200);
    const j = await res.json() as { entries: { city: string }[]; errors: unknown[] };
    expect(j.entries.length).toBe(2);
    expect(j.errors.length).toBe(0);

    const get = await app.fetch(new Request("http://x/api/itinerary"), env);
    const data = await get.json() as { city: string }[];
    expect(data.map((e) => e.city)).toEqual(["Tokyo", "Kyoto"]);
  });

  it("does not save when parse errors exist", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    await db.insert(trips).values({
      name: "T", startDate: "2026-06-01", endDate: null,
      budgetAudCents: 100, isActive: 1, createdAt: 0, archivedAt: null,
    });
    const res = await app.fetch(new Request("http://x/api/itinerary", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ paste: "garbled", year: 2026 }),
    }), env);
    const j = await res.json() as { errors: unknown[] };
    expect(j.errors.length).toBeGreaterThan(0);
    const get = await app.fetch(new Request("http://x/api/itinerary"), env);
    expect(await get.json()).toEqual([]);
  });
});
