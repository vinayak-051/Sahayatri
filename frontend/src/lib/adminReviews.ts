import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

// Guide reviews live in public.reviews, spot reviews in public.location_reviews.
// Admins remove either through public.admin_delete_review(kind, id, reason).
export type ReviewKind = "guide" | "spot";
export type ReviewKindFilter = ReviewKind | "all";

/** Ratings at or below this count as "low" in the admin Reviews tab. */
export const LOW_RATING_MAX = 2;
export const ADMIN_REVIEWS_LIMIT = 50;

export interface AdminReview {
  id: string;
  kind: ReviewKind;
  rating: number;
  comment: string;
  createdAt: string;
  authorName: string | null;
  /** Guide name or spot title. */
  targetName: string | null;
}

interface ReviewRowBase {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  reviewer: { name: string } | null;
}

interface GuideReviewRow extends ReviewRowBase {
  guide: { name: string } | null;
}

interface SpotReviewRow extends ReviewRowBase {
  location: { title: string } | null;
}

export interface AdminReviewsQuery {
  kind: ReviewKindFilter;
  lowRatingsOnly: boolean;
  limit?: number;
}

// Newest first across both kinds, capped at limit.
export function mergeLatestReviews(lists: AdminReview[][], limit = ADMIN_REVIEWS_LIMIT): AdminReview[] {
  return lists
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

const SOURCES: Record<ReviewKind, { table: string; columns: string }> = {
  guide: {
    table: "reviews",
    columns:
      "id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(name), guide:profiles!reviews_guide_id_fkey(name)",
  },
  spot: {
    table: "location_reviews",
    columns:
      "id, rating, comment, created_at, reviewer:profiles!location_reviews_reviewer_id_fkey(name), location:locations(title)",
  },
};

async function fetchKind(kind: ReviewKind, lowRatingsOnly: boolean, limit: number) {
  const { table, columns } = SOURCES[kind];
  let query = supabase.from(table).select(columns);
  if (lowRatingsOnly) query = query.lte("rating", LOW_RATING_MAX);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) return { reviews: [] as AdminReview[], error };

  const reviews = ((data ?? []) as unknown as (GuideReviewRow & SpotReviewRow)[]).map(
    (row): AdminReview => ({
      id: row.id,
      kind,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
      authorName: row.reviewer?.name ?? null,
      targetName: (kind === "guide" ? row.guide?.name : row.location?.title) ?? null,
    }),
  );
  return { reviews, error: null };
}

export async function fetchAdminReviews({
  kind,
  lowRatingsOnly,
  limit = ADMIN_REVIEWS_LIMIT,
}: AdminReviewsQuery): Promise<{ reviews: AdminReview[]; error: PostgrestError | null }> {
  const kinds: ReviewKind[] = kind === "all" ? ["guide", "spot"] : [kind];
  const results = await Promise.all(kinds.map((k) => fetchKind(k, lowRatingsOnly, limit)));
  const failed = results.find((r) => r.error);
  if (failed) return { reviews: [], error: failed.error };
  return { reviews: mergeLatestReviews(results.map((r) => r.reviews), limit), error: null };
}
