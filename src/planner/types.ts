/**
 * The `TripPlanner` contract. A `LocalPlanner` (Web Worker + packed GTFS) and a
 * future `RemotePlanner` (HTTP) are drop-in swappable behind it.
 *
 * Load-bearing rules for that swappability:
 *  - every datetime is an ISO 8601 string WITH offset, in Atlantic/Madeira —
 *    never a `Date`, so the JSON boundary of a remote planner is byte-identical
 *    and everything is structured-clone-safe across `postMessage`;
 *  - `deriveFlags` (edge-state logic) is a shared pure module, not inlined into
 *    either implementation;
 *  - no typed arrays or worker handles cross this interface — only plain
 *    result objects.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export type PlaceRef =
  | { kind: "stop"; stopId: string }
  | { kind: "coord"; at: LatLon; label?: string };

export interface PlanQuery {
  from: PlaceRef;
  to: PlaceRef;
  /** ISO 8601 with offset. Omitted => "now". */
  departAt?: string;
  /** default 4 */
  maxItineraries?: number;
  /** metres; default 1000. Used for `coord` endpoints incl. current location. */
  maxWalkMeters?: number;
  /** affects generated summary/note strings only; default "en" */
  locale?: "en" | "pt";
  signal?: AbortSignal;
}

export type PlanOutcome =
  | "ok"
  | "no_route" // stops exist but no path connects them
  | "origin_unreachable" // no stop within walking distance of `from`
  | "destination_unreachable"
  | "no_service_in_horizon"; // a path exists but no active service from here to feed_end_date

export interface Stop {
  stopId: string;
  /** verbatim operator name — what's on the sign */
  name: string;
  /** readable form, where an OSM street corroborated it (src/lib/stopNames.ts) */
  displayName?: string;
  /** set when this is another pole of a stop listed under `groupId` */
  groupId?: string;
  /** reverse-geocoded town/parish, for disambiguation */
  town?: string;
  /** HF rider-facing stop_code only */
  code?: string;
  at: LatLon;
}

export interface StopPoint {
  stopId: string;
  name: string;
  displayName?: string;
  town?: string;
  at: LatLon;
}

export interface StopTime {
  stop: StopPoint;
  /** equals `departAt` at pass-through stops */
  arriveAt: string;
  departAt: string;
  note?: string;
}

export interface RouteRef {
  routeId: string;
  shortName: string;
  longName: string;
  operator: OperatorId;
  operatorName: string;
  /** "#RRGGBB" — mostly HF */
  color?: string;
  /** contrast colour; computed at build time when the feed omits it */
  textColor?: string;
}

export type OperatorId = "HF" | "RODOESTE" | "CAM" | "AEROBUS";

interface LegBase {
  from: StopPoint;
  to: StopPoint;
  departAt: string;
  arriveAt: string;
  distanceMeters: number;
}

export interface WalkLeg extends LegBase {
  mode: "walk";
  /** localized, e.g. "6 min walk" */
  summary: string;
}

export interface TransitLeg extends LegBase {
  mode: "transit";
  route: RouteRef;
  headsign: string;
  /** ordered, includes board & alight */
  stops: StopTime[];
  /** localized, e.g. "change to HF 6" */
  boardNote?: string;
  isLastTripToday: boolean;
}

export type Leg = WalkLeg | TransitLeg;

export interface Itinerary {
  departAt: string;
  arriveAt: string;
  durationSeconds: number;
  /** transit → transit changes */
  transferCount: number;
  walkingSeconds: number;
  walkingMeters: number;
  isLastTripToday: boolean;
  legs: Leg[];
  /** stable hash of (route, board, alight)* — dedupe + React keys */
  signature: string;
}

export interface NextDeparture {
  departAt: string;
  itinerary: Itinerary;
}

export interface PlanFlags {
  dateAdjustedFromPast: boolean;
  beyondPublishedHorizon: boolean;
  /** the feed doesn't start until later — search was clamped to its first day */
  beforePublishedHorizon?: boolean;
  noMoreServiceToday: boolean;
}

export interface PlanResult {
  /** same local calendar day as the effective departure; sorted by departAt */
  itineraries: Itinerary[];
  flags: PlanFlags;
  /** present iff `flags.dateAdjustedFromPast` — the instant actually searched from */
  adjustedTo?: string;
  /** always present — feed_end_date, "YYYY-MM-DD" */
  horizonEndDate: string;
  /** always present — feed_start_date, "YYYY-MM-DD" */
  horizonStartDate: string;
  /** present iff `flags.noMoreServiceToday` and service resumes within the horizon */
  nextDeparture?: NextDeparture | null;
  outcome: PlanOutcome;
  /** nearest stop + distance, for the *_unreachable outcomes */
  nearestStop?: { stop: Stop; meters: number };
  query: { from: PlaceRef; to: PlaceRef; effectiveDepartAt: string };
  feedVersion: string;
}

export interface NearbyStop {
  stop: Stop;
  meters: number;
  walkSeconds: number;
}

export interface TripPlanner {
  /** load the worker + timetable, or warm the HTTP client */
  ready(): Promise<void>;
  plan(query: PlanQuery): Promise<PlanResult>;
  /** autocomplete + map markers */
  listStops(): Promise<Stop[]>;
  /** nearest stops to a coord, walking-distance ordered */
  nearbyStops(at: LatLon, maxMeters?: number): Promise<NearbyStop[]>;
  readonly feedVersion: string;
  /** "YYYY-MM-DD" */
  readonly horizonEndDate: string;
  /** "YYYY-MM-DD" */
  readonly horizonStartDate: string;
}
