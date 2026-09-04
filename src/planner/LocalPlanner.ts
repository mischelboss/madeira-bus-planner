/**
 * Client-side `TripPlanner`: a Web Worker running CSA over the packed GTFS blob,
 * plus all the string/timezone hydration on the main thread. A future
 * `RemotePlanner` implements the same interface against an HTTP routing API.
 */
import CsaWorker from "./csa.worker.ts?worker";
import type { RawItinerary, RawLeg, RawResult, SearchRequest } from "./csa.ts";
import { adjustDeparture, deriveFlags } from "./deriveFlags.ts";
import {
  dateFromEpochDay,
  epochDayFromDate,
  isoToEpochSec,
  localDate,
  madeiraMidnightEpochSec,
  nowEpochSec,
  toMadeiraISO,
} from "./time.ts";
import type {
  Itinerary,
  LatLon,
  Leg,
  NearbyStop,
  PlaceRef,
  PlanQuery,
  PlanResult,
  RouteRef,
  Stop,
  StopPoint,
  StopTime,
  TransitLeg,
  TripPlanner,
} from "./types.ts";

const BASE = import.meta.env.BASE_URL || "/";
const WALK_MPS = 1.1;
const DETOUR = 1.3;
const MTT_SECONDS = 90;
const DEFAULT_MAX_WALK_M = 1000;
const MAX_NEARBY = 15;

interface RouteJson extends Omit<RouteRef, "operator"> {
  operator: RouteRef["operator"];
}
interface MetaJson {
  feedVersion: string;
  feedStartDate: string;
  feedEndDate: string;
}

