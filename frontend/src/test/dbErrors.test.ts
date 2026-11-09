import { describe, expect, it } from "vitest";
import { friendlyDbError } from "@/lib/dbErrors";

describe("friendlyDbError", () => {
  it("translates known constraint violations", () => {
    expect(
      friendlyDbError({
        code: "23505",
        message: 'duplicate key value violates unique constraint "bookings_guide_date_accepted"',
      }),
    ).toBe("You already have a trip accepted on this date.");
  });

  it("passes through the readable messages raised by our own database rules", () => {
    expect(friendlyDbError({ code: "22023", message: "Trip date cannot be in the past" })).toBe(
      "Trip date cannot be in the past",
    );
    expect(friendlyDbError({ code: "42501", message: "Booking status cannot change from pending to accepted" })).toBe(
      "Booking status cannot change from pending to accepted",
    );
  });

  it("hides raw permission and RLS errors", () => {
    expect(
      friendlyDbError({ code: "42501", message: 'new row violates row-level security policy for table "messages"' }),
    ).toBe("You don't have permission to do that.");
  });

  it("falls back for unknown errors and keeps rate-limit messages", () => {
    expect(friendlyDbError({ message: "TypeError: Failed to fetch" }, "Couldn't send.")).toBe("Couldn't send.");
    expect(friendlyDbError({ code: "P0001", message: "Rate limit exceeded: too many messages, slow down." })).toBe(
      "Rate limit exceeded: too many messages, slow down.",
    );
    expect(friendlyDbError(null)).toBe("Something went wrong. Please try again.");
  });
});
