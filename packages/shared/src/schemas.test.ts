import { describe, expect, it } from "vitest";
import { upMoneyToMajor } from "./schemas";

// Up sends each amount as both a formatted string and an integer count of the
// currency's smallest unit. We read the integer: the string is a presentation
// field, and when its formatting changed every foreign amount silently became
// 0.00 while the AUD side - already read from base units - stayed correct.
describe("upMoneyToMajor", () => {
  it("converts base units using the currency's own minor unit", () => {
    expect(upMoneyToMajor({ value: "-13.20", valueInBaseUnits: -1320, currencyCode: "EUR" })).toBe(-13.2);
    expect(upMoneyToMajor({ value: "-1500", valueInBaseUnits: -1500, currencyCode: "JPY" })).toBe(-1500);
    expect(upMoneyToMajor({ value: "-13.205", valueInBaseUnits: -13205, currencyCode: "BHD" })).toBe(-13.205);
  });

  it("ignores the value string entirely, however it is formatted", () => {
    for (const value of ["-13.20", "-13,20", "-1,320.00", "-€13.20", "", "not-a-number"]) {
      expect(upMoneyToMajor({ value, valueInBaseUnits: -1320, currencyCode: "EUR" })).toBe(-13.2);
    }
  });

  it("falls back to the value string when base units are unusable", () => {
    expect(upMoneyToMajor({ value: "-13.20", valueInBaseUnits: NaN, currencyCode: "EUR" })).toBe(-13.2);
  });

  it("returns null rather than a zero it cannot back up", () => {
    expect(upMoneyToMajor({ value: "-13,20", valueInBaseUnits: NaN, currencyCode: "EUR" })).toBeNull();
    expect(upMoneyToMajor({ value: "", valueInBaseUnits: NaN, currencyCode: "EUR" })).toBeNull();
  });

  it("assumes two decimals for a currency code Intl doesn't know", () => {
    expect(upMoneyToMajor({ value: "-13.20", valueInBaseUnits: -1320, currencyCode: "ZZZ" })).toBe(-13.2);
  });
});
