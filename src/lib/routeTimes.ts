/**
 * Per-stop schedule table for a route's Browse "Times" view — `route-times.json`
 * (routeId -> stop list + trip times), built alongside `browse.json` by
 * scripts/build-data.ts. Scoped to the same representative pattern/direction
 * the "Stops" view already shows, so the two line up; not every route has an
 * entry (routes with fewer than 2 stops in their representative pattern are
 * skipped, same as browse.json).
 */
const BASE = import.meta.env.BASE_URL || "/";

export interface RouteTimesTrip {
  weekend: boolean;
  /** one time per row in `stops`, HH:MM (wrapped past midnight); null where this trip skips that stop */
  times: (string | null)[];
}

export interface RouteTimesEntry {
  stops: { stopId: string; name: string }[];
  trips: RouteTimesTrip[];
}

let bundle: Promise<Record<string, RouteTimesEntry>> | null = null;

function load() {
  bundle ??= fetch(`${BASE}data/route-times.json`).then(
    (r) => r.json() as Promise<Record<string, RouteTimesEntry>>,
  );
  return bundle;
}

export async function routeTimes(routeId: string): Promise<RouteTimesEntry | null> {
  const all = await load();
  return all[routeId] ?? null;
}
