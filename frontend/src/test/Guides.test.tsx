import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Guides from "@/pages/Guides";
import { mockQuery, type QueryCall } from "./supabaseMock";

const calls: QueryCall[] = [];

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: () =>
      mockQuery(
        {
          data: [{ id: "g1", name: "Asha", city: "Jaipur", rating: 4.5, languages: ["Hindi"], rate_per_day: 1500, is_verified: true }],
          error: null,
        },
        calls,
      ),
  },
}));

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Guides />
    </MemoryRouter>,
  );

const ilikeCalls = () => calls.filter((c) => c.method === "ilike").map((c) => c.args);

describe("Guides", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("filters by city, not by name, for ?city=", async () => {
    renderAt("/guides?city=Jaipur%2C(x)");
    expect(await screen.findByText("Asha")).toBeInTheDocument();
    expect(ilikeCalls()).toEqual([["city", "%Jaipur,(x)%"]]);
    expect(screen.getByText("Jaipur,(x)")).toBeInTheDocument();
  });

  it("searches names for ?q= and escapes LIKE wildcards", async () => {
    renderAt("/guides?q=50%25_off");
    expect(await screen.findByText("Asha")).toBeInTheDocument();
    expect(ilikeCalls()).toEqual([["name", "%50\\%\\_off%"]]);
    expect(screen.getByDisplayValue("50%_off")).toBeInTheDocument();
  });
});
