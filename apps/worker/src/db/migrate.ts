import { travelLabel } from "@up-travel/shared";
import schemaStatements from "./schema-statements.mjs";

// Per-isolate guard. The schema check is one extra round-trip to D1 on the
// first request after a cold start; subsequent requests in the same isolate
// short-circuit at the `ensured` flag.
let ensured = false;

// Columns added after the table's first release. `CREATE TABLE IF NOT EXISTS`
// won't backfill them into an existing database and SQLite has no
// `ADD COLUMN IF NOT EXISTS`, so we run them every boot and swallow the
// duplicate-column error. Additive and nullable only - nothing here can lose
// data if it runs against a table that already has the column.
const ADD_COLUMNS = [
  `ALTER TABLE transactions ADD COLUMN payment_method text`,
];

export async function ensureSchema(db: D1Database): Promise<void> {
  if (ensured) return;
  for (const sql of schemaStatements) {
    await db.prepare(sql).run();
  }
  for (const sql of ADD_COLUMNS) {
    try {
      await db.prepare(sql).run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e))) throw e;
    }
  }
  await migrateCashLogs(db);
  ensured = true;
}

const CASH_LOGS_TO_TRANSACTIONS = "2026-08-cash-logs-to-transactions";

interface CashLogRow {
  id: string;
  trip_id: number;
  kind: string;
  occurred_at: number;
  amount_aud_cents: number;
  foreign_amount: number | null;
  foreign_currency: string | null;
  travel_category: string;
  is_cash: number;
  city: string | null;
  note: string | null;
}

/** Copy legacy cash_logs rows into `transactions` as source:"manual" spends so
 *  they pick up stay links, spreads, notes and exclusions like any other row.
 *
 *  Sign flips: cash_logs stored a positive magnitude, transactions store spend
 *  as negative. Legacy top-ups become is_atm rows, which is what they always
 *  were in spirit - a float refill that isn't burn.
 *
 *  Non-destructive: the cash_logs rows stay put (nothing reads them after
 *  this) so the original data survives if the copy ever needs re-checking.
 *  The migrations row makes it one-shot, so deleting a migrated spend later
 *  doesn't resurrect it on the next cold start. */
async function migrateCashLogs(d1: D1Database): Promise<void> {
  const done = await d1
    .prepare(`SELECT id FROM migrations WHERE id = ?1`)
    .bind(CASH_LOGS_TO_TRANSACTIONS)
    .first();
  if (done) return;

  const { results } = await d1
    .prepare(
      `SELECT id, trip_id, kind, occurred_at, amount_aud_cents, foreign_amount,
              foreign_currency, travel_category, is_cash, city, note
         FROM cash_logs`,
    )
    .all<CashLogRow>();

  const now = Date.now();
  const batch: D1PreparedStatement[] = [];
  for (const r of results ?? []) {
    const isTopup = r.kind === "topup";
    batch.push(
      d1
        .prepare(
          `INSERT OR IGNORE INTO transactions (
             id, trip_id, source, occurred_at, amount_aud_cents,
             foreign_amount, foreign_currency, description,
             up_category_parent, up_category_child, card_purchase_method,
             payment_method, city, is_transfer, is_atm, raw, synced_at
           ) VALUES (?1, ?2, 'manual', ?3, ?4, ?5, ?6, ?7, NULL, NULL, ?8, ?9, ?10, 0, ?11, NULL, ?12)`,
        )
        .bind(
          r.id,
          r.trip_id,
          r.occurred_at,
          -Math.abs(r.amount_aud_cents),
          r.foreign_amount === null ? null : -Math.abs(r.foreign_amount),
          r.foreign_currency,
          r.note?.trim() || (isTopup ? "Cash withdrawal" : travelLabel(r.travel_category)),
          isTopup ? "ATM" : null,
          isTopup ? null : r.is_cash === 1 ? "cash" : "other",
          r.city,
          isTopup ? 1 : 0,
          now,
        ),
      // The travel category the user picked lives on the override row - the
      // same place a re-tagged Up transaction keeps it.
      d1
        .prepare(
          `INSERT OR IGNORE INTO transaction_overrides
             (txn_id, trip_id, travel_category, stay_id, spread_days, count_as_credit, excluded, notes)
           VALUES (?1, ?2, ?3, NULL, NULL, 0, 0, NULL)`,
        )
        .bind(r.id, r.trip_id, r.travel_category),
    );
  }
  batch.push(
    d1
      .prepare(`INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (?1, ?2)`)
      .bind(CASH_LOGS_TO_TRANSACTIONS, now),
  );
  await d1.batch(batch);
}
