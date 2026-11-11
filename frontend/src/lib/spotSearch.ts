// Client for public.search_locations
// (backend/supabase/migrations/20261109100300_location_search.sql).
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { Location, Profile } from "@/types/database";

export type SpotGuide = Pick<Profile, "id" | "name" | "profile_photo_url" | "city" | "rating">;

/** One row returned by search_locations. */
export interface SpotSearchResult
  extends Pick<
    Location,
    | "id"
    | "title"
    | "short_description"
    | "city"
    | "category"
    | "tags"
    | "photos"
    | "price_per_person"
    | "rating"
    | "reviews_count"
    | "created_at"
  > {
  guide: SpotGuide | null;
  /** Relevance when searching, 0 when browsing. Part of the pagination cursor. */
  rank: number;
  /** Spots matching the filters, ignoring the cursor. */
  total_count: number;
}

/** Position after which the next page starts: the last row's sort key and id. */
export interface SpotCursor {
  rank: number;
  createdAt: string;
  id: string;
}

export interface SpotSearchParams {
  query?: string;
  category?: string | null;
  /** Inclusive. */
  minPrice?: number | null;
  /** Exclusive. */
  maxPrice?: number | null;
  after?: SpotCursor | null;
  limit?: number;
}

export type PriceBand = "all" | "under500" | "500to2000" | "above2000";

/** Non-overlapping price bands: min is inclusive, max exclusive. */
export const PRICE_BANDS: Record<PriceBand, { label: string; minPrice: number | null; maxPrice: number | null }> = {
  all: { label: "All Prices", minPrice: null, maxPrice: null },
  under500: { label: "Under ₹500", minPrice: null, maxPrice: 500 },
  "500to2000": { label: "₹500–₹2k", minPrice: 500, maxPrice: 2000 },
  above2000: { label: "₹2k+", minPrice: 2000, maxPrice: null },
};

export function cursorAfter(row: Pick<SpotSearchResult, "rank" | "created_at" | "id">): SpotCursor {
  // created_at stays the exact string the database sent: a Date would drop microseconds.
  return { rank: row.rank, createdAt: row.created_at, id: row.id };
}

export function searchArgs({ query, category, minPrice, maxPrice, after, limit = 12 }: SpotSearchParams) {
  return {
    p_query: query?.trim() || null,
    p_category: category || null,
    p_min_price: minPrice ?? null,
    p_max_price: maxPrice ?? null,
    p_after_rank: after?.rank ?? null,
    p_after_created_at: after?.createdAt ?? null,
    p_after_id: after?.id ?? null,
    p_limit: limit,
  };
}

export async function searchSpots(
  params: SpotSearchParams,
  signal?: AbortSignal,
): Promise<{ rows: SpotSearchResult[]; error: PostgrestError | null }> {
  let request = supabase.rpc("search_locations", searchArgs(params));
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) return { rows: [], error };
  const rows = ((data ?? []) as SpotSearchResult[]).map((row) => ({
    ...row,
    rank: Number(row.rank),
    total_count: Number(row.total_count),
  }));
  return { rows, error: null };
}
