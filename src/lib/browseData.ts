/**
 * The Browse tab's route catalogue — `public/data/browse.json`, produced by
 * `scripts/build-data.ts`. This is UI-only reference data (route shape, service
 * hours, region grouping); it deliberately stays off the `TripPlanner`
 * interface, which is about planning a specific trip.
 */
import { useEffect, useState } from "react";
import type { OperatorId } from "../planner/types.ts";
import { looseIncludes } from "./text.ts";

export interface BrowseStop {
  name: string;
  lat: number;
  lon: number;
}

export interface ServiceWindow {
  first: string;
  last: string;
  /** typical headway; null when the route runs too few times a day to have one */
  frequencyMin: number | null;
}

export interface BrowseRoute {
  routeId: string;
  shortName: string;
  operator: OperatorId;
  operatorName: string;
  /** short place labels, e.g. "Funchal" / "Porto Moniz" */
  origin: string;
  destination: string;
  /** ordered stop list of the route's fullest pattern */
  stops: BrowseStop[];
  weekday: ServiceWindow | null;
  weekend: ServiceWindow | null;
}

export interface BrowseRegion {
  id: string;
  name: string;
  routeIds: string[];
}

export interface BrowseData {
  regions: BrowseRegion[];
  interregionalRouteIds: string[];
  routes: Record<string, BrowseRoute>;
  operators: { code: string; name: string }[];
}

const BASE = import.meta.env.BASE_URL || "/";
let cache: Promise<BrowseData> | null = null;

export function loadBrowseData(): Promise<BrowseData> {
  cache ??= fetch(`${BASE}data/browse.json`).then((r) => {
    if (!r.ok) throw new Error(`browse.json ${r.status}`);
    return r.json() as Promise<BrowseData>;
  });
  return cache;
}

export function useBrowseData(): { data: BrowseData | null; error: string | null } {
  const [data, setData] = useState<BrowseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadBrowseData().then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { data, error };
}

/**
 * "06:15–21:40", or "10:00 only" when the sampled day has exactly one
 * departure — a handful of long rural routes (e.g. Rodoeste 380, Funchal to
 * Porto Moniz) genuinely run once a day. `first === last` only happens for a
 * single trip (two distinct departures are always at least a minute apart),
 * so it's an unambiguous signal, not a guess.
 */
function spanLabel(w: ServiceWindow): string {
  return w.first === w.last ? `${w.first} only` : `${w.first}–${w.last}`;
}

/** "Every ~20 min · 06:15–21:40" (or just the span when there's no headway). */
export function frequencyLabel(w: ServiceWindow): string {
  const span = spanLabel(w);
  return w.frequencyMin ? `Every ~${w.frequencyMin} min · ${span}` : span;
}

/** "06:15–21:40 · every ~20 min" — the Route Detail service-hours row. */
export function serviceHoursLabel(w: ServiceWindow): string {
  const span = spanLabel(w);
  return w.frequencyMin ? `${span} · every ~${w.frequencyMin} min` : span;
}

/** A route's best one-line frequency summary (weekday preferred). */
export function routeSummaryLabel(r: BrowseRoute): string {
  const w = r.weekday ?? r.weekend;
  return w ? frequencyLabel(w) : "Timetable varies";
}

/**
 * Browse filter: matches a route on line number, operator, origin/destination,
 * and any intermediate stop name — case- and accent-insensitive substrings.
 */
export function routeMatches(r: BrowseRoute, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (
    looseIncludes(r.shortName, q) ||
    looseIncludes(r.operator, q) ||
    looseIncludes(r.operatorName, q) ||
    looseIncludes(r.origin, q) ||
    looseIncludes(r.destination, q)
  ) {
    return true;
  }
  return r.stops.some((s) => looseIncludes(s.name, q));
}
