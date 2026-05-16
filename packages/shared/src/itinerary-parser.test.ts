import { describe, expect, it } from "vitest";
import { parseItinerary } from "./itinerary-parser";

describe("parseItinerary", () => {
  it("parses 'D-D Mon City, Country'", () => {
    const r = parseItinerary("1-10 Jun Tokyo, JP\n11-20 Jun Kyoto, JP", 2026);
    expect(r.errors).toEqual([]);
    expect(r.entries).toEqual([
      { startDate: "2026-06-01", endDate: "2026-06-10", city: "Tokyo", country: "JP" },
      { startDate: "2026-06-11", endDate: "2026-06-20", city: "Kyoto", country: "JP" },
    ]);
  });

  it("parses 'Mon D-D City, Country'", () => {
    const r = parseItinerary("Jun 1-10 Tokyo, JP", 2026);
    expect(r.entries[0]).toEqual({
      startDate: "2026-06-01", endDate: "2026-06-10", city: "Tokyo", country: "JP",
    });
  });

  it("parses 'D/M-D/M City, Country'", () => {
    const r = parseItinerary("1/6-10/6 Tokyo, JP", 2026);
    expect(r.entries[0]).toEqual({
      startDate: "2026-06-01", endDate: "2026-06-10", city: "Tokyo", country: "JP",
    });
  });

  it("flags overlap", () => {
    const r = parseItinerary("1-15 Jun Tokyo, JP\n10-20 Jun Kyoto, JP", 2026);
    expect(r.errors.some((e) => e.message.includes("overlap"))).toBe(true);
  });

  it("flags unparsable line", () => {
    const r = parseItinerary("blah blah", 2026);
    expect(r.errors[0]?.line).toBe(1);
  });

  it("skips blank lines and # comments", () => {
    const r = parseItinerary("# leg 1\n1-10 Jun Tokyo, JP\n\n11-20 Jun Kyoto, JP", 2026);
    expect(r.errors).toEqual([]);
    expect(r.entries.length).toBe(2);
  });

  it("end_date < start_date is an error", () => {
    const r = parseItinerary("10-5 Jun Tokyo, JP", 2026);
    expect(r.errors.length).toBe(1);
  });
});
