import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminReviews, mergeLatestReviews, type AdminReview } from "@/lib/adminReviews";
import { mockQuery, type QueryCall } from "./supabaseMock";

const queries: { table: string; calls: QueryCall[] }[] = [];
const results: Record<string, unknown> = {};

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: (table: string) => {
      const calls: QueryCall[] = [];
      queries.push({ table, calls });
      return mockQuery(results[table], calls);
    },
  },
}));

const guideRow = {
  id: "g1",
  rating: 5,
  comment: "Knew every lane in the old city",
  created_at: "2026-11-01T10:00:00Z",
  reviewer: { name: "Asha" },
  guide: { name: "Ravi" },
};
const spotRow = {
  id: "s1",
  rating: 2,
  comment: "Crowded and overpriced",
  created_at: "2026-11-05T10:00:00Z",
  reviewer: { name: "Meera" },
  location: { title: "Hawa Mahal" },
};

const callsFor = (table: string) => queries.filter((q) => q.table === table).flatMap((q) => q.calls);

beforeEach(() => {
  queries.length = 0;
  results.reviews = { data: [guideRow], error: null };
  results.location_reviews = { data: [spotRow], error: null };
});

describe("fetchAdminReviews", () => {
  it("returns guide and spot reviews together, newest first, with author and target names", async () => {
    const { reviews, error } = await fetchAdminReviews({ kind: "all", lowRatingsOnly: false });

    expect(error).toBeNull();
    expect(reviews).toEqual([
      {
        id: "s1",
        kind: "spot",
        rating: 2,
        comment: "Crowded and overpriced",
        createdAt: "2026-11-05T10:00:00Z",
        authorName: "Meera",
        targetName: "Hawa Mahal",
      },
      {
        id: "g1",
        kind: "guide",
        rating: 5,
        comment: "Knew every lane in the old city",
        createdAt: "2026-11-01T10:00:00Z",
        authorName: "Asha",
        targetName: "Ravi",
      },
    ]);
    for (const table of ["reviews", "location_reviews"]) {
      const calls = callsFor(table);
      expect(calls).toContainEqual({ method: "order", args: ["created_at", { ascending: false }] });
      expect(calls).toContainEqual({ method: "limit", args: [50] });
      expect(calls.some((c) => c.method === "lte")).toBe(false);
    }
  });

  it("queries only the chosen kind and filters to low ratings", async () => {
    const { reviews } = await fetchAdminReviews({ kind: "spot", lowRatingsOnly: true });

    expect(reviews.map((r) => r.id)).toEqual(["s1"]);
    expect(callsFor("reviews")).toHaveLength(0);
    expect(callsFor("location_reviews")).toContainEqual({ method: "lte", args: ["rating", 2] });
  });

  it("reports a failed query instead of showing partial results", async () => {
    const failure = { code: "PGRST301", message: "JWT expired" };
    results.reviews = { data: null, error: failure };

    const { reviews, error } = await fetchAdminReviews({ kind: "all", lowRatingsOnly: false });

    expect(reviews).toEqual([]);
    expect(error).toEqual(failure);
  });
});

describe("mergeLatestReviews", () => {
  const review = (id: string, createdAt: string): AdminReview => ({
    id,
    kind: "guide",
    rating: 4,
    comment: "",
    createdAt,
    authorName: null,
    targetName: null,
  });

  it("sorts across lists and keeps only the newest", () => {
    const merged = mergeLatestReviews(
      [
        [review("a", "2026-01-01T00:00:00Z"), review("c", "2026-03-01T00:00:00Z")],
        [review("b", "2026-02-01T00:00:00Z")],
      ],
      2,
    );
    expect(merged.map((r) => r.id)).toEqual(["c", "b"]);
  });
});
