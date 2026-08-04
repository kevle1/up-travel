import { sqliteTable, integer, text, numeric, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  budgetAudCents: integer("budget_aud_cents").notNull(),
  targetDailyAudCents: integer("target_daily_aud_cents").notNull(),
  currentCity: text("current_city").notNull().default(""),
  isActive: integer("is_active").notNull(),
  createdAt: integer("created_at").notNull(),
  archivedAt: integer("archived_at"),
}, (t) => ({
  // Only one active trip - partial index enforces it.
  oneActive: uniqueIndex("trips_one_active").on(t.isActive).where(sql`${t.isActive} = 1`),
}));

// Every spend the app knows about. source:"up" rows come from sync and are
// re-created on each run; source:"manual" rows were logged by hand and are the
// user's to delete. Both get the same overrides, stay links and spreads.
export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  source: text("source", { enum: ["up", "manual"] }).notNull(),
  occurredAt: integer("occurred_at").notNull(),
  amountAudCents: integer("amount_aud_cents").notNull(), // negative = spend
  foreignAmount: numeric("foreign_amount"),
  foreignCurrency: text("foreign_currency"),
  description: text("description").notNull(),
  upCategoryParent: text("up_category_parent"),
  upCategoryChild: text("up_category_child"),
  cardPurchaseMethod: text("card_purchase_method"), // e.g. CONTACTLESS, ECOMMERCE, ATM
  // Manual rows only. "cash" is the one that draws down the cash float.
  paymentMethod: text("payment_method", { enum: ["cash", "card", "other"] }),
  city: text("city"),
  isTransfer: integer("is_transfer").notNull().default(0),
  isAtm: integer("is_atm").notNull().default(0),
  raw: text("raw"),
  syncedAt: integer("synced_at").notNull(),
}, (t) => ({
  tripTime: index("transactions_trip_time").on(t.tripId, t.occurredAt),
}));

// Per-trip overrides on Up transactions: travel category, link to a stay, exclude.
export const transactionOverrides = sqliteTable("transaction_overrides", {
  txnId: text("txn_id").notNull().references(() => transactions.id),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  travelCategory: text("travel_category"),
  stayId: integer("stay_id").references(() => stays.id),
  spreadDays: integer("spread_days"),
  countAsCredit: integer("count_as_credit").notNull().default(0),
  excluded: integer("excluded").notNull().default(0),
  notes: text("notes"),
}, (t) => ({
  pk: primaryKey({ columns: [t.txnId, t.tripId] }),
  stayIdx: index("overrides_stay").on(t.stayId),
}));

// Accommodation blocks. Linked transactions on transactionOverrides.stayId
// have their AUD totals amortised across these nights.
export const stays = sqliteTable("stays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  name: text("name").notNull(),
  city: text("city").notNull().default(""),
  checkIn: text("check_in").notNull(),
  nights: integer("nights").notNull(),
}, (t) => ({
  tripIdx: index("stays_trip").on(t.tripId, t.checkIn),
}));

// Legacy home for user-logged spends and ATM top-ups. Superseded by
// source:"manual" transactions; ensureSchema() copies these across once and
// nothing reads the table afterwards. Kept so the old rows survive the move,
// and so deleting a trip still cleans them up.
export const cashLogs = sqliteTable("cash_logs", {
  id: text("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  kind: text("kind", { enum: ["spend", "topup"] }).notNull(),
  occurredAt: integer("occurred_at").notNull(),
  amountAudCents: integer("amount_aud_cents").notNull(),
  foreignAmount: numeric("foreign_amount"),
  foreignCurrency: text("foreign_currency"),
  travelCategory: text("travel_category").notNull().default("other"),
  isCash: integer("is_cash").notNull().default(0),
  city: text("city"),
  note: text("note"),
}, (t) => ({
  tripTime: index("cash_logs_trip_time").on(t.tripId, t.occurredAt),
}));

// Applied data migrations, one row each. See db/migrate.ts.
export const migrations = sqliteTable("migrations", {
  id: text("id").primaryKey(),
  appliedAt: integer("applied_at").notNull(),
});
