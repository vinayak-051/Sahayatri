// Turns Supabase/PostgREST errors into messages a traveller or guide can act on.
// Our own database rules (backend/supabase/migrations) raise readable messages,
// so those pass through; raw Postgres errors are translated or replaced.
interface DbError {
  code?: string;
  message?: string;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  bookings_guide_date_accepted: "You already have a trip accepted on this date.",
  bookings_no_self_booking: "You can't book yourself.",
  bookings_people_range: "Group size must be between 1 and 20 people.",
  messages_content_length: "Messages must be between 1 and 2,000 characters.",
  messages_no_self: "You can't message yourself.",
  buddy_trips_dates_valid: "The end date must be on or after the start date.",
  buddy_requests_trip_id_traveler_id_key: "You've already asked to join this trip.",
  locations_coordinates_valid: "Pick a valid location on the map.",
  locations_price_non_negative: "Price can't be negative.",
  profiles_rate_non_negative: "Your rate can't be negative.",
  reviews_guide_id_reviewer_id_key: "You've already reviewed this guide.",
  location_reviews_location_id_reviewer_id_key: "You've already reviewed this spot.",
  saved_locations_pkey: "This spot is already saved.",
  verification_requests_one_pending: "You already have a verification request under review.",
};

export function friendlyDbError(
  error: DbError | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!error) return fallback;
  const message = error.message ?? "";

  const constraint = Object.keys(CONSTRAINT_MESSAGES).find((name) => message.includes(name));
  if (constraint) return CONSTRAINT_MESSAGES[constraint];

  switch (error.code) {
    case "42501":
      // RLS and grant failures are cryptic; our own rules explain themselves.
      return /row-level security|permission denied/i.test(message) ? "You don't have permission to do that." : message;
    case "P0001": // raise exception in our triggers and functions
    case "22023": // invalid_parameter_value, used by our rules for bad input
      return message || fallback;
    case "23505":
      return "That already exists.";
    case "23514":
      return "Some of the details aren't valid.";
    default:
      return /rate limit/i.test(message) ? message : fallback;
  }
}
