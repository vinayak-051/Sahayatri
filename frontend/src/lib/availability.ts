// Guide availability: dates a guide has blocked (table guide_unavailable_dates).
// Pure helpers for the booking forms and the guide's availability page. The
// database rejects bookings on blocked dates too; this only gives early feedback.
import { format, parseISO } from "date-fns";

export interface UnavailableDate {
  date: string; // yyyy-MM-dd
  note: string | null;
}

export const MAX_NOTE_LENGTH = 100;

/** A local calendar day as yyyy-MM-dd (what a date input or the calendar shows). */
export const toIsoDate = (d: Date): string => format(d, "yyyy-MM-dd");

export const todayIso = (): string => toIsoDate(new Date());

/** "20 Nov" */
export const formatShortDate = (iso: string): string => format(parseISO(iso), "d MMM");

/** "Unavailable dates: 20 Nov, 22 Nov +3 more", or null when nothing is blocked. */
export function formatUnavailableHint(dates: string[], max = 6): string | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  const shown = sorted.slice(0, max).map(formatShortDate).join(", ");
  const extra = sorted.length - max;
  return `Unavailable dates: ${shown}${extra > 0 ? ` +${extra} more` : ""}`;
}

/** Returns an inline error for the chosen trip date, or null when it can be requested. */
export function validateTripDate(
  date: string,
  unavailable: string[],
  guideName?: string | null,
  today: string = todayIso(),
): string | null {
  if (!date) return "Pick a date for your trip.";
  if (date < today) return "Trip date cannot be in the past.";
  if (unavailable.includes(date)) {
    return `${guideName?.trim() || "This guide"} isn't available on that date. Please pick another day.`;
  }
  return null;
}
