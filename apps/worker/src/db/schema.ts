import { sqliteTable, integer, text, numeric, primaryKey, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  budgetAudCents: integer("budget_aud_cents").notNull(),
  isActive: integer("is_active").notNull(),
  createdAt: integer("created_at").notNull(),
  archivedAt: integer("archived_at"),
}, (t) => ({
  oneActive: uniqueIndex("trips_one_active").on(t.isActive).where(sql`${t.isActive} = 1`),
}));

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  source: text("source", { enum: ["up", "manual"] }).notNull(),
  occurredAt: integer("occurred_at").notNull(),
  amountAudCents: integer("amount_aud_cents").notNull(),
  foreignAmount: numeric("foreign_amount"),
  foreignCurrency: text("foreign_currency"),
  description: text("description").notNull(),
  upCategoryParent: text("up_category_parent"),
  upCategoryChild: text("up_category_child"),
  isTransfer: integer("is_transfer").notNull().default(0),
  isAtm: integer("is_atm").notNull().default(0),
  countsAsSpend: integer("counts_as_spend").notNull().default(1),
  raw: text("raw"),
  syncedAt: integer("synced_at").notNull(),
}, (t) => ({
  tripTime: index("transactions_trip_time").on(t.tripId, t.occurredAt),
}));

export const transactionOverrides = sqliteTable("transaction_overrides", {
  txnId: text("txn_id").notNull().references(() => transactions.id),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  excluded: integer("excluded").notNull(),
  notes: text("notes"),
}, (t) => ({
  pk: primaryKey({ columns: [t.txnId, t.tripId] }),
}));

export const itineraryEntries = sqliteTable("itinerary_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
});

export const categoryBudgets = sqliteTable("category_budgets", {
  tripId: integer("trip_id").notNull().references(() => trips.id),
  categoryKey: text("category_key").notNull(),
  targetAudCents: integer("target_aud_cents").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.tripId, t.categoryKey] }),
}));
