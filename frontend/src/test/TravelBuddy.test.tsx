import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

type DbResult = { data: unknown; error: { code?: string; message: string } | null };
interface Call {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: [string, string, unknown][];
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  calls: [] as Call[],
  respond: (() => ({ data: null, error: null })) as (call: Call) => DbResult | Promise<DbResult>,
}));

// A chainable stand-in for the supabase-js query builder; resolves through mocks.respond.
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, action: "select", filters: [] };
      mocks.calls.push(call);
      const chain = {
        select: () => chain,
        insert: (payload: unknown) => ((call.action = "insert"), (call.payload = payload), chain),
        update: (payload: unknown) => ((call.action = "update"), (call.payload = payload), chain),
        delete: () => ((call.action = "delete"), chain),
        eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), chain),
        in: (column: string, value: unknown) => (call.filters.push(["in", column, value]), chain),
        gte: (column: string, value: unknown) => (call.filters.push(["gte", column, value]), chain),
        order: () => chain,
        single: () => chain,
        then: (resolve: (r: DbResult) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => mocks.respond(call))
            .then(resolve, reject),
      };
      return chain;
    },
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-me", name: "Meera" } }),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

import TravelBuddy from "@/pages/TravelBuddy";

const trip = (id: string, userId: string, name: string, destination: string) => ({
  id,
  user_id: userId,
  destination,
  start_date: "2030-01-10",
  end_date: "2030-01-15",
  budget: null,
  description: null,
  created_at: "2026-11-01T00:00:00Z",
  user: { id: userId, name, profile_photo_url: null },
});

const TRIPS = [
  trip("t-mine", "u-me", "Meera", "Leh"),
  trip("t-asha", "u-asha", "Asha", "Goa"),
  trip("t-ravi", "u-ravi", "Ravi", "Hampi"),
  trip("t-kabir", "u-kabir", "Kabir", "Ooty"),
];

const MY_REQUESTS = [
  { id: "mr-1", trip_id: "t-asha", status: "pending" },
  { id: "mr-2", trip_id: "t-ravi", status: "rejected" },
];

const REQUESTS_ON_MY_TRIP = [
  { id: "r-bob", trip_id: "t-mine", traveler_id: "u-bob", status: "pending", traveler: { id: "u-bob", name: "Bob" } },
  { id: "r-dev", trip_id: "t-mine", traveler_id: "u-dev", status: "accepted", traveler: { id: "u-dev", name: "Dev" } },
];

const ok = (data: unknown): DbResult => ({ data, error: null });

function defaultRespond(call: Call): DbResult | Promise<DbResult> {
  if (call.table === "buddy_trips" && call.action === "select") return ok(TRIPS);
  if (call.table === "buddy_requests" && call.action === "select") {
    return call.filters.some(([, column]) => column === "traveler_id") ? ok(MY_REQUESTS) : ok(REQUESTS_ON_MY_TRIP);
  }
  if (call.action === "update") return ok([{ id: "updated" }]);
  return ok(null);
}

const card = (destination: string) => {
  const el = screen.getByText(destination).closest(".glass");
  if (!(el instanceof HTMLElement)) throw new Error(`No card for ${destination}`);
  return within(el);
};

const renderPage = async () => {
  render(
    <MemoryRouter>
      <TravelBuddy />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.queryByRole("status", { name: "Loading trips" })).not.toBeInTheDocument());
};

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.respond = defaultRespond;
  vi.clearAllMocks();
});

