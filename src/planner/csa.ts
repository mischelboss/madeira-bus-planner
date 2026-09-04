/**
 * Connection Scan Algorithm — pure, no Worker / DOM, so it unit-tests directly.
 *
 * The caller (LocalPlanner) owns all timezone maths: it passes one UTC "base"
 * epoch-second for each service day's local midnight, so a connection's
 * absolute instant is just `base + cDepTime` — DST and the >24:00:00
 * after-midnight encoding both fall out for free.
 */
import {
  decodeTimetable,
  serviceActiveOn,
  FLAG_PICKUP,
  FLAG_DROPOFF,
  type Timetable,
} from "./timetableFormat.ts";

export interface ServiceDay {
  epochDay: number;
  /** UTC epoch seconds of that service day's local (Atlantic/Madeira) midnight */
  baseEpochSec: number;
}

export interface SearchRequest {
  /** resolved by the caller from a stop id or a coordinate */
  sources: { stopIdx: number; walkSec: number }[];
  targets: { stopIdx: number; walkSec: number }[];
  /** ascending by baseEpochSec; typically [D-1, D, D+1] */
  serviceDays: ServiceDay[];
  departAfterEpochSec: number;
  maxItineraries: number;
  mttSec: number;
  /** reject any journey arriving later than departAfter + this (bounds transfer waits) */
  maxJourneySec: number;
  /** stop -> extra minimum transfer seconds (big interchanges); optional */
  mttOverride?: Record<number, number>;
}

export type RawLeg =
  | {
      mode: "walk";
      /** -1 => the query origin/destination point */
      fromStopIdx: number;
      toStopIdx: number;
      departEpochSec: number;
      arriveEpochSec: number;
      walkSec: number;
    }
  | {
      mode: "transit";
      tripIdx: number;
      routeIdx: number;
      headsignIdx: number;
      direction: number;
      stopTimes: { stopIdx: number; arriveEpochSec: number; departEpochSec: number }[];
    };

export interface RawItinerary {
  legs: RawLeg[];
  departEpochSec: number;
  arriveEpochSec: number;
  transferCount: number;
  walkSec: number;
  /** true if a strictly later same-route+direction departure boards leg-0's stop that local day */
  isLastTripToday: boolean;
}

export interface RawResult {
  itineraries: RawItinerary[];
  /** the single earliest journey found on any later service day, when the target day had none */
  nextDeparture: RawItinerary | null;
}

const INF = Number.MAX_SAFE_INTEGER;

/** Per-trip connection indices in stop_sequence order (CSR). Built once at load. */
export function buildTripConns(tt: Timetable): { start: Uint32Array; order: Uint32Array } {
  const counts = new Uint32Array(tt.nTrips);
  for (let i = 0; i < tt.nConnections; i++) counts[tt.cTrip[i]]++;
  const start = new Uint32Array(tt.nTrips + 1);
  for (let t = 0; t < tt.nTrips; t++) start[t + 1] = start[t] + counts[t];
  const order = new Uint32Array(tt.nConnections);
  const fill = start.slice(0, tt.nTrips);
  for (let i = 0; i < tt.nConnections; i++) {
    const t = tt.cTrip[i];
    order[fill[t]++] = i;
  }
  // sort each trip's slice by cSeq
  for (let t = 0; t < tt.nTrips; t++) {
    const a = order.subarray(start[t], start[t + 1]);
    a.sort((x, y) => tt.cSeq[x] - tt.cSeq[y]);
  }
  return { start, order };
}

interface Parent {
  kind: "origin" | "foot" | "trip";
  /** foot: from stop; trip: alight connection index */
  a: number;
  /** foot: walkSec; trip: service-day index */
  b: number;
  /** trip only: board connection index */
  boardConn?: number;
}

interface Ctx {
  tt: Timetable;
  tc: { start: Uint32Array; order: Uint32Array };
  req: SearchRequest;
  arr: Float64Array;
  parent: (Parent | null)[];
  tripBoardedDay: Int8Array;
  tripBoardConn: Int32Array;
  targetBest: number;
}

