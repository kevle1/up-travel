import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import schemaStatements from "../../src/db/schema-statements.mjs";

// The transactions table exactly as it shipped before payment_method existed,
// so these tests exercise the real "upgrading an old deployment" path rather
// than a database that was already correct.
const LEGACY_TRANSACTIONS = `CREATE TABLE IF NOT EXISTS transactions (
  id text PRIMARY KEY NOT NULL,
  trip_id integer NOT NULL,
  source text NOT NULL,
  occurred_at integer NOT NULL,
  amount_aud_cents integer NOT NULL,
  foreign_amount numeric,
  foreign_currency text,
  description text NOT NULL,
  up_category_parent text,
  up_category_child text,
  card_purchase_method text,
  city text,
  is_transfer integer DEFAULT 0 NOT NULL,
  is_atm integer DEFAULT 0 NOT NULL,
  raw text,
  synced_at integer NOT NULL,
  FOREIGN KEY (trip_id) REFERENCES trips(id)
)`;

const DAY = Date.parse("2025-09-03T12:00:00Z");

/** ensureSchema short-circuits on a module-level flag, so each call needs a
 *  fresh module - the same as a new isolate picking the worker up cold. */
async function ensureSchemaFresh(): Promise<void> {
  vi.resetModules();
  const { ensureSchema } = await import("../../src/db/migrate");
  await ensureSchema(env.DB);
}

/** Stand up a pre-upgrade database holding one trip and a few cash logs. */
async function seedLegacyDb(): Promise<void> {
  for (const sql of schemaStatements) {
    const isTxTable = sql.startsWith("CREATE TABLE IF NOT EXISTS transactions");
    await env.DB.prepare(isTxTable ? LEGACY_TRANSACTIONS : sql).run();
  }
  await env.DB.prepare(
    `INSERT INTO trips (id, name, start_date, end_date, budget_aud_cents,
                        target_daily_aud_cents, current_city, is_active, created_at)
     VALUES (1, 'Balkans', '2025-09-01', '2025-09-30', 600000, 20000, 'Kotor', 1, 0)`,
  ).run();

  const insertLog = (
    id: string, kind: string, cents: number, category: string, isCash: number, note: string | null,
  ) => env.DB.prepare(
    `INSERT INTO cash_logs (id, trip_id, kind, occurred_at, amount_aud_cents,
                            foreign_amount, foreign_currency, travel_category, is_cash, city, note)
     VALUES (?1, 1, ?2, ?3, ?4, NULL, NULL, ?5, ?6, 'Kotor', ?7)`,
  ).bind(id, kind, DAY, cents, category, isCash, note);

  await env.DB.batch([
    insertLog("c_cash", "spend", 3000, "food", 1, "market lunch"),
    insertLog("c_card", "spend", 2000, "sights", 0, null),
    insertLog("c_top", "topup", 10000, "cash", 1, null),
  ]);
}

interface TxRow {
  id: string;
  source: string;
  amount_aud_cents: number;
  description: string;
  payment_method: string | null;
  is_atm: number;
  card_purchase_method: string | null;
  city: string | null;
}

const txById = async (id: string) =>
  env.DB.prepare(`SELECT * FROM transactions WHERE id = ?1`).bind(id).first<TxRow>();

// Suite names travel in a header, so keep them ASCII.
describe("ensureSchema - cash_logs to transactions migration", () => {
  beforeEach(async () => {
    await seedLegacyDb();
    await ensureSchemaFresh();
  });

  it("adds payment_method to an existing transactions table", async () => {
    const row = await txById("c_cash");
    expect(row?.payment_method).toBe("cash");
  });

  it("flips the sign so a logged spend matches Up's negative convention", async () => {
    expect((await txById("c_cash"))?.amount_aud_cents).toBe(-3000);
    expect((await txById("c_card"))?.amount_aud_cents).toBe(-2000);
  });

  it("marks them as manual so the UI offers delete rather than exclude", async () => {
    expect((await txById("c_cash"))?.source).toBe("manual");
  });

  it("only cash-flagged spends keep drawing the float", async () => {
    expect((await txById("c_card"))?.payment_method).toBe("other");
  });

  it("legacy top-ups become ATM rows, which is what they always were", async () => {
    const top = await txById("c_top");
    expect(top?.is_atm).toBe(1);
    expect(top?.card_purchase_method).toBe("ATM");
    expect(top?.payment_method).toBeNull();
    expect(top?.amount_aud_cents).toBe(-10000);
  });

  it("keeps the note as the row label, falling back to the category", async () => {
    expect((await txById("c_cash"))?.description).toBe("market lunch");
    expect((await txById("c_card"))?.description).toBe("Sights & Activities");
    expect((await txById("c_top"))?.description).toBe("Cash withdrawal");
  });

  it("carries the travel category onto the override row", async () => {
    const ov = await env.DB
      .prepare(`SELECT travel_category FROM transaction_overrides WHERE txn_id = ?1`)
      .bind("c_cash").first<{ travel_category: string }>();
    expect(ov?.travel_category).toBe("food");
  });

  it("preserves the city snapshot", async () => {
    expect((await txById("c_cash"))?.city).toBe("Kotor");
  });

  it("leaves the original cash_logs rows untouched", async () => {
    const { results } = await env.DB.prepare(`SELECT id FROM cash_logs`).all();
    expect(results).toHaveLength(3);
  });

  it("is one-shot: a deleted spend doesn't come back on the next cold start", async () => {
    await env.DB.prepare(`DELETE FROM transaction_overrides WHERE txn_id = 'c_cash'`).run();
    await env.DB.prepare(`DELETE FROM transactions WHERE id = 'c_cash'`).run();

    await ensureSchemaFresh();

    expect(await txById("c_cash")).toBeNull();
  });

  it("re-running is otherwise a no-op, not a duplicate", async () => {
    await ensureSchemaFresh();
    const { results } = await env.DB
      .prepare(`SELECT id FROM transactions WHERE source = 'manual'`).all();
    expect(results).toHaveLength(3);
  });
});

describe("ensureSchema - fresh database", () => {
  it("bootstraps and records the migration with nothing to copy", async () => {
    await ensureSchemaFresh();
    const { results } = await env.DB.prepare(`SELECT id FROM transactions`).all();
    expect(results).toHaveLength(0);
    const done = await env.DB
      .prepare(`SELECT id FROM migrations WHERE id = '2026-08-cash-logs-to-transactions'`)
      .first();
    expect(done).not.toBeNull();
  });
});
