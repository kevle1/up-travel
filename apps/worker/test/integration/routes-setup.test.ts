import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { app } from "../../src/app";

const realFetch = globalThis.fetch;

describe("setup", () => {
  it("registers webhook and stores secret in KV (idempotent)", async () => {
    await applyMigrations(env.DB);
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { id: "wh-1", attributes: { secretKey: "shh" } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "wh-1", attributes: { url: "https://x/webhook/up" } }] }), { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const envOverride = { ...env, UP_API_TOKEN: "tok", UP_API_BASE: "https://api.up.com.au/api/v1" } as never;
    const r1 = await app.fetch(new Request("http://x/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), envOverride);
    expect(r1.status).toBe(200);
    expect(await env.KV.get("up:webhook:id")).toBe("wh-1");
    expect(await env.KV.get("up:webhook:secret")).toBe("shh");

    const r2 = await app.fetch(new Request("http://x/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), envOverride);
    expect(r2.status).toBe(200);
    globalThis.fetch = realFetch;
  });
});
