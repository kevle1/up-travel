import { Hono } from "hono";
import { verifyUpWebhook } from "../webhook/verify";
import { UpClient } from "../up/client";
import { syncSingle } from "../sync/single";
import type { Env } from "../env";

export const webhookRouter = new Hono<{ Bindings: Env }>();

webhookRouter.post("/up", async (c) => {
  const secret = await c.env.KV.get("up:webhook:secret");
  if (!secret) return c.json({ error: "not configured" }, 503);

  const headerSig = c.req.header("x-up-authenticity-signature") ?? "";
  const body = await c.req.text();
  if (!(await verifyUpWebhook(body, headerSig, secret))) {
    return c.json({ error: "invalid signature" }, 401);
  }

  try {
    const parsed = JSON.parse(body) as {
      data?: { attributes?: { eventType?: string }; relationships?: { transaction?: { data?: { id?: string } } } };
    };
    const eventType = parsed.data?.attributes?.eventType;
    const txnId = parsed.data?.relationships?.transaction?.data?.id;
    if ((eventType === "TRANSACTION_CREATED" || eventType === "TRANSACTION_SETTLED") && txnId) {
      const up = new UpClient({ token: c.env.UP_API_TOKEN, base: c.env.UP_API_BASE });
      c.executionCtx.waitUntil(syncSingle({ db: c.env.DB, up, txnId }).catch((e) => console.error("webhook sync error", e)));
    }
  } catch (e) {
    console.error("webhook parse error", e);
  }
  return c.json({ ok: true });
});
