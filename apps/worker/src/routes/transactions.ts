import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { transactionOverrides, trips } from "../db/schema";
import type { Env } from "../env";

async function activeTripId(d1: D1Database): Promise<number> {
  const db = drizzle(d1);
  const [row] = await db.select({ id: trips.id }).from(trips).where(eq(trips.isActive, 1));
  if (!row) throw new Error("no active trip");
  return row.id;
}

export const transactionsRouter = new Hono<{ Bindings: Env }>();

transactionsRouter.post("/:id/exclude", async (c) => {
  const id = c.req.param("id");
  const body = z.object({ excluded: z.boolean(), notes: z.string().nullable().optional() })
    .parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);
  const db = drizzle(c.env.DB);
  await db.insert(transactionOverrides).values({
    txnId: id, tripId, excluded: body.excluded ? 1 : 0, notes: body.notes ?? null,
  }).onConflictDoUpdate({
    target: [transactionOverrides.txnId, transactionOverrides.tripId],
    set: { excluded: body.excluded ? 1 : 0, notes: body.notes ?? null },
  });
  return c.json({ ok: true });
});

export { activeTripId };
