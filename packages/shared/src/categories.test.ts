import { describe, expect, it } from "vitest";
import {
  TRAVEL_CATEGORIES, travelCategory, travelBucket, travelColor,
  upLabel, upParentName, upToTravel,
} from "./categories";

describe("travel categories", () => {
  it("has 11 categories", () => {
    expect(TRAVEL_CATEGORIES).toHaveLength(11);
    expect(new Set(TRAVEL_CATEGORIES.map((c) => c.id)).size).toBe(11);
  });

  it("falls back to 'other' for unknown ids", () => {
    expect(travelCategory("nope-not-a-thing").id).toBe("other");
    expect(travelBucket("nope")).toBe("Other");
    expect(travelColor("nope")).toBe(travelColor("other"));
  });

  it("maps every category to a defined bucket + color", () => {
    for (const c of TRAVEL_CATEGORIES) {
      expect(c.bucket).toBeTruthy();
      expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("Up taxonomy", () => {
  it("labels known Up categories with their friendly name", () => {
    expect(upLabel("restaurants-and-cafes")).toBe("Restaurants & Cafes");
    expect(upLabel("public-transport")).toBe("Public Transport");
    expect(upLabel("cash-withdrawals")).toBe("Cash Withdrawal");
  });

  it("title-cases unknown Up categories", () => {
    expect(upLabel("some-new-thing")).toBe("Some New Thing");
  });

  it("returns 'Uncategorised' for null/undefined", () => {
    expect(upLabel(null)).toBe("Uncategorised");
    expect(upLabel(undefined)).toBe("Uncategorised");
  });

  it("knows each child's parent group", () => {
    expect(upParentName("restaurants-and-cafes")).toBe("Good Life");
    expect(upParentName("public-transport")).toBe("Transport");
    expect(upParentName("rent-and-mortgage")).toBe("Home");
    expect(upParentName("health-and-medical")).toBe("Personal");
  });
});

describe("upToTravel default mapping", () => {
  it("routes restaurants → food", () => {
    expect(upToTravel("restaurants-and-cafes")).toBe("food");
  });
  it("routes public transport → local-transport", () => {
    expect(upToTravel("public-transport")).toBe("local-transport");
  });
  it("routes holidays-and-travel → intercity (not accommodation)", () => {
    expect(upToTravel("holidays-and-travel")).toBe("intercity");
  });
  it("routes rent-and-mortgage → accommodation", () => {
    expect(upToTravel("rent-and-mortgage")).toBe("accommodation");
  });
  it("routes cash-withdrawals → cash", () => {
    expect(upToTravel("cash-withdrawals")).toBe("cash");
  });
  it("falls back to 'other' for unknown Up tags", () => {
    expect(upToTravel("unknown-thing")).toBe("other");
    expect(upToTravel(null)).toBe("other");
  });
});
