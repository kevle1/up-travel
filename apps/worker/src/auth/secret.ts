// Cookie signing secret. Lives in KV (written at Setup, deleted at Reset) so
// a fresh deploy doesn't require a manual `wrangler secret put` step. The
// Worker secret AUTH_COOKIE_SECRET still wins if set - handy for paranoid
// users who want the key out of KV.

import type { Env } from "../env";
import { COOKIE_SECRET_KEY } from "./keys";

export async function readCookieSecret(env: Env): Promise<string | null> {
  if (env.AUTH_COOKIE_SECRET) return env.AUTH_COOKIE_SECRET;
  return env.KV.get(COOKIE_SECRET_KEY);
}

export function generateCookieSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
