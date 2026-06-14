import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { app } from "./app";
import { trips } from "./db/schema";
import { runSync } from "./sync/run";
import { UpClient } from "./up/client";
import type { Env } from "./env";

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const work = async () => {
      const db = drizzle(env.DB);
      const [active] = await db.select().from(trips).where(eq(trips.isActive, 1));
      if (!active) return;
      const up = new UpClient({ token: env.UP_API_TOKEN, base: env.UP_API_BASE });
      try {
        await runSync({ db: env.DB, kv: env.KV, up, tripId: active.id });
      } catch (e) {
        await env.KV.put("sync:status", JSON.stringify({ lastRun: Date.now(), lastError: String(e), inProgress: false }));
        console.error("scheduled sync failed", e);
      }
    };
    ctx.waitUntil(work());
  },
};
