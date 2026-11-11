import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRICE_BANDS, cursorAfter, searchArgs, searchSpots } from "@/lib/spotSearch";

const rpc = vi.fn();
const abortSignal = vi.fn();
let result: unknown;

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      rpc(...args);
      const builder = {
        abortSignal: (signal: AbortSignal) => {
          abortSignal(signal);
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      };
      return builder;
    },
  },
}));

describe("searchArgs", () => {
  it("sends nulls for empty filters and a trimmed query", () => {
    expect(searchArgs({ query: "  jai  " })).toEqual({
      p_query: "jai",
      p_category: null,
      p_min_price: null,
      p_max_price: null,
      p_after_rank: null,
      p_after_created_at: null,
      p_after_id: null,
      p_limit: 12,
    });
    expect(searchArgs({ query: "   ", category: "" }).p_query).toBeNull();
  });

  it("passes the cursor, filters and page size through", () => {
    const args = searchArgs({
      category: "Beach",
      minPrice: 500,
      maxPrice: 2000,
      after: { rank: 0.0608, createdAt: "2026-11-09T10:20:30.123456+00:00", id: "abc" },
      limit: 6,
    });
    expect(args).toMatchObject({
      p_category: "Beach",
      p_min_price: 500,
      p_max_price: 2000,
      p_after_rank: 0.0608,
      p_after_created_at: "2026-11-09T10:20:30.123456+00:00",
      p_after_id: "abc",
      p_limit: 6,
    });
  });
});

describe("cursorAfter", () => {
  it("keeps the exact timestamp string (microseconds included)", () => {
    expect(cursorAfter({ rank: 0, created_at: "2026-01-01T00:00:00.000001+00:00", id: "x" })).toEqual({
      rank: 0,
      createdAt: "2026-01-01T00:00:00.000001+00:00",
      id: "x",
    });
  });
});

describe("PRICE_BANDS", () => {
  it("are contiguous and non-overlapping", () => {
    expect(PRICE_BANDS.under500.maxPrice).toBe(PRICE_BANDS["500to2000"].minPrice);
    expect(PRICE_BANDS["500to2000"].maxPrice).toBe(PRICE_BANDS.above2000.minPrice);
    expect(PRICE_BANDS.all).toMatchObject({ minPrice: null, maxPrice: null });
  });
});

describe("searchSpots", () => {
  beforeEach(() => {
    rpc.mockReset();
    abortSignal.mockReset();
  });

  it("calls search_locations with the abort signal and normalises numbers", async () => {
    result = { data: [{ id: "1", title: "Amber Fort", rank: "0.25", total_count: "3" }], error: null };
    const controller = new AbortController();
    const { rows, error } = await searchSpots({ query: "amber" }, controller.signal);
    expect(rpc).toHaveBeenCalledWith("search_locations", expect.objectContaining({ p_query: "amber" }));
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
    expect(error).toBeNull();
    expect(rows[0]).toMatchObject({ title: "Amber Fort", rank: 0.25, total_count: 3 });
  });

  it("returns the error and no rows when the request fails", async () => {
    result = { data: null, error: { code: "42501", message: "permission denied for function search_locations" } };
    const { rows, error } = await searchSpots({});
    expect(rows).toEqual([]);
    expect(error?.code).toBe("42501");
  });
});
