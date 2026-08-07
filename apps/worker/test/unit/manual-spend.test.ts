import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import type { BurnState, Trip } from "@up-travel/shared";
import { app } from "../../src/app";
import { signSession } from "../../src/auth/cookie";
import { COOKIE_SECRET_KEY, PASSWORD_HASH_KEY } from "../../src/auth/keys";

// End-to-end over the real routes: log a spend by hand, then treat it like any
// other transaction - re-tag it, put it under a stay, delete it.

const SECRET = "test-cookie-secret";
let cookie = "";

async function seedSession(): Promise<void> {
  // Setup itself pings the real Up API for a PAT, so plant the two KV keys the
  // auth middleware actually reads instead.
  await env.KV.put(PASSWORD_HASH_KEY, "not-checked-by-the-middleware");
  await env.KV.put(COOKIE_SECRET_KEY, SECRET);
  cookie = `ut_session=${await signSession(SECRET)}`;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await app.request(
    `http://x${path}`,
    { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } },
    env,
  );
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const iso = (d: string) => Date.parse(`${d}T12:00:00Z`);
const burn = () => call<BurnState>("/api/burn");

describe("manual spends over the API", () => {
  beforeEach(async () => {
    // Isolated storage rolls the database back between tests, but the app's
    // own ensureSchema() has already latched its per-isolate flag - so
    // rebuild the schema here from a fresh copy of the module.
    vi.resetModules();
    const { ensureSchema } = await import("../../src/db/migrate");
    await ensureSchema(env.DB);
    await seedSession();
    const trip = await call<Trip>("/api/trips", {
      method: "POST",
      body: JSON.stringify({
        name: "Balkans",
        startDate: "2025-09-01",
        endDate: "2035-09-30", // far end date keeps the trip "live" in burn
        budgetAudCents: 600000,
        targetDailyAudCents: 20000,
      }),
    });
    await call(`/api/trips/${trip.id}/activate`, { method: "POST" });
  });

  it("stores a spend as a negative-amount manual transaction", async () => {
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amountAudCents: 4250,
        occurredAt: iso("2025-09-05"),
        travelCategory: "food",
        paymentMethod: "card",
        description: "Split dinner",
      }),
    });

    const state = await burn();
    const row = state.feed.find((r) => r.description === "Split dinner")!;
    expect(row.source).toBe("manual");
    expect(row.paymentMethod).toBe("card");
    expect(row.aud).toBe(42.5);
    expect(row.category).toBe("food");
    expect(row.incoming).toBe(false);
    expect(row.date).toBe("2025-09-05");
  });

  it("back-dates onto the right day rather than today", async () => {
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amountAudCents: 3000, occurredAt: iso("2025-09-02"), travelCategory: "food",
      }),
    });
    const state = await burn();
    expect(state.series.find((d) => d.date === "2025-09-02")!.Food).toBe(30);
    expect(state.todayBurn).toBe(0);
  });

  it("falls back to the category label when no description is given", async () => {
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({ amountAudCents: 1000, travelCategory: "nightlife" }),
    });
    const state = await burn();
    expect(state.feed[0]!.description).toBe("Nightlife & Bars");
  });

  it("only a cash payment method moves the float", async () => {
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({ amountAudCents: 2500, travelCategory: "food", paymentMethod: "cash" }),
    });
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({ amountAudCents: 9900, travelCategory: "food", paymentMethod: "card" }),
    });
    const state = await burn();
    expect(state.cashFloat).toBe(-25);
  });

  it("can be re-tagged and put under a stay like a card spend", async () => {
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amountAudCents: 40000, occurredAt: iso("2025-09-01"),
        travelCategory: "other", paymentMethod: "cash", description: "Hostel balance",
      }),
    });
    const id = (await burn()).feed.find((r) => r.description === "Hostel balance")!.id;

    const stay = await call<{ id: number }>("/api/stays", {
      method: "POST",
      body: JSON.stringify({ name: "Kotor hostel", city: "Kotor", checkIn: "2025-09-01", nights: 4 }),
    });
    await call(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ travelCategory: "accommodation", stayId: stay.id }),
    });

    const state = await burn();
    expect(state.stays[0]!.totalCost).toBe(400);
    expect(state.stays[0]!.perNight).toBe(100);
    expect(state.feed.find((r) => r.id === id)!.isAccom).toBe(true);
    // Amortised, not a $400 spike on the first night.
    expect(state.series[0]!.total).toBe(100);
  });

  it("can be spread, excluded and annotated", async () => {
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amountAudCents: 5000, occurredAt: iso("2025-09-01"), travelCategory: "local-transport",
      }),
    });
    const id = (await burn()).feed[0]!.id;

    await call(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ spreadDays: 5, notes: "5-day metro pass" }),
    });
    let state = await burn();
    expect(state.series[0]!.Transport).toBe(10);
    expect(state.feed.find((r) => r.id === id)!.notes).toBe("5-day metro pass");

    await call(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify({ excluded: true }) });
    state = await burn();
    expect(state.cumulative).toBe(0);
    expect(state.feed.find((r) => r.id === id)!.excluded).toBe(true);
  });

  it("deletes cleanly, taking its override with it", async () => {
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({ amountAudCents: 1500, travelCategory: "food", paymentMethod: "cash" }),
    });
    const id = (await burn()).feed[0]!.id;

    await call(`/api/transactions/${id}`, { method: "DELETE" });

    const state = await burn();
    expect(state.feed).toHaveLength(0);
    expect(state.cashFloat).toBe(0);
    const leftover = await env.DB
      .prepare(`SELECT txn_id FROM transaction_overrides WHERE txn_id = ?1`).bind(id).first();
    expect(leftover).toBeNull();
  });

  // The Log spend sheet labels itself "In <city>" from the same stay windows.
  // It shows nothing when no stay covers the day, which is only honest if the
  // stored city is null in exactly that case - so pin both halves here.
  it("stamps the city from the stay covering that day, and null when none does", async () => {
    await call("/api/stays", {
      method: "POST",
      body: JSON.stringify({ name: "Gothic Quarter", city: "Barcelona", checkIn: "2025-09-10", nights: 3 }),
    });

    // Inside the stay window (10th, 11th, 12th - check-out is exclusive).
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amountAudCents: 1800, occurredAt: iso("2025-09-11"),
        travelCategory: "food", description: "Vermut",
      }),
    });
    // The night you travelled, before any stay covers you.
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amountAudCents: 900, occurredAt: iso("2025-09-09"),
        travelCategory: "food", description: "Station sandwich",
      }),
    });

    const feed = (await burn()).feed;
    expect(feed.find((r) => r.description === "Vermut")!.city).toBe("Barcelona");
    expect(feed.find((r) => r.description === "Station sandwich")!.city).toBeNull();
  });

  it("keeps a stay's city off days it doesn't cover, even mid-trip", async () => {
    await call("/api/stays", {
      method: "POST",
      body: JSON.stringify({ name: "Lisbon flat", city: "Lisbon", checkIn: "2025-09-01", nights: 2 }),
    });
    await call("/api/stays", {
      method: "POST",
      body: JSON.stringify({ name: "Gothic Quarter", city: "Barcelona", checkIn: "2025-09-05", nights: 2 }),
    });

    const state = await burn();
    expect(state.cityByDay["2025-09-01"]?.city).toBe("Lisbon");
    expect(state.cityByDay["2025-09-05"]?.city).toBe("Barcelona");
    // The gap between the two bookings belongs to neither.
    expect(state.cityByDay["2025-09-03"]).toBeUndefined();
  });

  it("holds a category out of the pace maths but not off the budget", async () => {
    const tripId = (await burn()).trip.id;
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amountAudCents: 40000, occurredAt: iso("2025-09-04"),
        travelCategory: "intercity", description: "Vueling to Palma",
      }),
    });
    await call("/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        amountAudCents: 11000, occurredAt: iso("2025-09-04"), travelCategory: "food",
      }),
    });

    const before = await burn();
    expect(before.series.find((d) => d.date === "2025-09-04")!.total).toBe(510);
    expect(before.offPaceTotal).toBe(0);

    await call(`/api/trips/${tripId}`, {
      method: "PATCH",
      body: JSON.stringify({ paceExcludedCategories: ["intercity"] }),
    });

    const after = await burn();
    expect(after.trip.paceExcludedCategories).toEqual(["intercity"]);
    expect(after.series.find((d) => d.date === "2025-09-04")!.total).toBe(110);
    expect(after.offPaceTotal).toBe(400);
    // The money still left the account, so the budget position is unchanged.
    expect(after.budgetLeft).toBe(before.budgetLeft);
    expect(after.feed.find((r) => r.description === "Vueling to Palma")!.offPace).toBe(true);
  });

  it("round-trips the setting off again", async () => {
    const tripId = (await burn()).trip.id;
    await call(`/api/trips/${tripId}`, {
      method: "PATCH", body: JSON.stringify({ paceExcludedCategories: ["intercity"] }),
    });
    await call(`/api/trips/${tripId}`, {
      method: "PATCH", body: JSON.stringify({ paceExcludedCategories: [] }),
    });
    expect((await burn()).trip.paceExcludedCategories).toEqual([]);
  });

  it("defaults to empty on a trip made before the column existed", async () => {
    // Simulates the ALTER TABLE backfill: existing rows get ''.
    const tripId = (await burn()).trip.id;
    await env.DB.prepare(`UPDATE trips SET pace_excluded_categories = '' WHERE id = ?1`)
      .bind(tripId).run();
    const state = await burn();
    expect(state.trip.paceExcludedCategories).toEqual([]);
    expect(state.offPaceTotal).toBe(0);
  });

  it("refuses to delete an Up-sourced row, which sync would just restore", async () => {
    const tripId = (await burn()).trip.id;
    await env.DB.prepare(
      `INSERT INTO transactions (id, trip_id, source, occurred_at, amount_aud_cents,
                                 description, is_transfer, is_atm, synced_at)
       VALUES ('up_1', ?1, 'up', ?2, -1000, 'Coffee', 0, 0, 0)`,
    ).bind(tripId, iso("2025-09-04")).run();

    const res = await app.request(
      "http://x/api/transactions/up_1",
      { method: "DELETE", headers: { cookie } },
      env,
    );
    expect(res.status).toBe(400);
    expect((await burn()).feed.find((r) => r.id === "up_1")).toBeDefined();
  });
});
