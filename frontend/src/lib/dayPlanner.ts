// Plans a day around a set of saved spots: groups them by city and orders the
// stops so the distance between them is short. Greedy nearest neighbour from
// the starting stop, then 2-opt to undo crossings. Distances are straight-line
// (great-circle), so the UI labels them as approximate.
export interface Point {
  lat: number;
  lng: number;
}

export interface Stop extends Point {
  id: string;
}

export interface PlannedRoute<T extends Stop> {
  stops: T[];
  /** Distance from each stop to the next, in km (length = stops.length - 1). */
  legsKm: number[];
  totalKm: number;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineKm(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function planDayRoute<T extends Stop>(stops: T[], startId?: string): PlannedRoute<T> {
  if (stops.length <= 1) return { stops: [...stops], legsKm: [], totalKm: 0 };

  const remaining = [...stops];
  const startIndex = startId ? Math.max(0, remaining.findIndex((s) => s.id === startId)) : 0;
  const route: T[] = [remaining.splice(startIndex, 1)[0]];

  while (remaining.length > 0) {
    const last = route[route.length - 1];
    let nearest = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (haversineKm(last, remaining[i]) < haversineKm(last, remaining[nearest])) nearest = i;
    }
    route.push(remaining.splice(nearest, 1)[0]);
  }

  // 2-opt on an open path with a fixed start: reverse route[i..k] while it helps.
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const next = route[k + 1];
        const before = haversineKm(route[i - 1], route[i]) + (next ? haversineKm(route[k], next) : 0);
        const after = haversineKm(route[i - 1], route[k]) + (next ? haversineKm(route[i], next) : 0);
        if (after + 1e-9 < before) {
          route.splice(i, k - i + 1, ...route.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }

  const legsKm = route.slice(1).map((stop, i) => haversineKm(route[i], stop));
  return { stops: route, legsKm, totalKm: legsKm.reduce((sum, km) => sum + km, 0) };
}

// Google Maps accepts up to 9 waypoints between origin and destination in a URL.
const MAX_STOPS_IN_LINK = 11;

export function googleMapsDirectionsUrl(stops: Point[]): string | null {
  const route = stops.slice(0, MAX_STOPS_IN_LINK);
  if (route.length < 2) return null;
  const format = (p: Point) => `${p.lat},${p.lng}`;
  const params = new URLSearchParams({
    api: "1",
    origin: format(route[0]),
    destination: format(route[route.length - 1]),
    travelmode: "driving",
  });
  const waypoints = route.slice(1, -1);
  if (waypoints.length > 0) params.set("waypoints", waypoints.map(format).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export interface CityGroup<T> {
  city: string;
  items: T[];
}

export const OTHER_PLACES = "Other places";

/** Groups items by city, largest group first, then alphabetically; items without a city go last. */
export function groupByCity<T>(items: T[], cityOf: (item: T) => string | null | undefined): CityGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const city = cityOf(item)?.trim() || OTHER_PLACES;
    groups.set(city, [...(groups.get(city) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([city, grouped]) => ({ city, items: grouped }))
    .sort((a, b) => {
      if (a.city === OTHER_PLACES) return 1;
      if (b.city === OTHER_PLACES) return -1;
      return b.items.length - a.items.length || a.city.localeCompare(b.city);
    });
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
