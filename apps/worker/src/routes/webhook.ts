import { Hono } from "hono";
import { verifyUpWebhook } from "../webhook/verify";
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
    if (eventType === "TRANSACTION_CREATED" || eventType === "TRANSACTION_SETTLED") {
      console.warn("webhook received", eventType, parsed.data?.relationships?.transaction?.data?.id);
    }
  } catch (e) {
    console.error("webhook parse error", e);
  }
  return c.json({ ok: true });
});