function haversine(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const la1 = a.lat * rad;
  const la2 = b.lat * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const walkSecondsFor = (meters: number) => Math.max(60, Math.round((meters * DETOUR) / WALK_MPS));

let reqCounter = 0;

export class LocalPlanner implements TripPlanner {
  private worker!: Worker;
  private stops: Stop[] = [];
  private stopIdxById = new Map<string, number>();
  private routes: RouteJson[] = [];
  private headsigns: string[] = [];
  private meta!: MetaJson;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readyPromise?: Promise<void>;

  get feedVersion(): string {
    return this.meta?.feedVersion ?? "";
  }
  get horizonEndDate(): string {
    return this.meta?.feedEndDate ?? "";
  }
  get horizonStartDate(): string {
    return this.meta?.feedStartDate ?? "";
  }

  ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.init();
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    const [stops, routes, headsigns, meta] = await Promise.all([
      fetch(`${BASE}data/stops.json`).then((r) => r.json() as Promise<Stop[]>),
      fetch(`${BASE}data/routes.json`).then((r) => r.json() as Promise<RouteJson[]>),
      fetch(`${BASE}data/headsigns.json`).then((r) => r.json() as Promise<string[]>),
      fetch(`${BASE}data/meta.json`).then((r) => r.json() as Promise<MetaJson>),
    ]);
    this.stops = stops;
    this.routes = routes;
    this.headsigns = headsigns;
    this.meta = meta;
    stops.forEach((s, i) => this.stopIdxById.set(s.stopId, i));

    this.worker = new CsaWorker();
    this.worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; ok: boolean; error?: string; result?: RawResult };
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error));
    };
    await this.rpc({ type: "load", url: `${BASE}data/timetable.bin.gz` });
  }

  private rpc(payload: Record<string, unknown>): Promise<unknown> {
    const id = ++reqCounter;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...payload });
    });
  }

  async listStops(): Promise<Stop[]> {
    await this.ready();
    return this.stops;
  }

  async nearbyStops(at: LatLon, maxMeters = DEFAULT_MAX_WALK_M): Promise<NearbyStop[]> {
    await this.ready();
    return this.stops
      .map((stop) => ({ stop, meters: haversine(at, stop.at) }))
      .filter((x) => x.meters <= maxMeters)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, MAX_NEARBY)
      .map((x) => ({ ...x, walkSeconds: walkSecondsFor(x.meters) }));
  }

  private resolveEndpoint(
    ref: PlaceRef,
    maxMeters: number,
  ): { anchors: { stopIdx: number; walkSec: number }[]; point: StopPoint | { label: string; at: LatLon }; nearest?: { stop: Stop; meters: number } } | null {
    if (ref.kind === "stop") {
      const idx = this.stopIdxById.get(ref.stopId);
      if (idx === undefined) return null;
      const s = this.stops[idx];
      return {
        anchors: [{ stopIdx: idx, walkSec: 0 }],
        point: { stopId: s.stopId, name: s.name, displayName: s.displayName, town: s.town, at: s.at },
      };
    }
    const scored = this.stops
      .map((stop, idx) => ({ idx, stop, meters: haversine(ref.at, stop.at) }))
      .sort((a, b) => a.meters - b.meters);
    const near = scored.filter((x) => x.meters <= maxMeters).slice(0, MAX_NEARBY);
    if (near.length === 0) {
      return {
        anchors: [],
        point: { label: ref.label ?? "Selected point", at: ref.at },
        nearest: { stop: scored[0].stop, meters: scored[0].meters },
      };
    }
    return {
      anchors: near.map((x) => ({ stopIdx: x.idx, walkSec: walkSecondsFor(x.meters) })),
      point: { label: ref.label ?? "Selected point", at: ref.at },
    };
  }

  async plan(query: PlanQuery): Promise<PlanResult> {
    await this.ready();
    const feedEndDate = this.meta.feedEndDate;
    const feedStartDate = this.meta.feedStartDate;
    const flagCtx = { requestedDepartAt: query.departAt, feedEndDate };
    const adjusted = adjustDeparture(flagCtx);

    const maxMeters = query.maxWalkMeters ?? DEFAULT_MAX_WALK_M;
    const from = this.resolveEndpoint(query.from, maxMeters);
    const to = this.resolveEndpoint(query.to, maxMeters);

    const baseResult = (
      outcome: PlanResult["outcome"],
      extra: Partial<PlanResult> = {},
    ): PlanResult => ({
      itineraries: [],
      flags: { dateAdjustedFromPast: adjusted.dateAdjustedFromPast, beyondPublishedHorizon: false, noMoreServiceToday: false },
      horizonEndDate: feedEndDate,
      horizonStartDate: feedStartDate,
      outcome,
      query: { from: query.from, to: query.to, effectiveDepartAt: toMadeiraISO(adjusted.effectiveEpochSec) },
      feedVersion: this.meta.feedVersion,
      ...extra,
    });

    if (!from) return baseResult("no_route");
    if (!to) return baseResult("no_route");
    if (from.anchors.length === 0) return baseResult("origin_unreachable", { nearestStop: from.nearest });
    if (to.anchors.length === 0) return baseResult("destination_unreachable", { nearestStop: to.nearest });

    const maxItineraries = query.maxItineraries ?? 4;

    // A freshly published feed can start in the future; a "leave now" search
    // then lands before any service exists. Clamp to the first published day
    // and plan from there (and tell the UI so it can say why).
    const beforePublishedHorizon =
      localDate(adjusted.effectiveEpochSec) < this.meta.feedStartDate;
    const searchEpochSec = beforePublishedHorizon
      ? madeiraMidnightEpochSec(this.meta.feedStartDate)
      : adjusted.effectiveEpochSec;

    let raw: RawResult;
    if (beforePublishedHorizon) {
      // one wide pass over the feed's opening weeks
      raw = await this.runSearch(searchEpochSec, from.anchors, to.anchors, maxItineraries, 0, 21, 40 * 3600);
    } else {
      raw = await this.runSearch(searchEpochSec, from.anchors, to.anchors, maxItineraries, 0, 4);
      if (raw.itineraries.length === 0 && !raw.nextDeparture) {
        // widen: nothing in the next few days — look further into the horizon
        raw = await this.runSearch(searchEpochSec, from.anchors, to.anchors, maxItineraries, 4, 18);
      }
    }

    const itineraries = raw.itineraries.map((r) => this.hydrate(r, from.point, to.point));
    const nextDeparture = raw.nextDeparture
      ? { departAt: toMadeiraISO(raw.nextDeparture.departEpochSec), itinerary: this.hydrate(raw.nextDeparture, from.point, to.point) }
      : null;

    const derived = deriveFlags(
      { itineraries, nextDeparture, effectiveEpochSec: searchEpochSec, beforePublishedHorizon },
      flagCtx,
      adjusted,
    );

    return {
      itineraries: derived.itineraries,
      flags: derived.flags,
      adjustedTo: adjusted.adjustedTo,
      horizonEndDate: feedEndDate,
      horizonStartDate: feedStartDate,
      nextDeparture: derived.nextDeparture,
      outcome: derived.noServiceInHorizon
        ? "no_service_in_horizon"
        : derived.itineraries.length === 0 && !derived.nextDeparture
          ? "no_route"
          : "ok",
      query: { from: query.from, to: query.to, effectiveDepartAt: toMadeiraISO(adjusted.effectiveEpochSec) },
      feedVersion: this.meta.feedVersion,
    };
  }

  private async runSearch(
    effectiveEpochSec: number,
    sources: { stopIdx: number; walkSec: number }[],
    targets: { stopIdx: number; walkSec: number }[],
    maxItineraries: number,
    dayFrom: number,
    dayTo: number,
    journeyCapSec?: number,
  ): Promise<RawResult> {
    const startDate = localDate(effectiveEpochSec);
    const startEpochDay = epochDayFromDate(startDate);
    const serviceDays: SearchRequest["serviceDays"] = [];
    for (let d = dayFrom - 1; d <= dayTo; d++) {
      const date = dateFromEpochDay(startEpochDay + d);
      serviceDays.push({ epochDay: startEpochDay + d, baseEpochSec: madeiraMidnightEpochSec(date) });
    }
    serviceDays.sort((a, b) => a.baseEpochSec - b.baseEpochSec);
    return (await this.rpc({
      type: "search",
      req: {
        sources,
        targets,
        serviceDays,
        departAfterEpochSec: effectiveEpochSec,
        maxItineraries,
        mttSec: MTT_SECONDS,
        maxJourneySec: journeyCapSec ?? (dayFrom > 0 ? 30 * 3600 : 6 * 3600),
      } satisfies SearchRequest,
    })) as RawResult;
  }

  private hydrate(
    r: RawItinerary,
    fromPoint: StopPoint | { label: string; at: LatLon },
    toPoint: StopPoint | { label: string; at: LatLon },
  ): Itinerary {
    let transitSeen = 0;
    const legs: Leg[] = r.legs.map((raw) => this.hydrateLeg(raw, fromPoint, toPoint, () => transitSeen++));

    // A leading walk shouldn't sit idle at the stop — retime it to meet the
    // first bus. Normally that's a few minutes; it's hours when the feed
    // starts in the future and the search was clamped to its first day.
    if (legs[0]?.mode === "walk" && legs[1]?.mode === "transit") {
      const walk = legs[0];
      const board = legs[1].stops[0].departAt;
      const walkSec = isoToEpochSec(walk.arriveAt) - isoToEpochSec(walk.departAt);
      walk.arriveAt = board;
      walk.departAt = toMadeiraISO(isoToEpochSec(board) - walkSec);
    }

    const transitLegs = legs.filter((l): l is TransitLeg => l.mode === "transit");
    const signature = transitLegs
      .map((l) => `${l.route.routeId}:${l.stops[0].stop.stopId}>${l.stops[l.stops.length - 1].stop.stopId}`)
      .join("|");
    const departAt = legs[0].departAt;
    const arriveAt = legs[legs.length - 1].arriveAt;
    return {
      departAt,
      arriveAt,
      // from the actual first movement, not the (possibly much earlier) instant
      // the search departed from — matters when the next bus is hours away
      durationSeconds: isoToEpochSec(arriveAt) - isoToEpochSec(departAt),
      transferCount: r.transferCount,
      walkingSeconds: r.walkSec,
      walkingMeters: legs.filter((l) => l.mode === "walk").reduce((a, l) => a + l.distanceMeters, 0),
      isLastTripToday: r.isLastTripToday,
      legs,
      signature,
    };
  }

  private stopPointFor(
    stopIdx: number,
    fallback: StopPoint | { label: string; at: LatLon },
  ): StopPoint {
    if (stopIdx < 0) {
      if ("stopId" in fallback) return fallback;
      return { stopId: "@point", name: fallback.label, at: fallback.at };
    }
    const s = this.stops[stopIdx];
    return { stopId: s.stopId, name: s.name, displayName: s.displayName, town: s.town, at: s.at };
  }

  private hydrateLeg(
    raw: RawLeg,
    fromPoint: StopPoint | { label: string; at: LatLon },
    toPoint: StopPoint | { label: string; at: LatLon },
    bumpTransit: () => number,
  ): Leg {
    if (raw.mode === "walk") {
      const from = this.stopPointFor(raw.fromStopIdx, fromPoint);
      const to = this.stopPointFor(raw.toStopIdx, toPoint);
      const meters = haversine(from.at, to.at);
      const mins = Math.max(1, Math.round(raw.walkSec / 60));
      return {
        mode: "walk",
        from,
        to,
        departAt: toMadeiraISO(raw.departEpochSec),
        arriveAt: toMadeiraISO(raw.arriveEpochSec),
        distanceMeters: Math.round(meters),
        summary: `${mins} min walk`,
      };
    }
    const route = this.routeRef(raw.routeIdx);
    const stops: StopTime[] = raw.stopTimes.map((st) => ({
      stop: this.stopPointFor(st.stopIdx, fromPoint),
      arriveAt: toMadeiraISO(st.arriveEpochSec),
      departAt: toMadeiraISO(st.departEpochSec),
    }));
    const isFirstTransit = bumpTransit() === 0;
    return {
      mode: "transit",
      from: stops[0].stop,
      to: stops[stops.length - 1].stop,
      departAt: stops[0].departAt,
      arriveAt: stops[stops.length - 1].arriveAt,
      distanceMeters: 0,
      route,
      headsign: this.headsigns[raw.headsignIdx] ?? route.longName,
      stops,
      boardNote: isFirstTransit ? undefined : `change to ${route.operator} ${route.shortName}`,
      isLastTripToday: false,
    };
  }

  private routeRef(routeIdx: number): RouteRef {
    const r = this.routes[routeIdx];
    return {
      routeId: r.routeId,
      shortName: r.shortName,
      longName: r.longName,
      operator: r.operator,
      operatorName: r.operatorName,
      color: r.color ? `#${r.color}` : undefined,
      textColor: r.textColor ? `#${r.textColor}` : undefined,
    };
  }
}

let singleton: LocalPlanner | null = null;
export function createPlanner(): TripPlanner {
  if (!singleton) singleton = new LocalPlanner();
  return singleton;
}

void nowEpochSec;
void isoToEpochSec;
