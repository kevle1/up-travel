import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { app } from "../../src/app";

describe("smoke", () => {
  it("GET /api/health → 200 ok", async () => {
    const res = await app.fetch(new Request("http://x/api/health"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
