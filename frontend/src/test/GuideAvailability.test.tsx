import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

type DbResult = { data: unknown; error: { code?: string; message: string } | null };
interface Call {
  table: string;
  action: "select" | "insert" | "delete";
  payload?: unknown;
  filters: [string, string, unknown][];
}

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  calls: [] as Call[],
  respond: (() => ({ data: [], error: null })) as (call: Call) => DbResult,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, action: "select", filters: [] };
      mocks.calls.push(call);
      const chain = {
        select: () => chain,
        insert: (payload: unknown) => ((call.action = "insert"), (call.payload = payload), chain),
        delete: () => ((call.action = "delete"), chain),
        eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), chain),
        gte: (column: string, value: unknown) => (call.filters.push(["gte", column, value]), chain),
        order: () => chain,
        then: (resolve: (r: DbResult) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => mocks.respond(call))
            .then(resolve, reject),
      };
      return chain;
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("@/context/AuthContext", () => {
  const auth = { user: { id: "g1", role: "guide" } };
  return { useAuth: () => auth };
});
vi.mock("@/components/GuideBottomNav", () => ({ default: () => null }));

import GuideAvailability from "@/pages/GuideAvailability";

const renderPage = () =>
  render(
    <MemoryRouter>
      <GuideAvailability />
    </MemoryRouter>,
  );

const dayButton = (day: number) => screen.getByRole("gridcell", { name: String(day) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 16, 12, 0));
  mocks.calls.length = 0;
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GuideAvailability", () => {
  it("lists the guide's upcoming blocked dates, loaded from today onwards", async () => {
    mocks.respond = () => ({ data: [{ date: "2026-11-20", note: "Diwali trip" }], error: null });
    renderPage();
    expect(await screen.findByText("Fri, 20 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Diwali trip")).toBeInTheDocument();
    expect(dayButton(20)).toHaveAttribute("aria-selected", "true");
    expect(mocks.calls[0]).toMatchObject({
      table: "guide_unavailable_dates",
      action: "select",
      filters: [
        ["eq", "guide_id", "g1"],
        ["gte", "date", "2026-11-16"],
      ],
    });
  });

  it("shows an empty state", async () => {
    mocks.respond = () => ({ data: [], error: null });
    renderPage();
    expect(await screen.findByText(/No blocked dates/)).toBeInTheDocument();
  });

  it("blocks a day tapped in the calendar, with the note", async () => {
    mocks.respond = () => ({ data: [], error: null });
    renderPage();
    await screen.findByText(/No blocked dates/);
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: " Festival " } });
    fireEvent.click(dayButton(25));
    expect(await screen.findByText("Wed, 25 Nov 2026")).toBeInTheDocument();
    const insert = mocks.calls.find((c) => c.action === "insert");
    expect(insert?.payload).toEqual({ guide_id: "g1", date: "2026-11-25", note: "Festival" });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("25 Nov marked unavailable");
  });

  it("does not block past days", async () => {
    mocks.respond = () => ({ data: [], error: null });
    renderPage();
    await screen.findByText(/No blocked dates/);
    fireEvent.click(dayButton(10));
    expect(mocks.calls.some((c) => c.action === "insert")).toBe(false);
  });

  it("removes a blocked date from the list", async () => {
    mocks.respond = (call) =>
      call.action === "select"
        ? { data: [{ date: "2026-11-20", note: null }], error: null }
        : { data: null, error: null };
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove 20 Nov 2026" }));
    await waitFor(() => expect(screen.queryByText("Fri, 20 Nov 2026")).not.toBeInTheDocument());
    const del = mocks.calls.find((c) => c.action === "delete");
    expect(del?.filters).toEqual([
      ["eq", "guide_id", "g1"],
      ["eq", "date", "2026-11-20"],
    ]);
  });

  it("shows the database's readable error and keeps the list unchanged", async () => {
    mocks.respond = (call) =>
      call.action === "select"
        ? { data: [], error: null }
        : { data: null, error: { code: "22023", message: "You cannot block a date in the past" } };
    renderPage();
    await screen.findByText(/No blocked dates/);
    fireEvent.click(dayButton(25));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("You cannot block a date in the past"));
    expect(screen.getByText(/No blocked dates/)).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    mocks.respond = () => ({ data: null, error: { code: "42501", message: "permission denied for table guide_unavailable_dates" } });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do that.");
  });
});
