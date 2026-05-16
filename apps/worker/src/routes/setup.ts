import { Hono } from "hono";
import { UpClient } from "../up/client";
import type { Env } from "../env";

export const setupRouter = new Hono<{ Bindings: Env }>();

setupRouter.get("/", async (c) => {
  const hasWebhook = (await c.env.KV.get("up:webhook:id")) !== null;
  return c.json({ hasPat: Boolean(c.env.UP_API_TOKEN), hasWebhook });
});

setupRouter.post("/", async (c) => {
  const existingId = await c.env.KV.get("up:webhook:id");
  if (existingId) {
    return c.json({ hasWebhook: true, registered: false });
  }
  const up = new UpClient({ token: c.env.UP_API_TOKEN, base: c.env.UP_API_BASE });
  const targetUrl = `${new URL(c.req.url).origin}/webhook/up`;
  const existing = await up.listWebhooks();
  const match = existing.find((w) => w.url === targetUrl);
  if (match) {
    await c.env.KV.put("up:webhook:id", match.id);
    return c.json({ hasWebhook: true, registered: false });
  }
  const r = await up.registerWebhook(targetUrl);
  await c.env.KV.put("up:webhook:id", r.id);
  await c.env.KV.put("up:webhook:secret", r.secret);
  return c.json({ hasWebhook: true, registered: true });
});
