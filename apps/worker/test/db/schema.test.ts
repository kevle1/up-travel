import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { drizzle } from "drizzle-orm/d1";
import { trips } from "../../src/db/schema";

describe("db migrations", () => {
  it("creates all tables and one-active-trip partial unique index", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    await db.insert(trips).values({
      name: "T1", startDate: "2026-01-01", endDate: null,
      budgetAudCents: 100, isActive: 1, createdAt: 1, archivedAt: null,
    });
    await db.insert(trips).values({
      name: "T2", startDate: "2026-01-01", endDate: null,
      budgetAudCents: 100, isActive: 0, createdAt: 1, archivedAt: null,
    });
    await expect(
      db.insert(trips).values({
        name: "T3", startDate: "2026-01-01", endDate: null,
        budgetAudCents: 100, isActive: 1, createdAt: 1, archivedAt: null,
      }),
    ).rejects.toThrow();
  });
});
