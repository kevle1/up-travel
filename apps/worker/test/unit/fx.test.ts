import { describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { getRateToAud } from "../../src/fx";

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("getRateToAud", () => {
  it("caches on hit", async () => {
    await env.KV.put("fx:2025-09-15:JPY", JSON.stringify({ rate: 0.0094, actualDate: "2025-09-15" }));
    const fetch = vi.fn();
    const r = await getRateToAud({ kv: env.KV, fetch, date: "2025-09-15", currency: "JPY" });
    expect(r.rate).toBe(0.0094);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches and caches on miss", async () => {
    const fetch = vi.fn().mockResolvedValue(okJson({
      date: "2025-09-15",
      aud: { jpy: 106.4 },
    }));
    const r = await getRateToAud({ kv: env.KV, fetch, date: "2025-09-15", currency: "JPY" });
    expect(r.rate).toBeCloseTo(1 / 106.4, 6);
    const cached = await env.KV.get("fx:2025-09-15:JPY");
    expect(cached).not.toBeNull();
  });

  it("walks back if first attempt is missing", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      .mockResolvedValueOnce(okJson({ date: "2025-09-14", aud: { jpy: 106 } }));
    const r = await getRateToAud({ kv: env.KV, fetch, date: "2025-09-15", currency: "JPY" });
    expect(r.actualDate).toBe("2025-09-14");
  });

  it("falls back to secondary CDN endpoint", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("down", { status: 500 }))
      .mockResolvedValueOnce(okJson({ date: "2025-09-15", aud: { jpy: 100 } }));
    const r = await getRateToAud({ kv: env.KV, fetch, date: "2025-09-15", currency: "JPY" });
    expect(r.rate).toBeCloseTo(0.01, 6);
  });
});
