// HMAC-signed session cookie. Format: `<payload>.<sig>` where both halves are
// base64url-encoded. Payload is JSON `{ iat, exp, v }` (seconds since epoch).
// Verification is constant-time on the signature.

const TEXT = new TextEncoder();
const COOKIE_NAME = "ut_session";
const VERSION = 1;
// 1 year is the cookie Max-Age; we also re-mint when the cookie is older than
// REFRESH_AFTER_S so a regularly-used session stays fresh.
const MAX_AGE_S = 60 * 60 * 24 * 365;
const REFRESH_AFTER_S = 60 * 60 * 24 * 30;

export interface SessionPayload {
  iat: number;
  exp: number;
  v: number;
}

function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    TEXT.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function signSession(secret: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const payload: SessionPayload = { iat: now, exp: now + MAX_AGE_S, v: VERSION };
  const payloadB64 = b64urlEncode(TEXT.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, TEXT.encode(payloadB64));
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

export async function verifySession(
  secret: string,
  token: string,
  now = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const key = await importKey(secret);
  const expected = await crypto.subtle.sign("HMAC", key, TEXT.encode(payloadB64));
  if (!timingSafeEqual(new Uint8Array(expected), b64urlDecode(sigB64))) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as SessionPayload;
  } catch {
    return null;
  }
  if (payload.v !== VERSION || typeof payload.exp !== "number" || payload.exp < now) return null;
  return payload;
}

export function shouldRefresh(p: SessionPayload, now = Math.floor(Date.now() / 1000)): boolean {
  return now - p.iat > REFRESH_AFTER_S;
}

export function buildSetCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}`;
}

export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return null;
}
