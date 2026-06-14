import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { stays } from "./schema";

/** Resolves a UTC epoch-ms into the city the user was in (per their stays). */
export type CityLookup = (occurredAtMs: number) => string | null;

const MS_DAY = 86_400_000;

/** Build a per-trip city lookup. Fetches stays once and returns a fast O(n)
 *  function — n is the number of stays which is tiny (handfuls per trip), so
 *  this is cheap enough to call once at the top of sync or a cash-log POST. */
export async function buildCityLookup(d1: D1Database, tripId: number): Promise<CityLookup> {
  const db = drizzle(d1);
  const rows = await db
    .select({ city: stays.city, checkIn: stays.checkIn, nights: stays.nights })
    .from(stays).where(eq(stays.tripId, tripId));
  // Pre-compute window bounds in ms so the per-call work is just comparisons.
  const windows = rows
    .filter((r) => r.city)
    .map((r) => {
      const checkInMs = Date.parse(`${r.checkIn}T00:00:00Z`);
      return {
        city: r.city,
        checkInMs,
        checkOutMs: checkInMs + r.nights * MS_DAY,
      };
    });
  return (occurredAtMs: number) => {
    if (!windows.length) return null;
    const dateIso = new Date(occurredAtMs).toISOString().slice(0, 10);
    const dateMs = Date.parse(`${dateIso}T00:00:00Z`);
    for (const w of windows) {
      if (dateMs >= w.checkInMs && dateMs < w.checkOutMs) return w.city;
    }
    return null;
  };
}
