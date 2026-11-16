import { describe, expect, it } from "vitest";
import { formatShortDate, formatUnavailableHint, toIsoDate, validateTripDate } from "@/lib/availability";

const TODAY = "2026-11-16";

describe("validateTripDate", () => {
  it("accepts a free future date and today", () => {
    expect(validateTripDate("2026-11-20", ["2026-11-21"], "Asha", TODAY)).toBeNull();
    expect(validateTripDate(TODAY, [], "Asha", TODAY)).toBeNull();
  });

  it("requires a date", () => {
    expect(validateTripDate("", [], "Asha", TODAY)).toBe("Pick a date for your trip.");
  });

  it("rejects past dates", () => {
    expect(validateTripDate("2026-11-15", [], "Asha", TODAY)).toBe("Trip date cannot be in the past.");
  });

  it("rejects dates the guide has blocked, naming the guide", () => {
    expect(validateTripDate("2026-11-21", ["2026-11-21"], "Asha", TODAY)).toBe(
      "Asha isn't available on that date. Please pick another day.",
    );
    expect(validateTripDate("2026-11-21", ["2026-11-21"], "  ", TODAY)).toMatch(/^This guide isn't available/);
    expect(validateTripDate("2026-11-21", ["2026-11-21"], undefined, TODAY)).toMatch(/^This guide isn't available/);
  });
});

describe("formatting", () => {
  it("formats dates as local calendar days", () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(formatShortDate("2026-11-20")).toBe("20 Nov");
  });

  it("builds the unavailable-dates hint, sorted and capped", () => {
    expect(formatUnavailableHint([])).toBeNull();
    expect(formatUnavailableHint(["2026-11-22", "2026-11-20"])).toBe("Unavailable dates: 20 Nov, 22 Nov");
    expect(formatUnavailableHint(["2026-11-20", "2026-11-21", "2026-11-22"], 2)).toBe(
      "Unavailable dates: 20 Nov, 21 Nov +1 more",
    );
  });
});
