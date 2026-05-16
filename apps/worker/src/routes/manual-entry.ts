import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { ManualEntryInputSchema } from "@up-travel/shared";
import { transactions } from "../db/schema";
import { activeTripId } from "./transactions";
import { getRateToAud } from "../fx";
import type { Env } from "../env";

function ulid(): string {
  const t = Date.now().toString(36);
  const r = crypto.getRandomValues(new Uint8Array(10));
  return `m_${t}_${[...r].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const manualEntryRouter = new Hono<{ Bindings: Env }>();

manualEntryRouter.post("/", async (c) => {
  const body = ManualEntryInputSchema.parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);

  let amountAudCents = body.amountAudCents;
  if (body.foreignAmount !== null && body.foreignCurrency !== null) {
    const date = new Date(body.occurredAt).toISOString().slice(0, 10);
    const fx = await getRateToAud({ kv: c.env.KV, date, currency: body.foreignCurrency });
    amountAudCents = Math.round(body.foreignAmount * fx.rate);
  }

  const id = ulid();
  const db = drizzle(c.env.DB);
  const [row] = await db.insert(transactions).values({
    id, tripId,
    source: "manual",
    occurredAt: body.occurredAt,
    amountAudCents,
    foreignAmount: body.foreignAmount !== null ? String(body.foreignAmount) : null,
    foreignCurrency: body.foreignCurrency,
    description: body.description,
    upCategoryParent: body.category,
    upCategoryChild: null,
    isTransfer: 0,
    isAtm: 0,
    countsAsSpend: body.countsAsSpend ? 1 : 0,
    raw: null,
    syncedAt: Date.now(),
  }).returning();

  return c.json({
    id: row!.id,
    amountAudCents: row!.amountAudCents,
    foreignAmount: row!.foreignAmount === null ? null : Number(row!.foreignAmount),
    foreignCurrency: row!.foreignCurrency,
    countsAsSpend: row!.countsAsSpend === 1,
  }, 201);
});

manualEntryRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tripId = await activeTripId(c.env.DB);
  const db = drizzle(c.env.DB);
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.tripId, tripId)));
  return c.json({ ok: true });
});
