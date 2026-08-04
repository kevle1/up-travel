import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { buildBurn, type Transaction, type TransactionOverride, type Stay, type PaymentMethod, type Trip } from "@up-travel/shared";
import { transactions, transactionOverrides, stays } from "../db/schema";
import { activeTripId, tripById } from "./trips";
import type { Env } from "../env";

export const burnRouter = new Hono<{ Bindings: Env }>();

// GET /api/burn?tripId=42  → BurnState for that trip, or the active trip if omitted.
burnRouter.get("/", async (c) => {
  const requested = c.req.query("tripId");
  const tripId = requested ? Number(requested) : await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 404);
  const row = await tripById(c.env.DB, tripId);
  if (!row) return c.json({ error: "trip not found" }, 404);

  const trip: Trip = {
    id: row.id, name: row.name,
    startDate: row.startDate, endDate: row.endDate,
    budgetAudCents: row.budgetAudCents,
    targetDailyAudCents: row.targetDailyAudCents,
    currentCity: row.currentCity,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
  };

  const db = drizzle(c.env.DB);
  const [txnRows, ovRows, stayRows] = await Promise.all([
    db.select().from(transactions).where(eq(transactions.tripId, tripId)),
    db.select().from(transactionOverrides).where(eq(transactionOverrides.tripId, tripId)),
    db.select().from(stays).where(eq(stays.tripId, tripId)),
  ]);

  const txns: Transaction[] = txnRows.map((r) => ({
    id: r.id, tripId: r.tripId,
    source: r.source as "up" | "manual",
    occurredAt: r.occurredAt,
    amountAudCents: r.amountAudCents,
    foreignAmount: r.foreignAmount === null ? null : Number(r.foreignAmount),
    foreignCurrency: r.foreignCurrency,
    description: r.description,
    upCategoryParent: r.upCategoryParent,
    upCategoryChild: r.upCategoryChild,
    cardPurchaseMethod: r.cardPurchaseMethod,
    paymentMethod: (r.paymentMethod ?? null) as PaymentMethod | null,
    city: r.city,
    isTransfer: r.isTransfer === 1,
    isAtm: r.isAtm === 1,
    raw: null,
    syncedAt: r.syncedAt,
  }));
  const overrides: TransactionOverride[] = ovRows.map((r) => ({
    txnId: r.txnId, tripId: r.tripId,
    travelCategory: r.travelCategory,
    stayId: r.stayId,
    spreadDays: r.spreadDays,
    countAsCredit: r.countAsCredit === 1,
    excluded: r.excluded === 1,
    notes: r.notes,
  }));
  const staysOut: Stay[] = stayRows.map((r) => ({
    id: r.id, tripId: r.tripId,
    name: r.name, city: r.city,
    checkIn: r.checkIn, nights: r.nights,
  }));
  const asOf = new Date().toISOString().slice(0, 10);
  const state = buildBurn({ trip, transactions: txns, overrides, stays: staysOut, asOf });
  return c.json(state);
});
