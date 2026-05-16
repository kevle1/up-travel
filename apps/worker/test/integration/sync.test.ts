import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { trips, transactions } from "../../src/db/schema";
import { runSync } from "../../src/sync/run";
import { UpClient } from "../../src/up/client";

async function makeUpClient(pages: unknown[][]): Promise<UpClient> {
  const data = [...pages];
  const fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/accounts")) {
      return new Response(JSON.stringify({
        data: [{ id: "spending", attributes: { accountType: "TRANSACTIONAL" } }],
      }), { status: 200 });
    }
    const page = data.shift() ?? [];
    return new Response(JSON.stringify({
      data: page,
      links: { next: data.length > 0 ? `${url}&p=next` : null },
    }), { status: 200 });
  });
  return new UpClient({ token: "t", base: "https://api.up.com.au/api/v1", fetch, sleep: async () => {} });
}

const upTxn = (id: string, opts: Partial<{ amount: number; settled: string; transfer: boolean; account: string; }>) => ({
  id,
  attributes: {
    status: "SETTLED",
    rawText: null,
    description: id,
    amount: { value: "-1", valueInBaseUnits: opts.amount ?? -1000, currencyCode: "AUD" },
    foreignAmount: null,
    createdAt: opts.settled ?? "2025-09-15T10:00:00+10:00",
  },
  relationships: {
    account: { data: { id: opts.account ?? "spending", type: "accounts" } },
    category: { data: { id: "restaurants-and-cafes", type: "categories" } },
    parentCategory: { data: { id: "good-life", type: "categories" } },
    transferAccount: { data: opts.transfer ? { id: "saver", type: "accounts" } : null },
  },
});

describe("runSync", () => {
  it("upserts spending-account txns; flags transfers; advances watermark", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    const [trip] = await db.insert(trips).values({
      name: "T", startDate: "2025-09-01", endDate: null,
      budgetAudCents: 8_000_000_00, isActive: 1, createdAt: 0, archivedAt: null,
    }).returning();

    const client = await makeUpClient([
      [upTxn("a", { amount: -1000 }), upTxn("b", { amount: -2000, transfer: true }), upTxn("c", { account: "other-saver" })],
    ]);

    await runSync({ db: env.DB, kv: env.KV, up: client, tripId: trip!.id });

    const rows = await db.select().from(transactions).where(eq(transactions.tripId, trip!.id));
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.id === "a")?.isTransfer).toBe(0);
    expect(rows.find((r) => r.id === "b")?.isTransfer).toBe(1);

    const watermark = await env.KV.get(`sync:watermark:${trip!.id}`);
    expect(watermark).toBeTruthy();
  });

  it("re-running is idempotent", async () => {
    await applyMigrations(env.DB);
    const db = drizzle(env.DB);
    const [trip] = await db.insert(trips).values({
      name: "T", startDate: "2025-09-01", endDate: null,
      budgetAudCents: 8_000_000_00, isActive: 1, createdAt: 0, archivedAt: null,
    }).returning();
    const client1 = await makeUpClient([[upTxn("a", {})]]);
    await runSync({ db: env.DB, kv: env.KV, up: client1, tripId: trip!.id });
    const client2 = await makeUpClient([[upTxn("a", {})]]);
    await runSync({ db: env.DB, kv: env.KV, up: client2, tripId: trip!.id });
    const rows = await db.select().from(transactions).where(eq(transactions.tripId, trip!.id));
    expect(rows.length).toBe(1);
  });
});
