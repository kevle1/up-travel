import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { ManualSpendCreateSchema, TransactionPatchSchema, travelLabel } from "@up-travel/shared";
import { transactions, transactionOverrides } from "../db/schema";
import { buildCityLookup } from "../db/city-lookup";
import { getRateToAud } from "../fx";
import { activeTripId } from "./trips";
import type { Env } from "../env";

export const transactionsRouter = new Hono<{ Bindings: Env }>();

function mtid(): string {
  const t = Date.now().toString(36);
  const r = crypto.getRandomValues(new Uint8Array(8));
  return `m_${t}_${[...r].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// POST /api/transactions - log a spend by hand. It lands in the same table as
// Up's own transactions so everything downstream (stay links, spreads, notes,
// exclusions, CSV export) treats it identically.
transactionsRouter.post("/", async (c) => {
  const body = ManualSpendCreateSchema.parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 400);

  const occurredAt = body.occurredAt ?? Date.now();
  let amountAudCents = body.amountAudCents;
  // If the user gave a foreign amount, convert it here so the client never has
  // to know a rate. Falls back to whatever AUD figure it sent if FX is down.
  if (body.foreignAmount != null && body.foreignCurrency) {
    const date = new Date(occurredAt).toISOString().slice(0, 10);
    try {
      const fx = await getRateToAud({ kv: c.env.KV, date, currency: body.foreignCurrency });
      amountAudCents = Math.round(body.foreignAmount * fx.rate * 100);
    } catch {
      // Keep the client's amount.
    }
  }

  const travelCategory = body.travelCategory ?? "other";
  const id = mtid();
  const db = drizzle(c.env.DB);
  const cityOf = await buildCityLookup(c.env.DB, tripId);
  const [row] = await db.insert(transactions).values({
    id, tripId,
    source: "manual",
    occurredAt,
    // Negative = spend, matching Up. The client sends a magnitude.
    amountAudCents: -Math.abs(amountAudCents),
    foreignAmount: body.foreignAmount != null ? String(-Math.abs(body.foreignAmount)) : null,
    foreignCurrency: body.foreignCurrency ?? null,
    description: body.description?.trim() || travelLabel(travelCategory),
    upCategoryParent: null,
    upCategoryChild: null,
    cardPurchaseMethod: null,
    paymentMethod: body.paymentMethod,
    city: cityOf(occurredAt),
    isTransfer: 0,
    isAtm: 0,
    raw: null,
    syncedAt: Date.now(),
  }).returning();

  // Manual rows have no Up category to derive from, so the chosen travel
  // category is written as an override - the same place a re-tagged Up
  // transaction keeps it, which means the tx editor edits both the same way.
  await db.insert(transactionOverrides).values({
    txnId: id, tripId,
    travelCategory,
    stayId: null,
    spreadDays: null,
    countAsCredit: 0,
    excluded: 0,
    notes: body.notes ?? null,
  });

  return c.json(row, 201);
});

// PATCH /api/transactions/:id  - upsert per-trip override.
// Body: { travelCategory?, stayId?, excluded?, notes? }  (set null to clear)
transactionsRouter.patch("/:id", async (c) => {
  const txnId = c.req.param("id");
  const body = TransactionPatchSchema.parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 400);
  const db = drizzle(c.env.DB);

  // Build an upsert row. Fields not in body default to "leave alone" - we read
  // any existing row and merge so partial patches preserve other fields.
  const [existing] = await db.select().from(transactionOverrides)
    .where(eq(transactionOverrides.txnId, txnId));
  const next = {
    txnId, tripId,
    travelCategory: body.travelCategory !== undefined ? body.travelCategory : existing?.travelCategory ?? null,
    stayId: body.stayId !== undefined ? body.stayId : existing?.stayId ?? null,
    spreadDays: body.spreadDays !== undefined ? body.spreadDays : existing?.spreadDays ?? null,
    countAsCredit: body.countAsCredit !== undefined ? (body.countAsCredit ? 1 : 0) : existing?.countAsCredit ?? 0,
    excluded: body.excluded !== undefined ? (body.excluded ? 1 : 0) : existing?.excluded ?? 0,
    notes: body.notes !== undefined ? body.notes : existing?.notes ?? null,
  };
  await db.insert(transactionOverrides).values(next).onConflictDoUpdate({
    target: [transactionOverrides.txnId, transactionOverrides.tripId],
    set: {
      travelCategory: next.travelCategory,
      stayId: next.stayId,
      spreadDays: next.spreadDays,
      countAsCredit: next.countAsCredit,
      excluded: next.excluded,
      notes: next.notes,
    },
  });
  return c.json({ ok: true });
});

// DELETE /api/transactions/:id - manual spends only. Up-sourced rows would
// just come back on the next sync, so those are excluded instead of deleted.
transactionsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 400);
  const db = drizzle(c.env.DB);

  const [row] = await db.select().from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.tripId, tripId)));
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.source !== "manual") {
    return c.json({ error: "only manually-logged spends can be deleted" }, 400);
  }

  // Override first - it has a foreign key onto the transaction.
  await db.delete(transactionOverrides).where(eq(transactionOverrides.txnId, id));
  await db.delete(transactions).where(eq(transactions.id, id));
  return c.json({ ok: true });
});

// DELETE the override entirely (resets all flags back to defaults).
transactionsRouter.delete("/:id/override", async (c) => {
  const txnId = c.req.param("id");
  const db = drizzle(c.env.DB);
  await db.delete(transactionOverrides).where(eq(transactionOverrides.txnId, txnId));
  return c.json({ ok: true });
});
