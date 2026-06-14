import { Hono } from "hono";
import { runSync } from "../sync/run";
import { UpClient } from "../up/client";
import { activeTripId } from "./trips";
import type { Env } from "../env";

export const syncRouter = new Hono<{ Bindings: Env }>();

// POST /api/sync — manually trigger a sync for the active trip.
// Useful in local dev (where cron + webhooks don't fire) and as a "pull now"
// button when you want fresh data without waiting for the hourly cron.
//
// Body (optional): { reset?: boolean }  — if true, clears the KV watermark
// first so the sync re-reads everything back to the trip start date.
syncRouter.post("/", async (c) => {
  const tripId = await activeTripId(c.env.DB);
  if (tripId == null) return c.json({ error: "no active trip" }, 400);
  if (!c.env.UP_API_TOKEN) return c.json({ error: "UP_API_TOKEN not configured" }, 500);

  let reset = false;
  try {
    const body = await c.req.json<{ reset?: boolean }>();
    reset = !!body.reset;
  } catch {
    // empty body is fine
  }

  if (reset) {
    await c.env.KV.delete(`sync:watermark:${tripId}`);
  }

  const up = new UpClient({ token: c.env.UP_API_TOKEN, base: c.env.UP_API_BASE });
  try {
    const result = await runSync({ db: c.env.DB, kv: c.env.KV, up, tripId });
    return c.json({ ok: true, processed: result.processed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await c.env.KV.put("sync:status", JSON.stringify({
      lastRun: Date.now(), lastError: msg, inProgress: false,
    }));
    return c.json({ ok: false, error: msg }, 502);
  }
});

// GET /api/sync/status — what does the last sync look like?
syncRouter.get("/status", async (c) => {
  const tripId = await activeTripId(c.env.DB);
  const watermark = tripId != null ? await c.env.KV.get(`sync:watermark:${tripId}`) : null;
  const status = await c.env.KV.get<{ lastRun: number; lastError: string | null }>("sync:status", "json");
  return c.json({ watermark, ...(status ?? { lastRun: null, lastError: null }) });
});
