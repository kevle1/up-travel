import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, inArray, or, sql } from "drizzle-orm";
import { TripCreateSchema, TripPatchSchema } from "@up-travel/shared";
import { trips, transactionOverrides, transactions, stays, cashLogs } from "../db/schema";
import type { Env } from "../env";

export const tripsRouter = new Hono<{ Bindings: Env }>();

function rowToApi(r: typeof trips.$inferSelect) {
  return {
    id: r.id, name: r.name,
    startDate: r.startDate, endDate: r.endDate,
    budgetAudCents: r.budgetAudCents,
    targetDailyAudCents: r.targetDailyAudCents,
    currentCity: r.currentCity,
    isActive: r.isActive === 1,
    createdAt: r.createdAt,
    archivedAt: r.archivedAt,
  };
}

tripsRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(trips);
  return c.json(rows.map(rowToApi));
});

tripsRouter.post("/", async (c) => {
  const body = TripCreateSchema.parse(await c.req.json());
  const db = drizzle(c.env.DB);
  const existing = await db.select({ c: sql<number>`count(*)` }).from(trips);
  const isFirst = (existing[0]?.c ?? 0) === 0;
  const days = Math.max(1, Math.round((Date.parse(`${body.endDate}T00:00:00Z`) - Date.parse(`${body.startDate}T00:00:00Z`)) / 86_400_000) + 1);
  const defaultTarget = Math.round(body.budgetAudCents / days);
  const [row] = await db.insert(trips).values({
    name: body.name,
    startDate: body.startDate,
    endDate: body.endDate,
    budgetAudCents: body.budgetAudCents,
    targetDailyAudCents: body.targetDailyAudCents ?? defaultTarget,
    currentCity: body.currentCity ?? "",
    isActive: isFirst ? 1 : 0,
    createdAt: Date.now(),
    archivedAt: null,
  }).returning();
  return c.json(rowToApi(row!), 201);
});

tripsRouter.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = TripPatchSchema.parse(await c.req.json());
  const db = drizzle(c.env.DB);
  const updates: Partial<typeof trips.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.startDate !== undefined) updates.startDate = body.startDate;
  if (body.endDate !== undefined) updates.endDate = body.endDate;
  if (body.budgetAudCents !== undefined) updates.budgetAudCents = body.budgetAudCents;
  if (body.targetDailyAudCents !== undefined) updates.targetDailyAudCents = body.targetDailyAudCents;
  if (body.currentCity !== undefined) updates.currentCity = body.currentCity;
  if (Object.keys(updates).length === 0) return c.json({ ok: true });
  const [row] = await db.update(trips).set(updates).where(eq(trips.id, id)).returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(rowToApi(row));
});

tripsRouter.post("/:id/activate", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  // Unique partial index needs sequential ops, not a batch (the deactivate has
  // to commit before the activate, or both rows briefly hold is_active=1).
  await db.update(trips).set({ isActive: 0 }).where(eq(trips.isActive, 1));
  await db.update(trips).set({ isActive: 1 }).where(eq(trips.id, id));
  return c.json({ ok: true });
});

tripsRouter.post("/:id/archive", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.update(trips)
    .set({ isActive: 0, archivedAt: Date.now() })
    .where(eq(trips.id, id));
  return c.json({ ok: true });
});

// Hard delete a trip and everything attached.
//
// Overrides must be deleted via a union of three predicates, not just by
// trip_id, because old overrides can outlive a transaction's trip_id (e.g. a
// transaction was tagged under trip 1, then later re-attributed to trip 2 by
// a sync; the override row still carries trip_id=1 but references trip 2's
// txn_id). Without the union, the next step's transactions/stays delete
// trips the FK constraint and the whole thing rolls back.
tripsRouter.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  const txnIds = db.select({ id: transactions.id }).from(transactions).where(eq(transactions.tripId, id));
  const stayIds = db.select({ id: stays.id }).from(stays).where(eq(stays.tripId, id));
  await db.delete(transactionOverrides).where(or(
    eq(transactionOverrides.tripId, id),
    inArray(transactionOverrides.txnId, txnIds),
    inArray(transactionOverrides.stayId, stayIds),
  ));
  await db.delete(transactions).where(eq(transactions.tripId, id));
  await db.delete(stays).where(eq(stays.tripId, id));
  await db.delete(cashLogs).where(eq(cashLogs.tripId, id));
  await db.delete(trips).where(eq(trips.id, id));
  return c.json({ ok: true });
});

export async function activeTripId(d1: D1Database): Promise<number | null> {
  const db = drizzle(d1);
  const [row] = await db.select({ id: trips.id }).from(trips).where(eq(trips.isActive, 1));
  return row?.id ?? null;
}

export async function tripById(d1: D1Database, id: number) {
  const db = drizzle(d1);
  const [row] = await db.select().from(trips).where(eq(trips.id, id));
  return row ?? null;
}