function mtt(ctx: Ctx, stop: number): number {
  return ctx.req.mttSec + (ctx.req.mttOverride?.[stop] ?? 0);
}

function relaxFoot(ctx: Ctx, from: number): void {
  const { tt, arr, parent } = ctx;
  const base = arr[from];
  for (let e = tt.footOffset[from]; e < tt.footOffset[from + 1]; e++) {
    const to = tt.footTarget[e];
    const cand = base + tt.footWalk[e];
    if (cand < arr[to]) {
      arr[to] = cand;
      parent[to] = { kind: "foot", a: from, b: tt.footWalk[e] };
    }
  }
}

function updateTargetBest(ctx: Ctx): void {
  for (const { stopIdx, walkSec } of ctx.req.targets) {
    const v = ctx.arr[stopIdx] + walkSec;
    if (v < ctx.targetBest) ctx.targetBest = v;
  }
}

/** One earliest-arrival scan from `departAfter`. Returns the reconstructed journey or null. */
function earliestArrival(ctx: Ctx, departAfterEpochSec: number): RawItinerary | null {
  const { tt, req } = ctx;
  ctx.arr.fill(INF);
  ctx.parent.fill(null);
  ctx.tripBoardedDay.fill(-1);
  // cap the search: nothing arriving past this can be a useful journey, and it
  // stops the scan waiting days for a sparse rural connection.
  ctx.targetBest = departAfterEpochSec + req.maxJourneySec;

  for (const { stopIdx, walkSec } of req.sources) {
    const cand = departAfterEpochSec + walkSec;
    if (cand < ctx.arr[stopIdx]) {
      ctx.arr[stopIdx] = cand;
      ctx.parent[stopIdx] = { kind: "origin", a: -1, b: walkSec };
      relaxFoot(ctx, stopIdx);
    }
  }
  updateTargetBest(ctx);

  const nDays = req.serviceDays.length;
  const cursor = new Int32Array(nDays); // per-day connection cursor
  // advance each cursor to the first connection whose absolute departure is > departAfter
  // (they only ever move forward)

  while (true) {
    let bestDay = -1;
    let bestAbsDep = INF;
    for (let k = 0; k < nDays; k++) {
      let i = cursor[k];
      const base = req.serviceDays[k].baseEpochSec;
      // skip connections earlier than departAfter or on inactive services
      while (i < tt.nConnections) {
        const absDep = base + tt.cDepTime[i];
        if (absDep < departAfterEpochSec) {
          i++;
          continue;
        }
        if (!serviceActiveOn(tt, tt.tService[tt.cTrip[i]], req.serviceDays[k].epochDay)) {
          i++;
          continue;
        }
        break;
      }
      cursor[k] = i;
      if (i < tt.nConnections) {
        const absDep = base + tt.cDepTime[i];
        if (absDep < bestAbsDep) {
          bestAbsDep = absDep;
          bestDay = k;
        }
      }
    }
    if (bestDay < 0 || bestAbsDep > ctx.targetBest) break;

    const k = bestDay;
    const i = cursor[k]!;
    cursor[k]++;
    const base = req.serviceDays[k].baseEpochSec;
    const t = tt.cTrip[i];
    const depStop = tt.cDepStop[i];
    const absDep = base + tt.cDepTime[i];
    const absArr = base + tt.cArrTime[i];

    const onSameRun = ctx.tripBoardedDay[t] === k;
    if (!onSameRun) {
      if (!(tt.cFlags[i] & FLAG_PICKUP)) continue;
      const ready = ctx.arr[depStop];
      if (ready === INF) continue;
      const p = ctx.parent[depStop];
      const readyWithMtt = ready + (p && p.kind === "trip" ? mtt(ctx, depStop) : 0);
      if (readyWithMtt > absDep) continue;
      ctx.tripBoardedDay[t] = k;
      ctx.tripBoardConn[t] = i;
    }

    if (tt.cFlags[i] & FLAG_DROPOFF && absArr < ctx.arr[tt.cArrStop[i]]) {
      ctx.arr[tt.cArrStop[i]] = absArr;
      ctx.parent[tt.cArrStop[i]] = {
        kind: "trip",
        a: i,
        b: k,
        boardConn: ctx.tripBoardConn[t],
      };
      relaxFoot(ctx, tt.cArrStop[i]);
      updateTargetBest(ctx);
    }
  }

  // pick the best target
  let endStop = -1;
  let best = INF;
  for (const { stopIdx, walkSec } of req.targets) {
    const v = ctx.arr[stopIdx] + walkSec;
    if (v < best) {
      best = v;
      endStop = stopIdx;
    }
  }
  if (endStop < 0 || best === INF || best > departAfterEpochSec + req.maxJourneySec) return null;
  const endWalk = req.targets.find((x) => x.stopIdx === endStop)!.walkSec;
  return reconstruct(ctx, endStop, endWalk);
}

