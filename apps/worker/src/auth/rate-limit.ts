// Per-IP failure counter in KV. After MAX_ATTEMPTS in WINDOW_S, the IP is
// locked out until the KV entry TTLs out. Counter resets on successful login.

const WINDOW_S = 15 * 60;
const MAX_ATTEMPTS = 5;

interface Entry {
  count: number;
  lockedUntil?: number;
}

function key(ip: string): string {
  return `auth:rate:${ip}`;
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function isLocked(kv: KVNamespace, ip: string): Promise<boolean> {
  const entry = await kv.get<Entry>(key(ip), "json");
  if (!entry) return false;
  return !!entry.lockedUntil && entry.lockedUntil > Math.floor(Date.now() / 1000);
}

export async function recordFailure(kv: KVNamespace, ip: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const prev = (await kv.get<Entry>(key(ip), "json")) ?? { count: 0 };
  const next: Entry = { count: prev.count + 1 };
  if (next.count >= MAX_ATTEMPTS) next.lockedUntil = now + WINDOW_S;
  await kv.put(key(ip), JSON.stringify(next), { expirationTtl: WINDOW_S });
}

export async function recordSuccess(kv: KVNamespace, ip: string): Promise<void> {
  await kv.delete(key(ip));
}
