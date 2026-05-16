import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { drizzle } from "drizzle-orm/d1";
import { trips, transactions } from "../../src/db/schema";
import worker from "../../src/index";

describe("scheduled handler", () => {
  it("calls runSync against active trip", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    await db.insert(trips).values({
      name: "T", startDate: "2025-09-01", endDate: null, budgetAudCents: 100,
      isActive: 1, createdAt: 0, archivedAt: null,
    });

    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/accounts")) {
        return new Response(JSON.stringify({
          data: [{ id: "spending", attributes: { accountType: "TRANSACTIONAL" } }],
        }));
      }
      return new Response(JSON.stringify({
        data: [{
          id: "tx-1",
          attributes: {
            status: "SETTLED", rawText: null, description: "x",
            amount: { value: "-1", valueInBaseUnits: -100, currencyCode: "AUD" },
            foreignAmount: null,
            createdAt: "2025-09-10T00:00:00+10:00",
          },
          relationships: {
            account: { data: { id: "spending", type: "accounts" } },
            category: { data: null },
            parentCategory: { data: null },
            transferAccount: { data: null },
          },
        }],
        links: { next: null },
      }));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const envOverride = { ...env, UP_API_TOKEN: "tok", UP_API_BASE: "https://api.up.com.au/api/v1" } as never;

    // Capture the waitUntil promise so we can await it and keep storage access in-frame
    let waitUntilPromise: Promise<unknown> = Promise.resolve();
    const ctx = {
      waitUntil: (p: Promise<unknown>) => {
        waitUntilPromise = p;
      },
    } as unknown as ExecutionContext;

    await worker.scheduled?.({ scheduledTime: Date.now(), cron: "* * * * *", noRetry: () => {} } as unknown as ScheduledEvent, envOverride, ctx);
    // Drain the deferred work so all storage writes complete within the test frame
    await waitUntilPromise;

    const rows = await db.select().from(transactions);
    expect(rows.length).toBe(1);
  });
});
