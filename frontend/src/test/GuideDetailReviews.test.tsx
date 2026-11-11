import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuideDetail from "@/pages/GuideDetail";
import { mockQuery, type QueryCall } from "./supabaseMock";

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

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

const guide = {
  id: "g1",
  name: "Ravi",
  city: "Jaipur",
  rating: 4.5,
  is_verified: true,
  is_available: true,
  bio: "Old city walks",
  specialization: "Heritage",
  languages: ["Hindi"],
  additional_cities: [],
  rate_per_day: 2000,
  profile_photo_url: null,
};

const reviewBy = (reviewerId: string, name: string, rating: number) => ({
  id: `r-${reviewerId}`,
  guide_id: "g1",
  reviewer_id: reviewerId,
  rating,
  comment: `Review from ${name}`,
  created_at: "2026-11-01T10:00:00Z",
  reviewer: { id: reviewerId, name, role: "traveler", profile_photo_url: null },
});

const NEEDS_TRIP = "You can review a guide after completing a trip with them.";
const ALREADY_REVIEWED = "You've already reviewed this guide.";

const asTraveler = () =>
  mockUseAuth.mockReturnValue({ user: { id: "t1", role: "traveler" }, isGuide: false, isTraveler: true });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/guides/g1"]}>
      <Routes>
        <Route path="/guides/:id" element={<GuideDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

const writeReviewButton = () => screen.queryByRole("button", { name: /Write Review/ });

beforeEach(() => {
  queries.length = 0;
  results.profiles = { data: guide, error: null };
  results.reviews = { data: [reviewBy("t2", "Meera", 5)], error: null };
  results.bookings = { count: 0, error: null };
});

describe("GuideDetail review eligibility", () => {
  it("offers the review form to a traveller who completed a trip with the guide", async () => {
    asTraveler();
    results.bookings = { count: 1, error: null };
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Write Review/ }));
    expect(screen.getByPlaceholderText("Share your experience with this guide...")).toBeInTheDocument();
    expect(screen.queryByText(NEEDS_TRIP)).not.toBeInTheDocument();

    const bookingCalls = queries.filter((q) => q.table === "bookings").flatMap((q) => q.calls);
    expect(bookingCalls).toContainEqual({ method: "eq", args: ["traveler_id", "t1"] });
    expect(bookingCalls).toContainEqual({ method: "eq", args: ["guide_id", "g1"] });
    expect(bookingCalls).toContainEqual({ method: "eq", args: ["status", "completed"] });
  });

  it("explains why a traveller without a completed trip cannot review", async () => {
    asTraveler();
    renderPage();

    expect(await screen.findByText(NEEDS_TRIP)).toBeInTheDocument();
    expect(writeReviewButton()).not.toBeInTheDocument();
  });

  it("tells a traveller who already reviewed the guide, and keeps the rating breakdown", async () => {
    asTraveler();
    results.bookings = { count: 1, error: null };
    results.reviews = { data: [reviewBy("t1", "Asha", 4), reviewBy("t2", "Meera", 5)], error: null };
    renderPage();

    expect(await screen.findByText(ALREADY_REVIEWED)).toBeInTheDocument();
    expect(writeReviewButton()).not.toBeInTheDocument();
    for (const star of [5, 4, 3, 2, 1]) {
      expect(screen.getByText(`${star}★`)).toBeInTheDocument();
    }
  });

  it("says so when eligibility could not be checked, without offering the form", async () => {
    asTraveler();
    results.bookings = { count: null, error: { message: "Failed to fetch" } };
    renderPage();

    expect(await screen.findByText(/Couldn't check whether you can review this guide/)).toBeInTheDocument();
    expect(writeReviewButton()).not.toBeInTheDocument();
  });

  it("shows neither the form nor a note to guides and signed-out visitors", async () => {
    for (const auth of [
      { user: { id: "g2", role: "guide" }, isGuide: true, isTraveler: false },
      { user: null, isGuide: false, isTraveler: false },
    ]) {
      queries.length = 0;
      mockUseAuth.mockReturnValue(auth);
      const { unmount } = renderPage();

      expect(await screen.findByText("Review from Meera")).toBeInTheDocument();
      expect(writeReviewButton()).not.toBeInTheDocument();
      expect(screen.queryByText(NEEDS_TRIP)).not.toBeInTheDocument();
      expect(queries.some((q) => q.table === "bookings")).toBe(false);
      unmount();
    }
  });
});
