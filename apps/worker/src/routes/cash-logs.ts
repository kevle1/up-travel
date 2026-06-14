import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { CashLogCreateSchema } from "@up-travel/shared";
import { cashLogs } from "../db/schema";
import { buildCityLookup } from "../db/city-lookup";
import { getRateToAud } from "../fx";
import { activeTripId } from "./trips";
import type { Env } from "../env";

export const cashLogsRouter = new Hono<{ Bindings: Env }>();

function clid(): string {
  const t = Date.now().toString(36);
  const r = crypto.getRandomValues(new Uint8Array(8));
  return `c_${t}_${[...r].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

cashLogsRouter.post("/", async (c) => {
  const body = CashLogCreateSchema.parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 400);

  let amountAudCents = body.amountAudCents;
  // If the user provided a foreign amount, convert it (this lets the client
  // pass the local currency amount and have the server do the FX).
  if (body.foreignAmount != null && body.foreignCurrency) {
    const occurredAt = body.occurredAt ?? Date.now();
    const date = new Date(occurredAt).toISOString().slice(0, 10);
    try {
      const fx = await getRateToAud({ kv: c.env.KV, date, currency: body.foreignCurrency });
      // foreignAmount is in major units (the user enters "25.50 EUR")
      amountAudCents = Math.round(body.foreignAmount * fx.rate * 100);
    } catch {
      // If FX is unavailable, fall back to whatever the client sent in amountAudCents.
    }
  }

  const id = clid();
  const db = drizzle(c.env.DB);
  const occurredAt = body.occurredAt ?? Date.now();
  const cityOf = await buildCityLookup(c.env.DB, tripId);
  const [row] = await db.insert(cashLogs).values({
    id, tripId,
    kind: body.kind,
    occurredAt,
    amountAudCents,
    foreignAmount: body.foreignAmount != null ? String(body.foreignAmount) : null,
    foreignCurrency: body.foreignCurrency ?? null,
    travelCategory: body.travelCategory ?? "other",
    isCash: body.isCash ? 1 : 0,
    city: cityOf(occurredAt),
    note: body.note ?? null,
  }).returning();
  return c.json(row, 201);
});

cashLogsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 400);
  const db = drizzle(c.env.DB);
  await db.delete(cashLogs).where(and(eq(cashLogs.id, id), eq(cashLogs.tripId, tripId)));
  return c.json({ ok: true });
});
