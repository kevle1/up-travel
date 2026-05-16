import { describe, expect, it, vi } from "vitest";
import { UpClient } from "../../src/up/client";

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("UpClient.listTransactionsSince", () => {
  it("paginates via next.links until exhausted", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(okJson({
        data: [{ id: "a", attributes: {}, relationships: {} }],
        links: { next: "https://api.up.com.au/api/v1/transactions?page=2" },
      }))
      .mockResolvedValueOnce(okJson({
        data: [{ id: "b", attributes: {}, relationships: {} }],
        links: { next: null },
      }));
    const c = new UpClient({ token: "tok", base: "https://api.up.com.au/api/v1", fetch });
    const all: { id: string }[] = [];
    for await (const t of c.listTransactionsSince("2025-01-01T00:00:00Z")) {
      all.push(t);
    }
    expect(all.map((t) => t.id)).toEqual(["a", "b"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries 429 with backoff", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(okJson({ data: [], links: { next: null } }));
    const c = new UpClient({
      token: "t", base: "https://api.up.com.au/api/v1", fetch, sleep: async () => {},
    });
    const out: unknown[] = [];
    for await (const t of c.listTransactionsSince("2025-01-01T00:00:00Z")) out.push(t);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out).toEqual([]);
  });

  it("throws on non-429 4xx/5xx", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    const c = new UpClient({ token: "t", base: "https://api.up.com.au/api/v1", fetch });
    await expect(async () => {
      for await (const _ of c.listTransactionsSince("2025-01-01")) {
        /* drain */
      }
    }).rejects.toThrow(/401/);
  });
});

describe("UpClient.registerWebhook", () => {
  it("POSTs to /webhooks and returns id + secret", async () => {
    const fetch = vi.fn().mockResolvedValue(okJson({
      data: { id: "wh-1", attributes: { secretKey: "shh" } },
    }));
    const c = new UpClient({ token: "t", base: "https://api.up.com.au/api/v1", fetch });
    const r = await c.registerWebhook("https://example.com/webhook/up");
    expect(r).toEqual({ id: "wh-1", secret: "shh" });
  });
});