describe("TravelBuddy", () => {
  it("lists trips that haven't ended without deleting anything", async () => {
    await renderPage();
    expect(screen.getByText("Goa")).toBeInTheDocument();
    const tripsQuery = mocks.calls.find((c) => c.table === "buddy_trips");
    expect(tripsQuery?.filters.some(([op, column]) => op === "gte" && column === "end_date")).toBe(true);
    expect(mocks.calls.some((c) => c.action === "delete")).toBe(false);
  });

  it("shows my request state on each trip and hides Join on my own trip", async () => {
    await renderPage();
    expect(card("Goa").getByText("Requested")).toBeInTheDocument();
    expect(card("Hampi").getByText("Declined")).toBeInTheDocument();
    expect(card("Ooty").getByRole("button", { name: "Request to Join" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Request to Join" })).toHaveLength(1);

    const mine = card("Leh");
    expect(mine.getByText("My Trip")).toBeInTheDocument();
    expect(mine.queryByRole("button", { name: "Request to Join" })).not.toBeInTheDocument();
    expect(mine.queryByRole("button", { name: "Message Meera" })).not.toBeInTheDocument();
  });

  it("shows the owner pending requests by name and accepted buddies", async () => {
    await renderPage();
    const mine = card("Leh");
    expect(mine.getByRole("button", { name: "Accept Bob" })).toBeInTheDocument();
    expect(mine.getByRole("button", { name: "Decline Bob" })).toBeInTheDocument();
    expect(mine.getByText("Dev")).toBeInTheDocument();
    expect(mine.queryByRole("button", { name: "Accept Dev" })).not.toBeInTheDocument();
  });

  it("accepts optimistically and rolls back when the database refuses", async () => {
    let finish: (r: DbResult) => void = () => {};
    mocks.respond = (call) =>
      call.action === "update" ? new Promise<DbResult>((resolve) => (finish = resolve)) : defaultRespond(call);
    await renderPage();

    fireEvent.click(card("Leh").getByRole("button", { name: "Accept Bob" }));
    await waitFor(() => expect(card("Leh").queryByRole("button", { name: "Accept Bob" })).not.toBeInTheDocument());
    const update = mocks.calls.find((c) => c.action === "update");
    expect(update?.payload).toEqual({ status: "accepted" });

    finish({ data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "buddy_requests"' } });
    await waitFor(() => expect(card("Leh").getByRole("button", { name: "Accept Bob" })).toBeInTheDocument());
    expect(mocks.toastError).toHaveBeenCalledWith("You don't have permission to do that.");
  });

  it("removes a declined request once the database confirms it", async () => {
    await renderPage();
    fireEvent.click(card("Leh").getByRole("button", { name: "Decline Bob" }));
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Declined Bob's request"));
    expect(card("Leh").queryByText("Bob")).not.toBeInTheDocument();
  });

  it("opens a chat with the trip owner or a requester", async () => {
    await renderPage();
    fireEvent.click(card("Goa").getByRole("button", { name: "Message Asha" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/messages?userId=u-asha&userName=Asha");
    fireEvent.click(card("Leh").getByRole("button", { name: "Message Bob" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/messages?userId=u-bob&userName=Bob");
  });

  it("sends a join request with only the allowed columns and shows it as requested", async () => {
    mocks.respond = (call) =>
      call.action === "insert" ? ok({ id: "mr-new", trip_id: "t-kabir", status: "pending" }) : defaultRespond(call);
    await renderPage();

    fireEvent.click(card("Ooty").getByRole("button", { name: "Request to Join" }));
    await waitFor(() => expect(card("Ooty").getByText("Requested")).toBeInTheDocument());
    const insert = mocks.calls.find((c) => c.action === "insert");
    expect(insert?.table).toBe("buddy_requests");
    expect(insert?.payload).toEqual({ trip_id: "t-kabir", traveler_id: "u-me" });
  });

  it("shows an error state with a retry", async () => {
    let failing = true;
    mocks.respond = (call) =>
      failing && call.table === "buddy_trips" ? { data: null, error: { message: "TypeError: Failed to fetch" } } : defaultRespond(call);
    await renderPage();

    expect(screen.getByText("Couldn't load trips")).toBeInTheDocument();
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Goa")).toBeInTheDocument());
  });

  it("shows an empty state when there are no upcoming trips", async () => {
    mocks.respond = (call) => (call.table === "buddy_trips" ? ok([]) : defaultRespond(call));
    await renderPage();
    expect(screen.getByText("No upcoming trips yet")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting a trip", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Delete trip to Leh" }));
    expect(mocks.calls.some((c) => c.action === "delete")).toBe(false);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete your trip to Leh?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete trip" }));

    await waitFor(() => expect(screen.queryByText("Leh")).not.toBeInTheDocument());
    const del = mocks.calls.find((c) => c.action === "delete");
    expect(del?.table).toBe("buddy_trips");
    expect(del?.filters).toContainEqual(["eq", "id", "t-mine"]);
  });

  it("validates the trip form inline and posts only the allowed columns", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Create a Trip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Post Trip" }));

    expect(screen.getByText("Tell others where you're going.")).toBeInTheDocument();
    expect(screen.getByText("Pick a start date.")).toBeInTheDocument();
    expect(screen.getByLabelText("Where are you going?")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.calls.some((c) => c.action === "insert")).toBe(false);

    fireEvent.change(screen.getByLabelText("Where are you going?"), { target: { value: "  Spiti  " } });
    fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2030-02-01" } });
    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2030-01-30" } });
    expect(screen.getByText("The end date must be on or after the start date.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2030-02-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Post Trip" }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    const insert = mocks.calls.find((c) => c.action === "insert");
    expect(insert?.table).toBe("buddy_trips");
    expect(insert?.payload).toEqual({
      user_id: "u-me",
      destination: "Spiti",
      start_date: "2030-02-01",
      end_date: "2030-02-05",
      budget: null,
      description: null,
    });
  });
});
