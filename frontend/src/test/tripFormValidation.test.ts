import { describe, expect, it, vi } from "vitest";

// The page module creates the Supabase client on import; the helper itself never uses it.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

import {
  MAX_BUDGET_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DESTINATION_LENGTH,
  validateTripForm,
  type TripFormValues,
} from "@/pages/TravelBuddy";

const TODAY = "2026-11-10";

const valid: TripFormValues = {
  destination: "Leh",
  startDate: "2026-11-20",
  endDate: "2026-11-25",
  budget: "₹15,000",
  description: "Road trip, splitting a rented car.",
};

describe("validateTripForm", () => {
  it("accepts a complete trip", () => {
    expect(validateTripForm(valid, TODAY)).toEqual({});
  });

  it("accepts a trip without the optional budget and description", () => {
    expect(validateTripForm({ ...valid, budget: "", description: "" }, TODAY)).toEqual({});
  });

  it("requires a destination that is not just spaces", () => {
    expect(validateTripForm({ ...valid, destination: "" }, TODAY).destination).toMatch(/where you're going/);
    expect(validateTripForm({ ...valid, destination: "   " }, TODAY).destination).toMatch(/where you're going/);
  });

  it("limits the destination length", () => {
    expect(validateTripForm({ ...valid, destination: "x".repeat(MAX_DESTINATION_LENGTH) }, TODAY)).toEqual({});
    expect(validateTripForm({ ...valid, destination: "x".repeat(MAX_DESTINATION_LENGTH + 1) }, TODAY).destination).toMatch(
      /100 characters/,
    );
  });

  it("requires both dates", () => {
    const errors = validateTripForm({ ...valid, startDate: "", endDate: "" }, TODAY);
    expect(errors.startDate).toBe("Pick a start date.");
    expect(errors.endDate).toBe("Pick an end date.");
  });

  it("rejects a start date in the past but allows today", () => {
    expect(validateTripForm({ ...valid, startDate: "2026-11-09" }, TODAY).startDate).toMatch(/can't be in the past/);
    expect(validateTripForm({ ...valid, startDate: TODAY }, TODAY)).toEqual({});
  });

  it("requires the trip to end on or after its start", () => {
    expect(validateTripForm({ ...valid, endDate: "2026-11-19" }, TODAY).endDate).toMatch(/on or after the start date/);
    expect(validateTripForm({ ...valid, endDate: valid.startDate }, TODAY)).toEqual({});
  });

  it("compares dates across month and year boundaries", () => {
    expect(validateTripForm({ ...valid, startDate: "2026-12-30", endDate: "2027-01-02" }, TODAY)).toEqual({});
    expect(validateTripForm({ ...valid, startDate: "2027-01-02", endDate: "2026-12-30" }, TODAY).endDate).toBeDefined();
  });

  it("limits the budget and description length", () => {
    const atLimit = { ...valid, budget: "x".repeat(MAX_BUDGET_LENGTH), description: "x".repeat(MAX_DESCRIPTION_LENGTH) };
    expect(validateTripForm(atLimit, TODAY)).toEqual({});

    const errors = validateTripForm(
      { ...valid, budget: "x".repeat(MAX_BUDGET_LENGTH + 1), description: "x".repeat(MAX_DESCRIPTION_LENGTH + 1) },
      TODAY,
    );
    expect(errors.budget).toMatch(/50 characters/);
    expect(errors.description).toMatch(/500 characters/);
  });

  it("reports every problem at once", () => {
    const errors = validateTripForm({ destination: "", startDate: "2020-01-01", endDate: "2019-12-31", budget: "", description: "" }, TODAY);
    expect(Object.keys(errors).sort()).toEqual(["destination", "endDate", "startDate"]);
  });
});
