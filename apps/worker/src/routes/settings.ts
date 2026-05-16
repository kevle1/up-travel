import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { trips, categoryBudgets } from "../db/schema";
import { activeTripId } from "./transactions";
import type { Env } from "../env";

const Patch = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  budgetAudCents: z.number().int().nonnegative().optional(),
  categoryTargets: z.record(z.string(), z.number().int().nonnegative()).optional(),
});

export const settingsRouter = new Hono<{ Bindings: Env }>();

settingsRouter.get("/", async (c) => {
  const tripId = await activeTripId(c.env.DB);
  const db = drizzle(c.env.DB);
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  const cats = await db.select().from(categoryBudgets).where(eq(categoryBudgets.tripId, tripId));
  return c.json({
    startDate: trip?.startDate,
    endDate: trip?.endDate,
    budgetAudCents: trip?.budgetAudCents,
    categoryTargets: Object.fromEntries(cats.map((c) => [c.categoryKey, c.targetAudCents])),
  });
});

settingsRouter.patch("/", async (c) => {
  const body = Patch.parse(await c.req.json());
  const tripId = await activeTripId(c.env.DB);
  const db = drizzle(c.env.DB);

  const updates: Partial<typeof trips.$inferInsert> = {};
  if (body.startDate !== undefined) updates.startDate = body.startDate;
  if (body.endDate !== undefined) updates.endDate = body.endDate;
  if (body.budgetAudCents !== undefined) updates.budgetAudCents = body.budgetAudCents;

  if (Object.keys(updates).length > 0) {
    await db.update(trips).set(updates).where(eq(trips.id, tripId));
  }
  if (body.categoryTargets) {
    await db.delete(categoryBudgets).where(eq(categoryBudgets.tripId, tripId));
    for (const [key, target] of Object.entries(body.categoryTargets)) {
      await db.insert(categoryBudgets).values({ tripId, categoryKey: key, targetAudCents: target });
    }
  }
  return c.json({ ok: true });
});
