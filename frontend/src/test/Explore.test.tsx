import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Explore from "@/pages/Explore";

interface PendingCall {
  args: Record<string, unknown>;
  signal?: AbortSignal;
  resolve: (value: unknown) => void;
}

const calls: PendingCall[] = [];

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc: (_fn: string, args: Record<string, unknown>) => {
      let resolve: (value: unknown) => void = () => {};
      const promise = new Promise((r) => { resolve = r; });
      const call: PendingCall = { args, resolve };
      calls.push(call);
      const builder = {
        abortSignal: (signal: AbortSignal) => {
          call.signal = signal;
          return builder;
        },
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          promise.then(onFulfilled, onRejected),
      };
      return builder;
    },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const spot = (id: string, title: string, total: number, rank = 0) => ({
  id,
  title,
  short_description: "",
  city: "Jaipur",
  category: "Heritage",
  tags: [],
  photos: [],
  price_per_person: 500,
  rating: 0,
  reviews_count: 0,
  created_at: `2026-01-01T00:00:00.00000${id.length}+00:00`,
  guide: { id: "g", name: "Asha", profile_photo_url: null, city: "Jaipur", rating: 0 },
  rank,
  total_count: total,
});

const renderExplore = () =>
  render(
    <MemoryRouter>
      <Explore />
    </MemoryRouter>,
  );

describe("Explore", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the total match count and loads the next page from the last row's cursor", async () => {
    renderExplore();
    expect(calls).toHaveLength(1);
    const page = Array.from({ length: 12 }, (_, i) => spot(`id-${i}`, `Spot ${i}`, 13));
    await act(async () => calls[0].resolve({ data: page, error: null }));

    expect(await screen.findByText("13 found")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Load More"));
    expect(calls).toHaveLength(2);
    expect(calls[1].args).toMatchObject({
      p_after_id: "id-11",
      p_after_rank: 0,
      p_after_created_at: page[11].created_at,
    });

    await act(async () => calls[1].resolve({ data: [spot("id-12", "Spot 12", 13)], error: null }));
    expect(await screen.findByText("Spot 12")).toBeInTheDocument();
    expect(screen.getByText("Spot 0")).toBeInTheDocument();
    expect(screen.queryByText("Load More")).not.toBeInTheDocument();
  });

  it("ignores a stale response that arrives after a newer search", async () => {
    vi.useFakeTimers();
    renderExplore();
    const input = screen.getByPlaceholderText("Search spots, cities, tags...");

    fireEvent.change(input, { target: { value: "ja" } });
    await act(async () => { vi.advanceTimersByTime(400); });
    fireEvent.change(input, { target: { value: "jaipur" } });
    await act(async () => { vi.advanceTimersByTime(400); });

    const [initial, older, newer] = calls;
    expect(older.args.p_query).toBe("ja");
    expect(newer.args.p_query).toBe("jaipur");
    expect(initial.signal?.aborted).toBe(true);
    expect(older.signal?.aborted).toBe(true);

    await act(async () => newer.resolve({ data: [spot("new", "Hawa Mahal", 1, 0.5)], error: null }));
    await act(async () => older.resolve({ data: [spot("old", "Stale Result", 1, 0.5)], error: null }));
    vi.useRealTimers();

    expect(await screen.findByText("Hawa Mahal")).toBeInTheDocument();
    expect(screen.queryByText("Stale Result")).not.toBeInTheDocument();
    expect(screen.getByText("1 found")).toBeInTheDocument();
  });

  it("shows an error with a retry button when the search fails", async () => {
    renderExplore();
    await act(async () => calls[0].resolve({ data: null, error: { code: "XX000", message: "boom" } }));
    expect(await screen.findByText("Couldn't load destinations right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(calls).toHaveLength(2);
    await act(async () => calls[1].resolve({ data: [], error: null }));
    expect(await screen.findByText("No destinations found")).toBeInTheDocument();
    expect(screen.getByText("0 found")).toBeInTheDocument();
  });
});
