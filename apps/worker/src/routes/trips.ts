import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { trips } from "../db/schema";
import type { Env } from "../env";

const CreateBody = z.object({
  name: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  budgetAudCents: z.number().int().nonnegative(),
});

export const tripsRouter = new Hono<{ Bindings: Env }>();

function rowToApi(r: typeof trips.$inferSelect) {
  return {
    id: r.id, name: r.name, startDate: r.startDate, endDate: r.endDate,
    budgetAudCents: r.budgetAudCents, isActive: r.isActive === 1,
    createdAt: r.createdAt, archivedAt: r.archivedAt,
  };
}

tripsRouter.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(trips);
  return c.json(rows.map(rowToApi));
});

tripsRouter.post("/", async (c) => {
  const body = CreateBody.parse(await c.req.json());
  const db = drizzle(c.env.DB);
  const existing = await db.select({ c: sql<number>`count(*)` }).from(trips);
  const isFirst = (existing[0]?.c ?? 0) === 0;
  const [row] = await db.insert(trips).values({
    name: body.name,
    startDate: body.startDate,
    endDate: body.endDate,
    budgetAudCents: body.budgetAudCents,
    isActive: isFirst ? 1 : 0,
    createdAt: Date.now(),
    archivedAt: null,
  }).returning();
  return c.json(rowToApi(row!), 201);
});

tripsRouter.post("/:id/activate", async (c) => {
  const id = Number(c.req.param("id"));
  const db = drizzle(c.env.DB);
  await db.batch([
    db.update(trips).set({ isActive: 0 }).where(eq(trips.isActive, 1)),
    db.update(trips).set({ isActive: 1 }).where(eq(trips.id, id)),
  ]);
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
