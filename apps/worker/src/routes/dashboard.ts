import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  totals, categoryProgress, groupByCity, cashOnHand, dailyTrend, dailyAllowance, paceDelta,
  type Transaction, type ItineraryEntry,
} from "@up-travel/shared";
import {
  trips, transactions as txnTbl, transactionOverrides, itineraryEntries, categoryBudgets,
} from "../db/schema";
import { activeTripId } from "./transactions";
import type { Env } from "../env";

const toBool = (n: number) => n === 1;

function dbRowToTxn(r: typeof txnTbl.$inferSelect): Transaction {
  return {
    id: r.id, tripId: r.tripId,
    source: r.source as "up" | "manual",
    occurredAt: r.occurredAt,
    amountAudCents: r.amountAudCents,
    foreignAmount: r.foreignAmount === null ? null : Number(r.foreignAmount),
    foreignCurrency: r.foreignCurrency,
    description: r.description,
    upCategoryParent: r.upCategoryParent,
    upCategoryChild: r.upCategoryChild,
    isTransfer: toBool(r.isTransfer),
    isAtm: toBool(r.isAtm),
    countsAsSpend: toBool(r.countsAsSpend),
    raw: null,
    syncedAt: r.syncedAt,
  };
}

export const dashboardRouter = new Hono<{ Bindings: Env }>();

dashboardRouter.get("/", async (c) => {
  const tripId = await activeTripId(c.env.DB);
  const db = drizzle(c.env.DB);
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) return c.json({ error: "no trip" }, 404);

  const txnRows = await db.select().from(txnTbl).where(eq(txnTbl.tripId, tripId));
  const overrides = await db.select().from(transactionOverrides).where(eq(transactionOverrides.tripId, tripId));
  const itin = await db.select().from(itineraryEntries).where(eq(itineraryEntries.tripId, tripId));
  const cats = await db.select().from(categoryBudgets).where(eq(categoryBudgets.tripId, tripId));

  const txns: Transaction[] = txnRows.map(dbRowToTxn);
  const excluded = new Set(overrides.filter((o) => o.excluded === 1).map((o) => o.txnId));
  const budgets = new Map(cats.map((c) => [c.categoryKey, c.targetAudCents] as const));
  const itinerary: ItineraryEntry[] = itin.map((e) => ({ ...e }));

  const today = new Date().toISOString().slice(0, 10);
  const startEpoch = Date.parse(`${trip.startDate}T00:00:00Z`);
  const endIso = trip.endDate ?? today;
  const totalDays = Math.max(1, Math.ceil((Date.parse(`${endIso}T23:59:59Z`) - startEpoch) / 86_400_000));
  const daysElapsed = Math.max(0, Math.min(totalDays,
    Math.ceil((Date.parse(`${today}T23:59:59Z`) - startEpoch) / 86_400_000)));
  const daysLeft = Math.max(0, totalDays - daysElapsed);

  const { spent } = totals(txns, excluded);
  const remaining = trip.budgetAudCents - spent;
  const todayTotals = totals(txns.filter((t) => new Date(t.occurredAt).toISOString().startsWith(today)), excluded);

  return c.json({
    trip: {
      id: trip.id, name: trip.name,
      startDate: trip.startDate, endDate: trip.endDate,
      budgetAudCents: trip.budgetAudCents,
    },
    spent,
    remaining,
    daysElapsed,
    daysLeft,
    dailyAllowance: dailyAllowance(remaining, daysLeft),
    paceDelta: paceDelta({ spent, daysElapsed, totalDays, budgetAudCents: trip.budgetAudCents }),
    todaySpent: todayTotals.spent,
    byCategory: categoryProgress(txns, excluded, budgets),
    byCity: groupByCity(txns, excluded, itinerary),
    cashOnHand: cashOnHand(txns),
    trend: dailyTrend(txns, excluded, trip.startDate, endIso),
    recent: txns
      .filter((t) => !t.isTransfer)
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, 20),
  });
});
