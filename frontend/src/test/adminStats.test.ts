import { describe, expect, it } from "vitest";
import { parseOverviewStats } from "@/lib/adminStats";

describe("parseOverviewStats", () => {
  it("maps the admin_overview_stats payload, accepting numerics sent as strings", () => {
    const stats = parseOverviewStats({
      travelers: 12,
      guides: 5,
      verified_guides: 3,
      bookings: { total: 9, pending: 2, accepted: 1, confirmed: 1, completed: 3, declined: 1, cancelled: 1 },
      buddy_trips: 4,
      open_reports: 2,
      pending_verifications: 1,
      gross_booking_value: 12500,
      commission_revenue: "1875.50",
      cancellation_fees: 200,
      platform_revenue: "2075.50",
      outstanding_guide_balances: 9000,
    });

    expect(stats).toEqual({
      travelers: 12,
      guides: 5,
      verifiedGuides: 3,
      bookings: { total: 9, pending: 2, accepted: 1, confirmed: 1, completed: 3, declined: 1, cancelled: 1 },
      buddyTrips: 4,
      openReports: 2,
      pendingVerifications: 1,
      grossBookingValue: 12500,
      commissionRevenue: 1875.5,
      cancellationFees: 200,
      platformRevenue: 2075.5,
      outstandingGuideBalances: 9000,
    });
  });

  it("treats missing or malformed values as zero", () => {
    const empty = parseOverviewStats(null);
    expect(empty.travelers).toBe(0);
    expect(empty.platformRevenue).toBe(0);
    expect(empty.bookings).toEqual({ total: 0, pending: 0, accepted: 0, confirmed: 0, completed: 0, declined: 0, cancelled: 0 });

    const malformed = parseOverviewStats({ travelers: "many", bookings: "none", commission_revenue: null });
    expect(malformed.travelers).toBe(0);
    expect(malformed.bookings.total).toBe(0);
    expect(malformed.commissionRevenue).toBe(0);
  });
});
