import { describe, expect, it } from "vitest";
import { functionErrorMessage, isExpiredRequest, localToday } from "@/lib/bookingStatus";

describe("isExpiredRequest", () => {
  const today = "2026-11-16";

  it("marks pending requests dated before today as expired", () => {
    expect(isExpiredRequest({ status: "pending", date: "2026-10-31" }, today)).toBe(true);
  });

  it("keeps today's and future requests live", () => {
    expect(isExpiredRequest({ status: "pending", date: today }, today)).toBe(false);
    expect(isExpiredRequest({ status: "pending", date: "2026-12-01" }, today)).toBe(false);
  });

  it("only applies to pending requests", () => {
    expect(isExpiredRequest({ status: "accepted", date: "2026-10-31" }, today)).toBe(false);
  });
});

describe("localToday", () => {
  it("formats the local date", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("functionErrorMessage", () => {
  it("prefers an error in the data", async () => {
    expect(await functionErrorMessage(null, { error: "Nope" }, "fallback")).toBe("Nope");
  });

  it("reads the function's JSON body from the HTTP error", async () => {
    const context = new Response(JSON.stringify({ error: "Online payment isn't available yet." }), { status: 503 });
    expect(await functionErrorMessage({ context }, null, "fallback")).toBe("Online payment isn't available yet.");
  });

  it("falls back when there is no readable body", async () => {
    expect(await functionErrorMessage({ context: new Response("oops", { status: 500 }) }, null, "fallback")).toBe("fallback");
    expect(await functionErrorMessage(new Error("network"), null, "fallback")).toBe("fallback");
  });
});
