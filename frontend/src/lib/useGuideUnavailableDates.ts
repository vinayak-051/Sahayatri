import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { todayIso, type UnavailableDate } from "@/lib/availability";

/** Upcoming (today onwards) blocked dates for a guide, oldest first. */
export async function fetchUpcomingUnavailableDates(guideId: string): Promise<UnavailableDate[]> {
  const { data, error } = await supabase
    .from("guide_unavailable_dates")
    .select("date, note")
    .eq("guide_id", guideId)
    .gte("date", todayIso())
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as UnavailableDate[];
}

/**
 * Loads a guide's upcoming blocked dates while `enabled` (e.g. the booking form is
 * open). On failure the list stays empty: the database still rejects blocked dates.
 */
export function useGuideUnavailableDates(guideId: string | null | undefined, enabled = true): string[] {
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    if (!guideId || !enabled) return;
    let cancelled = false;
    fetchUpcomingUnavailableDates(guideId)
      .then((rows) => {
        if (!cancelled) setDates(rows.map((r) => r.date));
      })
      .catch((err: unknown) => {
        console.error("Failed to load guide availability:", err instanceof Error ? err.message : err);
      });
    return () => {
      cancelled = true;
    };
  }, [guideId, enabled]);

  return dates;
}
