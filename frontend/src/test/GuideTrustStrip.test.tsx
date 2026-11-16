import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GuideDetail from "@/pages/GuideDetail";
import { mockQuery } from "./supabaseMock";

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const results: Record<string, unknown> = {};
const mockRpc = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: (table: string) => mockQuery(results[table]),
    rpc: (...args: unknown[]) => mockRpc(...args),
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/guides/g1"]}>
      <Routes>
        <Route path="/guides/:id" element={<GuideDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockRpc.mockReset();
  results.profiles = { data: guide, error: null };
  results.reviews = { data: [], error: null };
  results.bookings = { count: 0, error: null };
  mockUseAuth.mockReturnValue({ user: { id: "t1", role: "traveler" }, isGuide: false, isTraveler: true });
});

describe("GuideDetail trust strip", () => {
  it("shows completed trips, response rate, response time and member since", async () => {
    mockRpc.mockResolvedValue({
      data: {
        completed_trips: 23, travellers_served: 19, response_rate: 0.92, median_response_hours: 5.5,
        member_since: "2025-01-15T00:00:00Z", reviews_count: 8, avg_rating: 4.6,
      },
      error: null,
    });
    renderPage();

    const strip = await screen.findByLabelText("Guide track record");
    expect(mockRpc).toHaveBeenCalledWith("guide_public_stats", { p_guide_id: "g1" });
    expect(within(strip).getByText("23")).toBeInTheDocument();
    expect(within(strip).getByText("Completed trips")).toBeInTheDocument();
    expect(within(strip).getByText("92%")).toBeInTheDocument();
    expect(within(strip).getByText("within 6 hours")).toBeInTheDocument();
    expect(within(strip).getByText("Member since")).toBeInTheDocument();
  });

  it("hides items that have no data", async () => {
    mockRpc.mockResolvedValue({
      data: {
        completed_trips: 0, travellers_served: 0, response_rate: null, median_response_hours: null,
        member_since: "2026-11-01T00:00:00Z", reviews_count: 0, avg_rating: null,
      },
      error: null,
    });
    renderPage();

    const strip = await screen.findByLabelText("Guide track record");
    expect(within(strip).queryByText("Response rate")).not.toBeInTheDocument();
    expect(within(strip).queryByText("Typically responds")).not.toBeInTheDocument();
    expect(within(strip).getByText("Member since")).toBeInTheDocument();
  });

  it("shows nothing when the stats cannot be loaded", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    renderPage();

    expect(await screen.findByText("Ravi")).toBeInTheDocument();
    await vi.waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(screen.queryByLabelText("Guide track record")).not.toBeInTheDocument();
  });

  it("does not ask for stats when signed out", async () => {
    mockUseAuth.mockReturnValue({ user: null, isGuide: false, isTraveler: false });
    renderPage();

    expect(await screen.findByText("Ravi")).toBeInTheDocument();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Guide track record")).not.toBeInTheDocument();
  });
});