function reconstruct(ctx: Ctx, endStop: number, endWalkSec: number): RawItinerary {
  const { tt, tc } = ctx;
  const legs: RawLeg[] = [];
  let cur = endStop;
  let transfers = -1;
  let walkSec = 0;

  // trailing walk to the destination point
  if (endWalkSec > 0) {
    legs.push({
      mode: "walk",
      fromStopIdx: endStop,
      toStopIdx: -1,
      departEpochSec: ctx.arr[endStop],
      arriveEpochSec: ctx.arr[endStop] + endWalkSec,
      walkSec: endWalkSec,
    });
    walkSec += endWalkSec;
  }

  while (true) {
    const p = ctx.parent[cur]!;
    if (p.kind === "origin") {
      if (p.b > 0) {
        // leading walk from the origin point
        legs.push({
          mode: "walk",
          fromStopIdx: -1,
          toStopIdx: cur,
          departEpochSec: ctx.arr[cur] - p.b,
          arriveEpochSec: ctx.arr[cur],
          walkSec: p.b,
        });
        walkSec += p.b;
      }
      break;
    }
    if (p.kind === "foot") {
      legs.push({
        mode: "walk",
        fromStopIdx: p.a,
        toStopIdx: cur,
        departEpochSec: ctx.arr[p.a],
        arriveEpochSec: ctx.arr[p.a] + p.b,
        walkSec: p.b,
      });
      walkSec += p.b;
      cur = p.a;
      continue;
    }
    // transit
    transfers++;
    const alightConn = p.a;
    const boardConn = p.boardConn!;
    const dayBase = ctx.req.serviceDays[p.b].baseEpochSec;
    const t = tt.cTrip[alightConn];
    const boardSeq = tt.cSeq[boardConn];
    const alightSeq = tt.cSeq[alightConn];

    const stopTimes: { stopIdx: number; arriveEpochSec: number; departEpochSec: number }[] = [];
    // board stop
    stopTimes.push({
      stopIdx: tt.cDepStop[boardConn],
      arriveEpochSec: dayBase + tt.cDepTime[boardConn],
      departEpochSec: dayBase + tt.cDepTime[boardConn],
    });
    for (let s = tc.start[t]; s < tc.start[t + 1]; s++) {
      const ci = tc.order[s];
      if (tt.cSeq[ci] < boardSeq || tt.cSeq[ci] > alightSeq) continue;
      stopTimes.push({
        stopIdx: tt.cArrStop[ci],
        arriveEpochSec: dayBase + tt.cArrTime[ci],
        departEpochSec: dayBase + tt.cArrTime[ci], // buses rarely dwell; refine only if a timepoint says otherwise
      });
    }
    legs.push({
      mode: "transit",
      tripIdx: t,
      routeIdx: tt.tRoute[t],
      headsignIdx: tt.tHeadsign[t],
      direction: tt.tDirection[t],
      stopTimes,
    });
    cur = tt.cDepStop[boardConn];
  }

  legs.reverse();
  const departEpochSec = legs[0].mode === "walk" ? legs[0].departEpochSec : legs[0].stopTimes[0].departEpochSec;
  const last = legs[legs.length - 1];
  const arriveEpochSec =
    last.mode === "walk" ? last.arriveEpochSec : last.stopTimes[last.stopTimes.length - 1].arriveEpochSec;

  return {
    legs,
    departEpochSec,
    arriveEpochSec,
    transferCount: Math.max(0, transfers),
    walkSec,
    isLastTripToday: computeIsLastTripToday(ctx, legs),
  };
}

