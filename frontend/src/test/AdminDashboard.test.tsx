import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminDashboard from "@/pages/AdminDashboard";
import { mockQuery, type QueryCall } from "./supabaseMock";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1", is_admin: true }, isLoading: false, logout: vi.fn() }),
}));

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

const queries: { table: string; calls: QueryCall[] }[] = [];
const results: Record<string, unknown> = {};
const rpcResults: Record<string, unknown> = {};
const mockRpc = vi.fn((...call: [name: string, args?: unknown]) => Promise.resolve(rpcResults[call[0]]));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
    from: (table: string) => {
      const calls: QueryCall[] = [];
      queries.push({ table, calls });
      return mockQuery(results[table], calls);
    },
  },
}));

const statsPayload = {
  travelers: 12,
  guides: 5,
  verified_guides: 3,
  bookings: { total: 28, pending: 6, accepted: 4, confirmed: 7, completed: 8, declined: 2, cancelled: 1 },
  buddy_trips: 9,
  open_reports: 11,
  pending_verifications: 13,
  gross_booking_value: 950,
  commission_revenue: 700,
  cancellation_fees: 200,
  platform_revenue: 900,
  outstanding_guide_balances: 640,
};

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
  rating: 1,
  comment: "Buy my tours instead",
  created_at: "2026-11-05T10:00:00Z",
  reviewer: { name: "Meera" },
  location: { title: "Hawa Mahal" },
};

const callsFor = (table: string) => queries.filter((q) => q.table === table).flatMap((q) => q.calls);
const fetchCount = (table: string) => queries.filter((q) => q.table === table).length;

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>,
  );
}

async function openReviewsTab() {
  renderDashboard();
  await screen.findByText("Platform revenue");
  fireEvent.click(screen.getByRole("button", { name: "Reviews" }));
}

beforeEach(() => {
  queries.length = 0;
  mockRpc.mockClear();
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  rpcResults.admin_overview_stats = { data: statsPayload, error: null };
  rpcResults.admin_delete_review = { data: null, error: null };
  results.reviews = { data: [guideRow], error: null };
  results.location_reviews = { data: [spotRow], error: null };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminDashboard overview", () => {
  it("shows database-computed totals and labels revenue correctly, without downloading tables", async () => {
    renderDashboard();

    expect(await screen.findByText("Platform revenue")).toBeInTheDocument();
    expect(screen.getByText("₹900")).toBeInTheDocument();
    expect(screen.getByText("₹700 commission + ₹200 cancellation fees")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /₹950.*Gross booking value \(completed trips\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /₹640.*Owed to guides/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /7.*Confirmed \(advance paid\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /11.*Open Reports/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /13.*Pending Verifications/ })).toBeInTheDocument();
    expect(screen.queryByText(/Total Revenue/)).not.toBeInTheDocument();

    expect(mockRpc).toHaveBeenCalledWith("admin_overview_stats", undefined);
    expect(queries).toHaveLength(0);
  });

  it("shows an error with a retry when the totals cannot be loaded", async () => {
    rpcResults.admin_overview_stats = { data: null, error: { code: "42501", message: "Unauthorized" } };
    renderDashboard();

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
    rpcResults.admin_overview_stats = { data: statsPayload, error: null };
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Platform revenue")).toBeInTheDocument();
  });
});

describe("AdminDashboard reviews tab", () => {
  it("lists guide and spot reviews with rating, comment, author, target and date", async () => {
    await openReviewsTab();

    expect(await screen.findByText("Buy my tours instead")).toBeInTheDocument();
    expect(screen.getByText("Hawa Mahal")).toBeInTheDocument();
    expect(screen.getByText(/By Meera •/)).toBeInTheDocument();
    expect(screen.getByLabelText("1 out of 5 stars")).toBeInTheDocument();
    expect(screen.getByText("Knew every lane in the old city")).toBeInTheDocument();
    expect(screen.getByText("Ravi")).toBeInTheDocument();
    expect(screen.getByText(/By Asha •/)).toBeInTheDocument();
    expect(screen.getByLabelText("5 out of 5 stars")).toBeInTheDocument();
  });

  it("filters by kind and by low ratings", async () => {
    await openReviewsTab();
    await screen.findByText("Buy my tours instead");

    queries.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Spots" }));
    await waitFor(() => expect(screen.queryByText("Knew every lane in the old city")).not.toBeInTheDocument());
    expect(screen.getByText("Buy my tours instead")).toBeInTheDocument();
    expect(fetchCount("reviews")).toBe(0);

    queries.length = 0;
    fireEvent.click(screen.getByRole("button", { name: /Low ratings/ }));
    await waitFor(() => expect(callsFor("location_reviews")).toContainEqual({ method: "lte", args: ["rating", 2] }));
  });

  it("deletes a review with a reason through admin_delete_review and refreshes the list", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("  Self-promotion  ");
    await openReviewsTab();
    const deleteButton = await screen.findByRole("button", { name: "Delete review by Meera" });

    results.location_reviews = { data: [], error: null };
    fireEvent.click(deleteButton);

    await waitFor(() => expect(screen.queryByText("Buy my tours instead")).not.toBeInTheDocument());
    expect(mockRpc).toHaveBeenCalledWith("admin_delete_review", {
      p_kind: "spot",
      p_review_id: "s1",
      p_reason: "Self-promotion",
    });
    expect(mockToast.success).toHaveBeenCalledWith("Review removed");
    expect(screen.getByText("Knew every lane in the old city")).toBeInTheDocument();
  });

  it("does not delete when the prompt is cancelled or the reason is empty", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    await openReviewsTab();
    const deleteButton = await screen.findByRole("button", { name: "Delete review by Asha" });

    fireEvent.click(deleteButton);
    prompt.mockReturnValue("   ");
    fireEvent.click(deleteButton);

    expect(mockRpc).not.toHaveBeenCalledWith("admin_delete_review", expect.anything());
    expect(mockToast.error).toHaveBeenCalledWith("Add a reason to remove the review.");
    expect(screen.getByText("Knew every lane in the old city")).toBeInTheDocument();
  });

  it("shows the database's message when a delete is refused and keeps the review", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Spam");
    rpcResults.admin_delete_review = {
      data: null,
      error: { code: "P0001", message: "Review not found. It may already have been removed." },
    };
    await openReviewsTab();

    fireEvent.click(await screen.findByRole("button", { name: "Delete review by Meera" }));

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("Review not found. It may already have been removed."),
    );
    expect(screen.getByText("Buy my tours instead")).toBeInTheDocument();
  });

  it("shows empty and error states", async () => {
    results.reviews = { data: [], error: null };
    results.location_reviews = { data: [], error: null };
    await openReviewsTab();
    expect(await screen.findByText("No reviews yet")).toBeInTheDocument();

    results.reviews = { data: null, error: { code: "PGRST301", message: "JWT expired" } };
    // The page-level "Guides" tab has no pressed state; this is the review-kind filter.
    fireEvent.click(screen.getByRole("button", { name: "Guides", pressed: false }));
    expect(await screen.findByText("Couldn't load reviews.")).toBeInTheDocument();

    results.reviews = { data: [guideRow], error: null };
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Knew every lane in the old city")).toBeInTheDocument();
  });
});
