import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import {
  buildSetCookie,
  readSessionCookie,
  shouldRefresh,
  signSession,
  verifySession,
} from "./cookie";
import { readCookieSecret } from "./secret";
import { PASSWORD_HASH_KEY } from "./keys";

// Paths that always skip auth. Setup is in here but the setup route itself
// refuses to run if a password hash already exists, so it's effectively
// single-shot.
const BYPASS = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/setup",
]);

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (!path.startsWith("/api/")) return next();
  if (BYPASS.has(path)) return next();

  // If no password is set yet, every protected route should redirect the user
  // to setup - surface this as a 401 with a hint so the frontend knows to show
  // Setup instead of Login.
  const hash = await c.env.KV.get(PASSWORD_HASH_KEY);
  if (!hash) return c.json({ error: "setup required", setupRequired: true }, 401);

  // After setup, the cookie secret is always in KV (Setup wrote it). If it
  // somehow isn't, we're in a broken state - bail rather than silently rotate.
  const secret = await readCookieSecret(c.env);
  if (!secret) return c.json({ error: "auth state corrupt - reset setup" }, 500);

  const token = readSessionCookie(c.req.header("cookie"));
  if (!token) return c.json({ error: "unauthorized" }, 401);

  const payload = await verifySession(secret, token);
  if (!payload) return c.json({ error: "unauthorized" }, 401);

  await next();

  if (shouldRefresh(payload)) {
    const fresh = await signSession(secret);
    c.header("set-cookie", buildSetCookie(fresh), { append: true });
  }
};
