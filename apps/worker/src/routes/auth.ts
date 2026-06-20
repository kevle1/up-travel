import { Hono } from "hono";
import type { Env } from "../env";
import { buildClearCookie, buildSetCookie, readSessionCookie, signSession, verifySession } from "../auth/cookie";
import { verifyPassword } from "../auth/password";
import { readCookieSecret } from "../auth/secret";
import { clientIp, isLocked, recordFailure, recordSuccess } from "../auth/rate-limit";
import { PASSWORD_HASH_KEY } from "../auth/keys";

export const authRouter = new Hono<{ Bindings: Env }>();

authRouter.post("/login", async (c) => {
  const hash = await c.env.KV.get(PASSWORD_HASH_KEY);
  if (!hash) return c.json({ error: "setup required", setupRequired: true }, 409);
  const secret = await readCookieSecret(c.env);
  if (!secret) return c.json({ error: "auth state corrupt - reset setup" }, 500);

  const ip = clientIp(c.req.raw);
  if (await isLocked(c.env.KV, ip)) return c.json({ error: "too many attempts" }, 429);

  let password = "";
  try {
    const body = await c.req.json<{ password?: unknown }>();
    if (typeof body.password === "string") password = body.password;
  } catch {
    // fallthrough - empty password will fail below
  }
  if (!password) {
    await recordFailure(c.env.KV, ip);
    return c.json({ error: "invalid credentials" }, 401);
  }

  const ok = await verifyPassword(password, hash);
  if (!ok) {
    await recordFailure(c.env.KV, ip);
    return c.json({ error: "invalid credentials" }, 401);
  }

  await recordSuccess(c.env.KV, ip);
  c.header("set-cookie", buildSetCookie(await signSession(secret)));
  return c.json({ ok: true });
});

authRouter.post("/logout", (c) => {
  c.header("set-cookie", buildClearCookie());
  return c.json({ ok: true });
});

authRouter.get("/me", async (c) => {
  const hash = await c.env.KV.get(PASSWORD_HASH_KEY);
  if (!hash) return c.json({ authed: false, setupRequired: true });
  const secret = await readCookieSecret(c.env);
  if (!secret) return c.json({ authed: false, setupRequired: false });
  const token = readSessionCookie(c.req.header("cookie"));
  const payload = token ? await verifySession(secret, token) : null;
  return c.json({ authed: !!payload, setupRequired: false });
});
