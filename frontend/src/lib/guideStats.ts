import { supabase } from "@/lib/supabaseClient";

// Typed wrappers for the stats functions in
// backend/supabase/migrations/20261116200000_guide_stats.sql.

export type StatsResult<T> = { data: T; error: null } | { data: null; error: string };

export interface GuidePublicStats {
  completedTrips: number;
  travellersServed: number;
  /** 0..1, null when the guide has had no requests to answer. */
  responseRate: number | null;
  medianResponseHours: number | null;
  memberSince: string | null;
  reviewsCount: number;
  avgRating: number | null;
}

export type BookingStatusCounts = {
  pending: number;
  accepted: number;
  confirmed: number;
  completed: number;
  declined: number;
  cancelled: number;
};

export interface GuideMyStats {
  completedTrips: number;
  travellersServed: number;
  /** Pending requests whose trip date has not passed. */
  pendingRequests: number;
  upcomingTrips: number;
  bookingsByStatus: BookingStatusCounts;
  /** What the platform still owes the guide (ledger total, payouts included). */
  ledgerBalance: number;
  /** Earnings minus commission, from the ledger. */
  lifetimeEarnings: number;
  reviewsCount: number;
  avgRating: number | null;
}

export interface TimeseriesBucket extends BookingStatusCounts {
  /** YYYY-MM-DD for daily buckets, YYYY-MM for monthly ones. */
  period: string;
  total: number;
  /** Sum of booking amounts requested in the period, every status. */
  value: number;
}

export interface BookingTimeseries {
  from: string;
  to: string;
  daily: TimeseriesBucket[];
  monthly: TimeseriesBucket[];
}

type Raw = Record<string, unknown>;

const STATUS_KEYS: (keyof BookingStatusCounts)[] = ["pending", "accepted", "confirmed", "completed", "declined", "cancelled"];

function obj(value: unknown): Raw {
  return value && typeof value === "object" ? (value as Raw) : {};
}

function num(value: unknown): number {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function statusCounts(raw: unknown): BookingStatusCounts {
  const data = obj(raw);
  return Object.fromEntries(STATUS_KEYS.map((k) => [k, num(data[k])])) as BookingStatusCounts;
}

export function parseGuidePublicStats(raw: unknown): GuidePublicStats | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Raw;
  return {
    completedTrips: num(d.completed_trips),
    travellersServed: num(d.travellers_served),
    responseRate: numOrNull(d.response_rate),
    medianResponseHours: numOrNull(d.median_response_hours),
    memberSince: typeof d.member_since === "string" ? d.member_since : null,
    reviewsCount: num(d.reviews_count),
    avgRating: numOrNull(d.avg_rating),
  };
}

export function parseGuideMyStats(raw: unknown): GuideMyStats {
  const d = obj(raw);
  return {
    completedTrips: num(d.completed_trips),
    travellersServed: num(d.travellers_served),
    pendingRequests: num(d.pending_requests),
    upcomingTrips: num(d.upcoming_trips),
    bookingsByStatus: statusCounts(d.bookings_by_status),
    ledgerBalance: num(d.ledger_balance),
    lifetimeEarnings: num(d.lifetime_earnings),
    reviewsCount: num(d.reviews_count),
    avgRating: numOrNull(d.avg_rating),
  };
}

function parseBuckets(raw: unknown, key: "day" | "month"): TimeseriesBucket[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const d = obj(row);
    return { period: String(d[key] ?? ""), total: num(d.total), value: num(d.value), ...statusCounts(d) };
  });
}

export function parseBookingTimeseries(raw: unknown): BookingTimeseries {
  const d = obj(raw);
  return {
    from: String(d.from ?? ""),
    to: String(d.to ?? ""),
    daily: parseBuckets(d.daily, "day"),
    monthly: parseBuckets(d.monthly, "month"),
  };
}

async function callRpc<T>(name: string, args: Record<string, unknown> | undefined, parse: (raw: unknown) => T): Promise<StatsResult<T>> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { data: null, error: error.message || "Request failed" };
    return { data: parse(data), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Request failed" };
  }
}

/** Trust signals for a verified guide. Null when unavailable (not signed in, not a verified guide, or an error). */
export async function fetchGuidePublicStats(guideId: string): Promise<GuidePublicStats | null> {
  const result = await callRpc("guide_public_stats", { p_guide_id: guideId }, parseGuidePublicStats);
  return result.data;
}

export function fetchGuideMyStats(): Promise<StatsResult<GuideMyStats>> {
  return callRpc("guide_my_stats", undefined, parseGuideMyStats);
}

export function fetchBookingTimeseries(months = 6): Promise<StatsResult<BookingTimeseries>> {
  return callRpc("admin_booking_timeseries", { p_months: months }, parseBookingTimeseries);
}

// ── Trust strip formatting ────────────────────────────────────────────────────

export function formatResponseRate(rate: number | null): string | null {
  if (rate == null) return null;
  return `${Math.round(Math.min(Math.max(rate, 0), 1) * 100)}%`;
}

export function formatResponseTime(hours: number | null): string | null {
  if (hours == null || hours < 0) return null;
  if (hours < 1) return "within an hour";
  if (hours < 24) {
    const h = Math.ceil(hours);
    return `within ${h} hour${h === 1 ? "" : "s"}`;
  }
  const days = Math.ceil(hours / 24);
  return days === 1 ? "within a day" : `within ${days} days`;
}

export function formatMemberSince(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export interface TrustItem {
  key: "trips" | "response-rate" | "response-time" | "member-since";
  label: string;
  value: string;
}

export function buildTrustItems(stats: GuidePublicStats | null): TrustItem[] {
  if (!stats) return [];
  const items: (TrustItem | null)[] = [
    { key: "trips", label: stats.completedTrips === 1 ? "Completed trip" : "Completed trips", value: stats.completedTrips.toLocaleString("en-IN") },
    withValue("response-rate", "Response rate", formatResponseRate(stats.responseRate)),
    withValue("response-time", "Typically responds", formatResponseTime(stats.medianResponseHours)),
    withValue("member-since", "Member since", formatMemberSince(stats.memberSince)),
  ];
  return items.filter((i): i is TrustItem => i !== null);
}

function withValue(key: TrustItem["key"], label: string, value: string | null): TrustItem | null {
  return value == null ? null : { key, label, value };
}

// ── Admin chart data ──────────────────────────────────────────────────────────

export interface ChartPoint {
  label: string;
  Requested: number;
  /** Requests the guide accepted, including those since paid or completed. */
  Accepted: number;
  revenue: number;
}

function toPoint(bucket: TimeseriesBucket, label: string): ChartPoint {
  return {
    label,
    Requested: bucket.total,
    Accepted: bucket.accepted + bucket.confirmed + bucket.completed,
    revenue: bucket.value,
  };
}

export function toDailyChart(ts: BookingTimeseries, days = 7): ChartPoint[] {
  return ts.daily.slice(-days).map((b) =>
    toPoint(b, new Date(`${b.period}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })),
  );
}

export function toMonthlyChart(ts: BookingTimeseries): ChartPoint[] {
  return ts.monthly.map((b) =>
    toPoint(b, new Date(`${b.period}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })),
  );
}
