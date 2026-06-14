import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { TransactionPatchSchema } from "@up-travel/shared";
import { transactionOverrides } from "../db/schema";
import { activeTripId } from "./trips";
import type { Env } from "../env";

export const transactionsRouter = new Hono<{ Bindings: Env }>();

// PATCH /api/transactions/:id  — upsert per-trip override.
// Body: { travelCategory?, stayId?, excluded?, notes? }  (set null to clear)
transactionsRouter.patch("/:id", async (c) => {
  const txnId = c.req.param("id");
  const body = TransactionPatchSchema.parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 400);
  const db = drizzle(c.env.DB);

  // Build an upsert row. Fields not in body default to "leave alone" — we read
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

// DELETE the override entirely (resets all flags back to defaults).
transactionsRouter.delete("/:id/override", async (c) => {
  const txnId = c.req.param("id");
  const db = drizzle(c.env.DB);
  await db.delete(transactionOverrides).where(eq(transactionOverrides.txnId, txnId));
  return c.json({ ok: true });
});
