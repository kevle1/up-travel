import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { app } from "../../src/app";

async function signedHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("webhook", () => {
  it("401 on bad signature", async () => {
    await applyMigrations(env.DB);
    await env.KV.put("up:webhook:secret", "shh");
    const body = '{"data":{"id":"x","attributes":{"eventType":"TRANSACTION_CREATED"}}}';
    const res = await app.fetch(new Request("http://x/webhook/up", {
      method: "POST", headers: { "x-up-authenticity-signature": "deadbeef" }, body,
    }), env);
    expect(res.status).toBe(401);
  });

  it("200 on valid signature", async () => {
    await applyMigrations(env.DB);
    await env.KV.put("up:webhook:secret", "shh");
    const body = '{"data":{"id":"x","attributes":{"eventType":"PING"}}}';
    const sig = await signedHex(body, "shh");
    const res = await app.fetch(new Request("http://x/webhook/up", {
      method: "POST", headers: { "x-up-authenticity-signature": sig }, body,
    }), env);
    expect(res.status).toBe(200);
  });
});
