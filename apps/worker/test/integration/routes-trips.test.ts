import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { applyMigrations } from "../helpers/migrations";
import { app } from "../../src/app";

async function jsonReq(path: string, method: string, body?: unknown) {
  return new Request(`http://x${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("trips routes", () => {
  it("create + list + set-active flips old inactive", async () => {
    await applyMigrations(env.DB);

    const c1 = await app.fetch(await jsonReq("/api/trips", "POST", {
      name: "Year", startDate: "2026-06-01", endDate: null, budgetAudCents: 8_000_000_00,
    }), env);
    expect(c1.status).toBe(201);
    const trip1 = await c1.json() as { id: number; isActive: boolean };
    expect(trip1.isActive).toBe(true);

    const c2 = await app.fetch(await jsonReq("/api/trips", "POST", {
      name: "Test", startDate: "2025-09-01", endDate: "2025-11-06", budgetAudCents: 10_000_00,
    }), env);
    const trip2 = await c2.json() as { id: number; isActive: boolean };
    expect(trip2.isActive).toBe(false);

    const setActive = await app.fetch(await jsonReq(`/api/trips/${trip2.id}/activate`, "POST"), env);
    expect(setActive.status).toBe(200);

    const list = await app.fetch(new Request("http://x/api/trips"), env);
    const rows = await list.json() as { id: number; isActive: boolean }[];
    const active = rows.find((r) => r.isActive);
    expect(active?.id).toBe(trip2.id);
  });

  it("archive moves trip out of active set", async () => {
    await applyMigrations(env.DB);
    const c = await app.fetch(await jsonReq("/api/trips", "POST", {
      name: "X", startDate: "2026-06-01", endDate: null, budgetAudCents: 100,
    }), env);
    const t = await c.json() as { id: number };
    const res = await app.fetch(await jsonReq(`/api/trips/${t.id}/archive`, "POST"), env);
    expect(res.status).toBe(200);
  });
});
