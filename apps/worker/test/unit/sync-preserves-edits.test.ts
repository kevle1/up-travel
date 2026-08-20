import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import type { BurnState, Stay, Trip } from "@up-travel/shared";
import { app } from "../../src/app";
import { runSync } from "../../src/sync/run";
import { signSession } from "../../src/auth/cookie";
import { COOKIE_SECRET_KEY, PASSWORD_HASH_KEY } from "../../src/auth/keys";
import foreignJpy from "../../../../packages/shared/fixtures/up-transactions/foreign-jpy.json";
import audSpend from "../../../../packages/shared/fixtures/up-transactions/aud-spend.json";

// A full re-sync (watermark cleared) re-reads every transaction from Up and
// upserts it. Everything the user edited by hand lives in transaction_overrides
// - a different table, which sync never writes to - so it has to survive that.
// Worth pinning down: the repair path for a bad sync is a full re-sync, and it
// would be a poor trade if fixing amounts cost you a trip's worth of tagging.

const SECRET = "test-cookie-secret";
let cookie = "";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await app.request(
    `http://x${path}`,
    { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } },
    env,
  );
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const fakeUp = (txns: unknown[]) => ({
  getSpendingAccountId: async () => "spending",
  listTransactionsSince: async function* () { for (const t of txns) yield t; },
}) as never;

const FIXTURES = [foreignJpy, audSpend];
const fullResync = async () => {
  // What the sync button's right-click does: drop the watermark, re-read all.
  await env.KV.delete("sync:watermark:1");
  await runSync({ db: env.DB, kv: env.KV, up: fakeUp(FIXTURES), tripId: 1 });
};
const rowOf = async (id: string) =>
  (await call<BurnState>("/api/burn")).feed.find((r) => r.id === id)!;

describe("a full re-sync preserves everything the user edited", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { ensureSchema } = await import("../../src/db/migrate");
    await ensureSchema(env.DB);
    await env.KV.put(PASSWORD_HASH_KEY, "not-checked-by-the-middleware");
    await env.KV.put(COOKIE_SECRET_KEY, SECRET);
    cookie = `ut_session=${await signSession(SECRET)}`;
    const trip = await call<Trip>("/api/trips", {
      method: "POST",
      body: JSON.stringify({
        name: "Japan", startDate: "2025-09-01", endDate: "2035-09-30",
        budgetAudCents: 600000, targetDailyAudCents: 20000,
      }),
    });
    await call(`/api/trips/${trip.id}/activate`, { method: "POST" });
    await runSync({ db: env.DB, kv: env.KV, up: fakeUp(FIXTURES), tripId: 1 });
  });

  it("keeps re-tagged category, notes, spread and exclusion", async () => {
    await call(`/api/transactions/${foreignJpy.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        travelCategory: "nightlife",   // Up said restaurants-and-cafes
        notes: "split with Sam",
        spreadDays: 3,
        excluded: true,
      }),
    });

    await fullResync();

    const row = await rowOf(foreignJpy.id);
    expect(row.category).toBe("nightlife");
    expect(row.notes).toBe("split with Sam");
    expect(row.spreadDays).toBe(3);
    expect(row.excluded).toBe(true);
  });

  it("keeps a transaction linked to its stay", async () => {
    const stay = await call<Stay>("/api/stays", {
      method: "POST",
      body: JSON.stringify({ name: "Kyoto guesthouse", city: "Kyoto", checkIn: "2025-09-15", nights: 4 }),
    });
    await call(`/api/transactions/${audSpend.id}`, {
      method: "PATCH", body: JSON.stringify({ stayId: stay.id }),
    });

    await fullResync();

    const row = await rowOf(audSpend.id);
    expect(row.stayId).toBe(stay.id);
    expect(row.isAccom).toBe(true);
    // And the stay still amortises it across its nights.
    const state = await call<BurnState>("/api/burn");
    const view = state.stays.find((s) => s.id === stay.id)!;
    expect(view.txIds).toContain(audSpend.id);
    expect(view.totalCost).toBe(25);
  });

  it("still refreshes the figures that come from Up", async () => {
    // The point of a re-sync: Up's own fields are rewritten, edits are not.
    await env.DB.prepare("UPDATE transactions SET foreign_amount='NaN', amount_aud_cents=-1")
      .run();
    await call(`/api/transactions/${foreignJpy.id}`, {
      method: "PATCH", body: JSON.stringify({ travelCategory: "nightlife" }),
    });

    await fullResync();

    const row = await rowOf(foreignJpy.id);
    expect(row.foreign).toEqual({ value: 1500, currencyCode: "JPY" });
    expect(row.aud).toBe(15);
    expect(row.category).toBe("nightlife");
  });

  it("leaves manually-logged spends alone entirely", async () => {
    const manual = await call<{ id: string }>("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        occurredAt: Date.parse("2025-09-16T12:00:00Z"),
        amountAudCents: 4200, travelCategory: "food",
        paymentMethod: "cash", description: "Ramen",
      }),
    });

    await fullResync();

    const row = await rowOf(manual.id);
    expect(row.description).toBe("Ramen");
    expect(row.aud).toBe(42);
    expect(row.paymentMethod).toBe("cash");
    expect(row.category).toBe("food");
  });
});
