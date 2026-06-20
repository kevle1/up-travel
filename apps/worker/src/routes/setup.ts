import { Hono } from "hono";
import type { Env } from "../env";
import { buildSetCookie, readSessionCookie, signSession, verifySession } from "../auth/cookie";
import { hashPassword } from "../auth/password";
import { generateCookieSecret, readCookieSecret } from "../auth/secret";
import { COOKIE_SECRET_KEY, PASSWORD_HASH_KEY, UP_TOKEN_KEY } from "../auth/keys";

export const setupRouter = new Hono<{ Bindings: Env }>();

const MIN_PASSWORD = 8;

// POST /api/setup - first-run only. Validates the Up PAT by hitting /util/ping,
// then writes the password hash, the generated cookie signing key, and the PAT
// to KV. Once the hash exists this endpoint refuses (409) so the only way back
// to setup is /api/setup/reset, which requires auth.
setupRouter.post("/", async (c) => {
  const existing = await c.env.KV.get(PASSWORD_HASH_KEY);
  if (existing) return c.json({ error: "already set up" }, 409);

  let password = "";
  let upToken = "";
  try {
    const body = await c.req.json<{ password?: unknown; upToken?: unknown }>();
    if (typeof body.password === "string") password = body.password;
    if (typeof body.upToken === "string") upToken = body.upToken.trim();
  } catch {
    // empty body falls through to validation below
  }
  if (password.length < MIN_PASSWORD) {
    return c.json({ error: `password must be at least ${MIN_PASSWORD} characters` }, 400);
  }
  if (!upToken.startsWith("up:yeah:")) {
    return c.json({ error: "Up PAT should start with up:yeah:" }, 400);
  }

  const ping = await fetch(`${c.env.UP_API_BASE}/util/ping`, {
    headers: { Authorization: `Bearer ${upToken}` },
  });
  if (ping.status === 401) return c.json({ error: "Up rejected that token" }, 400);
  if (!ping.ok) return c.json({ error: `Up ping failed (${ping.status})` }, 502);

  // Generate the cookie secret if one isn't already supplied via env. Storing
  // it in KV means future deploys don't need a manual `wrangler secret put`.
  const cookieSecret = c.env.AUTH_COOKIE_SECRET ?? generateCookieSecret();
  const hash = await hashPassword(password);
  await c.env.KV.put(PASSWORD_HASH_KEY, hash);
  await c.env.KV.put(UP_TOKEN_KEY, upToken);
  if (!c.env.AUTH_COOKIE_SECRET) await c.env.KV.put(COOKIE_SECRET_KEY, cookieSecret);

  c.header("set-cookie", buildSetCookie(await signSession(cookieSecret)));
  return c.json({ ok: true });
});

// POST /api/setup/reset - wipe password + PAT + cookie secret. Requires a
// valid session. Middleware already protects /api/setup/reset (only
// /api/setup is on the bypass list), so by the time we land here the cookie
// has been verified. We still re-verify defensively in case the middleware
// bypass list changes.
setupRouter.post("/reset", async (c) => {
  const secret = await readCookieSecret(c.env);
  if (!secret) return c.json({ error: "auth state corrupt" }, 500);
  const token = readSessionCookie(c.req.header("cookie"));
  const payload = token ? await verifySession(secret, token) : null;
  if (!payload) return c.json({ error: "unauthorized" }, 401);

  await c.env.KV.delete(PASSWORD_HASH_KEY);
  await c.env.KV.delete(UP_TOKEN_KEY);
  await c.env.KV.delete(COOKIE_SECRET_KEY);
  return c.json({ ok: true });
});
