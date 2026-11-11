import type { BookingStatus } from "@/types/database";

// Totals for the admin Overview, computed in the database by
// public.admin_overview_stats() (backend/supabase/migrations/20261109100400_admin_tools.sql).
export interface AdminOverviewStats {
  travelers: number;
  guides: number;
  verifiedGuides: number;
  bookings: Record<BookingStatus | "total", number>;
  buddyTrips: number;
  openReports: number;
  pendingVerifications: number;
  /** Full amount of completed trips. Mostly the guides' money, not revenue. */
  grossBookingValue: number;
  /** Platform commission from the guide ledger, as a positive number. */
  commissionRevenue: number;
  /** Fees kept from late cancellations. */
  cancellationFees: number;
  /** commissionRevenue + cancellationFees. */
  platformRevenue: number;
  /** What the platform still owes guides. */
  outstandingGuideBalances: number;
}

const BOOKING_KEYS: (BookingStatus | "total")[] = [
  "total", "pending", "accepted", "confirmed", "completed", "declined", "cancelled",
];

type RawStats = Record<string, unknown>;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Postgres numerics can arrive as numbers or strings; missing values count as 0.
export function parseOverviewStats(raw: unknown): AdminOverviewStats {
  const data = (raw && typeof raw === "object" ? raw : {}) as RawStats;
  const rawBookings = (data.bookings && typeof data.bookings === "object" ? data.bookings : {}) as RawStats;
  const bookings = Object.fromEntries(BOOKING_KEYS.map((k) => [k, num(rawBookings[k])])) as AdminOverviewStats["bookings"];

  return {
    travelers: num(data.travelers),
    guides: num(data.guides),
    verifiedGuides: num(data.verified_guides),
    bookings,
    buddyTrips: num(data.buddy_trips),
    openReports: num(data.open_reports),
    pendingVerifications: num(data.pending_verifications),
    grossBookingValue: num(data.gross_booking_value),
    commissionRevenue: num(data.commission_revenue),
    cancellationFees: num(data.cancellation_fees),
    platformRevenue: num(data.platform_revenue),
    outstandingGuideBalances: num(data.outstanding_guide_balances),
  };
}
