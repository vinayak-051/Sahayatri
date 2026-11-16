import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import {
  buildTrustItems,
  fetchBookingTimeseries,
  fetchGuideMyStats,
  fetchGuidePublicStats,
  formatMemberSince,
  formatResponseRate,
  formatResponseTime,
  parseBookingTimeseries,
  toDailyChart,
  toMonthlyChart,
  type GuidePublicStats,
} from "@/lib/guideStats";

beforeEach(() => {
  mockRpc.mockReset();
});

const publicStats: GuidePublicStats = {
  completedTrips: 12,
  travellersServed: 9,
  responseRate: 0.857,
  medianResponseHours: 3.2,
  memberSince: "2025-03-10T08:00:00Z",
  reviewsCount: 4,
  avgRating: 4.75,
};

describe("trust strip formatting", () => {
  it("formats the response rate as a whole percentage", () => {
    expect(formatResponseRate(0.857)).toBe("86%");
    expect(formatResponseRate(1)).toBe("100%");
    expect(formatResponseRate(0)).toBe("0%");
    expect(formatResponseRate(null)).toBeNull();
  });

  it("describes the typical response time in hours or days", () => {
    expect(formatResponseTime(0.4)).toBe("within an hour");
    expect(formatResponseTime(1)).toBe("within 1 hour");
    expect(formatResponseTime(3.2)).toBe("within 4 hours");
    expect(formatResponseTime(24)).toBe("within a day");
    expect(formatResponseTime(50)).toBe("within 3 days");
    expect(formatResponseTime(null)).toBeNull();
  });

  it("shows member since as month and year", () => {
    expect(formatMemberSince("2025-03-10T08:00:00Z")).toBe(
      new Date("2025-03-10T08:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
    );
    expect(formatMemberSince(null)).toBeNull();
    expect(formatMemberSince("not a date")).toBeNull();
  });

  it("builds the strip and hides items without data", () => {
    expect(buildTrustItems(publicStats).map((i) => [i.label, i.value])).toEqual([
      ["Completed trips", "12"],
      ["Response rate", "86%"],
      ["Typically responds", "within 4 hours"],
      ["Member since", formatMemberSince(publicStats.memberSince)],
    ]);

    const fresh = buildTrustItems({ ...publicStats, completedTrips: 1, responseRate: null, medianResponseHours: null, memberSince: null });
    expect(fresh).toEqual([{ key: "trips", label: "Completed trip", value: "1" }]);
    expect(buildTrustItems(null)).toEqual([]);
  });
});

describe("fetchGuidePublicStats", () => {
  it("calls guide_public_stats and maps the payload", async () => {
    mockRpc.mockResolvedValue({
      data: {
        completed_trips: 12, travellers_served: 9, response_rate: "0.857", median_response_hours: 3.2,
        member_since: "2025-03-10T08:00:00Z", reviews_count: 4, avg_rating: "4.75",
      },
      error: null,
    });
    await expect(fetchGuidePublicStats("g1")).resolves.toEqual(publicStats);
    expect(mockRpc).toHaveBeenCalledWith("guide_public_stats", { p_guide_id: "g1" });
  });

  it("returns null for a null payload, an error or a thrown call", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchGuidePublicStats("g1")).resolves.toBeNull();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    await expect(fetchGuidePublicStats("g1")).resolves.toBeNull();
    mockRpc.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchGuidePublicStats("g1")).resolves.toBeNull();
  });
});

describe("fetchGuideMyStats", () => {
  it("maps the guide_my_stats payload", async () => {
    mockRpc.mockResolvedValue({
      data: {
        completed_trips: 3, travellers_served: 2, pending_requests: 2, upcoming_trips: 1,
        bookings_by_status: { pending: 3, accepted: 1, confirmed: 0, completed: 3, declined: 1, cancelled: 0 },
        ledger_balance: "2100", lifetime_earnings: 5100, reviews_count: 0, avg_rating: null,
      },
      error: null,
    });
    const result = await fetchGuideMyStats();
    expect(mockRpc).toHaveBeenCalledWith("guide_my_stats", undefined);
    expect(result).toEqual({
      error: null,
      data: {
        completedTrips: 3, travellersServed: 2, pendingRequests: 2, upcomingTrips: 1,
        bookingsByStatus: { pending: 3, accepted: 1, confirmed: 0, completed: 3, declined: 1, cancelled: 0 },
        ledgerBalance: 2100, lifetimeEarnings: 5100, reviewsCount: 0, avgRating: null,
      },
    });
  });

  it("passes the error message through", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Only guides have guide stats" } });
    await expect(fetchGuideMyStats()).resolves.toEqual({ data: null, error: "Only guides have guide stats" });
  });
});

describe("admin booking time series", () => {
  const bucket = (key: "day" | "month", period: string, extra: Record<string, number> = {}) => ({
    [key]: period, total: 0, pending: 0, accepted: 0, confirmed: 0, completed: 0, declined: 0, cancelled: 0, value: 0, ...extra,
  });
  const payload = {
    from: "2026-06-01",
    to: "2026-11-16",
    daily: [
      bucket("day", "2026-11-08", { total: 9 }),
      ...["09", "10", "11", "12", "13", "14", "15"].map((d) => bucket("day", `2026-11-${d}`)),
      bucket("day", "2026-11-16", { total: 4, pending: 1, accepted: 1, confirmed: 1, completed: 1, value: "4500" as unknown as number }),
    ],
    monthly: [bucket("month", "2026-10", { total: 2, declined: 2, value: 800 }), bucket("month", "2026-11", { total: 13, accepted: 3, value: 9000 })],
  };

  it("calls admin_booking_timeseries with the month count", async () => {
    mockRpc.mockResolvedValue({ data: payload, error: null });
    const { data } = await fetchBookingTimeseries(6);
    expect(mockRpc).toHaveBeenCalledWith("admin_booking_timeseries", { p_months: 6 });
    expect(data?.daily[data.daily.length - 1]).toEqual({
      period: "2026-11-16", total: 4, pending: 1, accepted: 1, confirmed: 1, completed: 1, declined: 0, cancelled: 0, value: 4500,
    });
  });

  it("turns buckets into the existing chart points", () => {
    const ts = parseBookingTimeseries(payload);
    const daily = toDailyChart(ts, 7);
    expect(daily).toHaveLength(7);
    expect(daily[daily.length - 1]).toMatchObject({ Requested: 4, Accepted: 3, revenue: 4500 });
    expect(daily.some((p) => p.Requested === 9)).toBe(false); // older than 7 days

    expect(toMonthlyChart(ts)).toEqual([
      { label: new Date("2026-10-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), Requested: 2, Accepted: 0, revenue: 800 },
      { label: new Date("2026-11-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), Requested: 13, Accepted: 3, revenue: 9000 },
    ]);
  });

  it("copes with a malformed payload", () => {
    expect(parseBookingTimeseries(null)).toEqual({ from: "", to: "", daily: [], monthly: [] });
  });
});