function firstTransit(legs: RawLeg[]): Extract<RawLeg, { mode: "transit" }> | null {
  for (const l of legs) if (l.mode === "transit") return l;
  return null;
}

function computeIsLastTripToday(ctx: Ctx, legs: RawLeg[]): boolean {
  const ft = firstTransit(legs);
  if (!ft) return false;
  const { tt } = ctx;
  const boardStop = ft.stopTimes[0].stopIdx;
  const boardEpoch = ft.stopTimes[0].departEpochSec;
  const localDay = Math.floor(boardEpoch / 86_400); // rough; fine for the "same day" check window
  // any later connection, same route + direction, boarding this stop, same local day?
  for (let k = 0; k < ctx.req.serviceDays.length; k++) {
    const base = ctx.req.serviceDays[k].baseEpochSec;
    for (let i = 0; i < tt.nConnections; i++) {
      if (tt.cDepStop[i] !== boardStop) continue;
      const t = tt.cTrip[i];
      if (tt.tRoute[t] !== ft.routeIdx || tt.tDirection[t] !== ft.direction) continue;
      if (!serviceActiveOn(tt, tt.tService[t], ctx.req.serviceDays[k].epochDay)) continue;
      const dep = base + tt.cDepTime[i];
      if (dep > boardEpoch && Math.floor(dep / 86_400) === localDay) return false;
    }
  }
  return true;
}

export function search(
  tt: Timetable,
  tc: { start: Uint32Array; order: Uint32Array },
  req: SearchRequest,
): RawResult {
  const ctx: Ctx = {
    tt,
    tc,
    req,
    arr: new Float64Array(tt.nStops),
    parent: new Array(tt.nStops).fill(null),
    tripBoardedDay: new Int8Array(tt.nTrips),
    tripBoardConn: new Int32Array(tt.nTrips),
    targetBest: INF,
  };

  const out: RawItinerary[] = [];
  const seen = new Set<string>();
  let departAfter = req.departAfterEpochSec;
  const horizonEnd =
    req.serviceDays.length > 0
      ? req.serviceDays[req.serviceDays.length - 1].baseEpochSec + 48 * 3600
      : departAfter;

  let guard = 0;
  while (out.length < req.maxItineraries && departAfter < horizonEnd && guard++ < 12) {
    const j = earliestArrival(ctx, departAfter);
    if (!j) break;
    const ft = firstTransit(j.legs);
    if (!ft) break;
    const firstDep = ft.stopTimes[0].departEpochSec;
    const sig = j.legs
      .filter((l): l is Extract<RawLeg, { mode: "transit" }> => l.mode === "transit")
      .map((l) => `${l.routeIdx}:${l.stopTimes[0].stopIdx}>${l.stopTimes[l.stopTimes.length - 1].stopIdx}`)
      .join("|");
    if (!seen.has(sig) && !dominated(j, out)) {
      seen.add(sig);
      out.push(j);
    }
    departAfter = firstDep + 60;
  }

  let nextDeparture: RawItinerary | null = null;
  if (out.length === 0) {
    // nothing within the normal cap — look as far as the loaded service days
    // reach for a single "here's the next bus" answer.
    const wideCtx = { ...ctx, req: { ...req, maxJourneySec: horizonEnd - req.departAfterEpochSec } };
    const j = earliestArrival(wideCtx, req.departAfterEpochSec);
    if (j) nextDeparture = j;
  }

  return { itineraries: out, nextDeparture };
}

function dominated(j: RawItinerary, kept: RawItinerary[]): boolean {
  return kept.some(
    (r) => r.arriveEpochSec <= j.arriveEpochSec && r.transferCount <= j.transferCount,
  );
}

/** Decompress + decode. `gzBytes` is the raw content of `timetable.bin.gz`. */
export async function loadTimetable(gzBytes: ArrayBuffer): Promise<Timetable> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  void writer.write(new Uint8Array(gzBytes));
  void writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return decodeTimetable(buf);
}
