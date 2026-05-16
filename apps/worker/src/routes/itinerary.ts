import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { parseItinerary } from "@up-travel/shared";
import { itineraryEntries } from "../db/schema";
import { activeTripId } from "./transactions";
import type { Env } from "../env";

const Body = z.object({ paste: z.string(), year: z.number().int() });

export const itineraryRouter = new Hono<{ Bindings: Env }>();

itineraryRouter.get("/", async (c) => {
  const tripId = await activeTripId(c.env.DB);
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(itineraryEntries).where(eq(itineraryEntries.tripId, tripId));
  return c.json(rows);
});

itineraryRouter.post("/", async (c) => {
  const body = Body.parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);
  const r = parseItinerary(body.paste, body.year);
  if (r.errors.length > 0) return c.json({ entries: r.entries, errors: r.errors }, 200);

  const db = drizzle(c.env.DB);
  // Sequential delete + inserts (D1 batch requires a non-empty tuple type;
  // using sequential awaits avoids TypeScript spread-typing issues while still
  // running within the same D1 connection context).
  await db.delete(itineraryEntries).where(eq(itineraryEntries.tripId, tripId));
  for (const e of r.entries) {
    await db.insert(itineraryEntries).values({
      tripId, startDate: e.startDate, endDate: e.endDate, city: e.city, country: e.country,
    });
  }
  return c.json({ entries: r.entries, errors: [] });
});
