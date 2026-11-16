// Small booking helpers shared by the traveller and guide screens.

/** Today's date as YYYY-MM-DD in the user's local time zone. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A pending request whose trip date has passed has expired: the guide can no
 * longer accept it (the database rejects that too), only decline it.
 */
export function isExpiredRequest(booking: { status: string; date: string }, today: string = localToday()): boolean {
  return booking.status === "pending" && booking.date < today;
}

/**
 * Edge Functions answer errors with a JSON body ({ error }) and a non-2xx status.
 * supabase-js then returns a generic FunctionsHttpError and keeps the response in
 * error.context, so read the body to show the function's own message.
 */
export async function functionErrorMessage(
  error: unknown,
  data: { error?: string } | null | undefined,
  fallback: string,
): Promise<string> {
  if (data?.error) return data.error;
  const response = (error as { context?: Response } | null)?.context;
  if (response && typeof response.json === "function") {
    try {
      const body = await response.clone().json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      // not JSON: fall through
    }
  }
  return fallback;
}
