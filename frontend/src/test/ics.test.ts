import { describe, expect, it } from "vitest";
import { buildTripIcs } from "@/lib/ics";

const now = new Date("2026-11-09T10:20:30.456Z");

describe("buildTripIcs", () => {
  it("creates an all-day event with a stable UID", () => {
    const ics = buildTripIcs({ id: "booking-1", date: "2026-12-05", title: "Trip to Jaipur" }, now);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("UID:booking-1@sahayatri\r\n");
    expect(ics).toContain("DTSTAMP:20261109T102030Z\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261205\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261206\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("ends the event on the next day across month and year boundaries", () => {
    expect(buildTripIcs({ id: "b", date: "2026-01-31", title: "t" }, now)).toContain("DTEND;VALUE=DATE:20260201");
    expect(buildTripIcs({ id: "b", date: "2026-12-31", title: "t" }, now)).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("escapes commas, semicolons, backslashes and newlines", () => {
    const ics = buildTripIcs(
      { id: "b", date: "2026-12-05", title: "City Palace, Udaipur; sunset", description: "Line 1\nLine 2 \\ end" },
      now,
    );
    expect(ics).toContain("SUMMARY:City Palace\\, Udaipur\\; sunset\r\n");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2 \\\\ end\r\n");
  });

  it("folds lines longer than 75 octets, including multi-byte text", () => {
    const ics = buildTripIcs({ id: "b", date: "2026-12-05", title: "₹".repeat(60), description: "x".repeat(200) }, now);
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"₹".repeat(60)}`);
    expect(unfolded).toContain(`DESCRIPTION:${"x".repeat(200)}`);
  });
});
