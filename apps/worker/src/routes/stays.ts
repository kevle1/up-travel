import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { StayCreateSchema, StayPatchSchema } from "@up-travel/shared";
import { stays, transactionOverrides } from "../db/schema";
import { activeTripId } from "./trips";
import type { Env } from "../env";

export const staysRouter = new Hono<{ Bindings: Env }>();

staysRouter.get("/", async (c) => {
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json([]);
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(stays).where(eq(stays.tripId, tripId));
  return c.json(rows);
});

staysRouter.post("/", async (c) => {
  const body = StayCreateSchema.parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 400);
  const db = drizzle(c.env.DB);
  const [row] = await db.insert(stays).values({
    tripId,
    name: body.name,
    city: body.city,
    checkIn: body.checkIn,
    nights: body.nights,
  }).returning();
  return c.json(row, 201);
});

staysRouter.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = StayPatchSchema.parse(await c.req.json());
  const db = drizzle(c.env.DB);
  const updates: Partial<typeof stays.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.city !== undefined) updates.city = body.city;
  if (body.checkIn !== undefined) updates.checkIn = body.checkIn;
  if (body.nights !== undefined) updates.nights = body.nights;
  if (Object.keys(updates).length === 0) return c.json({ ok: true });
  const [row] = await db.update(stays).set(updates).where(eq(stays.id, id)).returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

staysRouter.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  // Unlink any tx overrides pointing here.
  await db.update(transactionOverrides).set({ stayId: null }).where(eq(transactionOverrides.stayId, id));
  await db.delete(stays).where(eq(stays.id, id));
  return c.json({ ok: true });
});
