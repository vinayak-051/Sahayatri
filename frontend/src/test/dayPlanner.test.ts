import { describe, expect, it } from "vitest";
import { formatKm, googleMapsDirectionsUrl, groupByCity, haversineKm, OTHER_PLACES, planDayRoute } from "@/lib/dayPlanner";

describe("haversineKm", () => {
  it("matches the known straight-line distance between Jaipur and Delhi", () => {
    const km = haversineKm({ lat: 26.9124, lng: 75.7873 }, { lat: 28.6139, lng: 77.209 });
    expect(km).toBeGreaterThan(230);
    expect(km).toBeLessThan(242);
  });

  it("is zero for the same point", () => {
    expect(haversineKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
  });
});

describe("planDayRoute", () => {
  const along = (id: string, lng: number) => ({ id, lat: 26.9, lng });

  it("visits stops on a line in order from the start", () => {
    const stops = [along("a", 75.0), along("d", 75.3), along("b", 75.1), along("c", 75.2)];
    const plan = planDayRoute(stops, "a");
    expect(plan.stops.map((s) => s.id)).toEqual(["a", "b", "c", "d"]);
    expect(plan.legsKm).toHaveLength(3);
    expect(plan.totalKm).toBeCloseTo(plan.legsKm.reduce((a, b) => a + b, 0));
  });

  it("never does worse than the order the stops were saved in", () => {
    const stops = [
      { id: "1", lat: 26.98, lng: 75.85 },
      { id: "2", lat: 26.92, lng: 75.82 },
      { id: "3", lat: 26.99, lng: 75.86 },
      { id: "4", lat: 26.91, lng: 75.81 },
      { id: "5", lat: 26.95, lng: 75.84 },
    ];
    const saved = stops.slice(1).reduce((sum, s, i) => sum + haversineKm(stops[i], s), 0);
    const plan = planDayRoute(stops, "1");
    expect(plan.stops[0].id).toBe("1");
    expect(new Set(plan.stops.map((s) => s.id)).size).toBe(5);
    expect(plan.totalKm).toBeLessThanOrEqual(saved + 1e-9);
  });

  it("handles empty and single-stop days", () => {
    expect(planDayRoute([])).toEqual({ stops: [], legsKm: [], totalKm: 0 });
    expect(planDayRoute([along("a", 75)]).totalKm).toBe(0);
  });
});

describe("googleMapsDirectionsUrl", () => {
  it("puts the first and last stops as origin and destination and the rest as waypoints", () => {
    const url = new URL(googleMapsDirectionsUrl([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { lat: 5, lng: 6 }])!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("1,2");
    expect(url.searchParams.get("destination")).toBe("5,6");
    expect(url.searchParams.get("waypoints")).toBe("3,4");
  });

  it("needs at least two stops", () => {
    expect(googleMapsDirectionsUrl([{ lat: 1, lng: 2 }])).toBeNull();
  });
});

describe("groupByCity", () => {
  it("groups by city, biggest first, with places lacking a city last", () => {
    const groups = groupByCity(
      [{ c: "Jaipur" }, { c: "Kochi" }, { c: "Jaipur" }, { c: null }, { c: "Agra" }],
      (x) => x.c,
    );
    expect(groups.map((g) => [g.city, g.items.length])).toEqual([
      ["Jaipur", 2],
      ["Agra", 1],
      ["Kochi", 1],
      [OTHER_PLACES, 1],
    ]);
  });
});

describe("formatKm", () => {
  it("uses metres under a kilometre", () => {
    expect(formatKm(0.42)).toBe("420 m");
    expect(formatKm(3.456)).toBe("3.5 km");
    expect(formatKm(23.4)).toBe("23 km");
  });
});
