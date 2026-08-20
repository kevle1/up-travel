import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import type { BurnState, Trip } from "@up-travel/shared";
import { app } from "../../src/app";
import { runSync } from "../../src/sync/run";
import { signSession } from "../../src/auth/cookie";
import { COOKIE_SECRET_KEY, PASSWORD_HASH_KEY } from "../../src/auth/keys";
import foreignJpy from "../../../../packages/shared/fixtures/up-transactions/foreign-jpy.json";

// Foreign amounts are read from Up's integer base-units field, never from its
// formatted `value` string. These tests pin that down end to end - sync, D1,
// /api/burn - because the failure mode when it regressed was silent: every
// foreign amount rendered as "0.00" while the AUD side stayed correct.

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

/** A €13.20 card spend, with the human-readable `value` string under test. */
const eurTx = (value: string) => ({
  ...foreignJpy,
  id: `eur-${value}`,
  attributes: {
    ...foreignJpy.attributes,
    description: "Merchant EUR",
    amount: { value: "-23.45", valueInBaseUnits: -2345, currencyCode: "AUD" },
    foreignAmount: { value, valueInBaseUnits: -1320, currencyCode: "EUR" },
  },
});

const feedForeign = async () => (await call<BurnState>("/api/burn")).feed[0]?.foreign;

describe("foreign amounts survive sync", () => {
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
        name: "Europe", startDate: "2025-09-01", endDate: "2035-09-30",
        budgetAudCents: 600000, targetDailyAudCents: 20000,
      }),
    });
    await call(`/api/trips/${trip.id}/activate`, { method: "POST" });
  });

  // The formats Up might plausibly hand back. Only the first one parses as a
  // JS number; before the fix the rest all landed as 0.00 EUR in the feed.
  for (const value of ["-13.20", "-13,20", "-1,320.00", "-€13.20", "", "not-a-number"]) {
    it(`reads €13.20 regardless of how value is formatted (${JSON.stringify(value)})`, async () => {
      await runSync({ db: env.DB, kv: env.KV, up: fakeUp([eurTx(value)]), tripId: 1 });
      expect(await feedForeign()).toEqual({ value: 13.2, currencyCode: "EUR" });
    });
  }

  it("scales by the currency's own minor units, not always by 100", async () => {
    // JPY has no minor unit: 1500 base units is ¥1500, not ¥15.
    await runSync({ db: env.DB, kv: env.KV, up: fakeUp([foreignJpy]), tripId: 1 });
    expect(await feedForeign()).toEqual({ value: 1500, currencyCode: "JPY" });
  });

  it("hides legacy rows that already hold the text NaN", async () => {
    // What the pre-fix sync wrote for an unparseable value string.
    await runSync({ db: env.DB, kv: env.KV, up: fakeUp([eurTx("-13.20")]), tripId: 1 });
    await env.DB.prepare("UPDATE transactions SET foreign_amount = 'NaN'").run();
    const f = await feedForeign();
    // Not { value: null }, which reads as 0 in one caller and throws in the next.
    expect(f).toBeNull();
  });
});
