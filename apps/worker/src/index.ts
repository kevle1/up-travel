import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { app } from "./app";
import { ensureSchema } from "./db/migrate";
import { trips } from "./db/schema";
import { runSync } from "./sync/run";
import { UpClient } from "./up/client";
import { getUpToken } from "./up/token";
import type { Env } from "./env";

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const work = async () => {
      await ensureSchema(env.DB);
      const token = await getUpToken(env.KV);
      // No PAT yet means setup hasn't run - cron is a no-op until then.
      if (!token) return;
      const db = drizzle(env.DB);
      const [active] = await db.select().from(trips).where(eq(trips.isActive, 1));
      if (!active) return;
      const up = new UpClient({ token, base: env.UP_API_BASE });
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
