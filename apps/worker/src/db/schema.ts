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
  // Only one active trip — partial index enforces it.
  oneActive: uniqueIndex("trips_one_active").on(t.isActive).where(sql`${t.isActive} = 1`),
}));

// Up-sourced source of truth. Manual entries live in cash_logs instead.
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

// User-logged cash entries — spend (draws float, counts as burn) or topup
// (adds to float, doesn't count as burn until spent).
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
