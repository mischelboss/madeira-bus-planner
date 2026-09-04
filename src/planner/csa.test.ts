import { describe, expect, it } from "vitest";
import { buildTripConns, search, type SearchRequest } from "./csa.ts";
import type { Timetable } from "./timetableFormat.ts";

/**
 * Fixture: 4 stops on a line, 2 services, a handful of trips.
 *   A --- B --- C --- D
 * plus stop E, a 100 m walk from B.
 */
const FEED_START = 20_000; // epoch day
const FEED_END = 20_030;
const HORIZON = FEED_END - FEED_START + 1;
const STRIDE = Math.ceil(HORIZON / 8);

interface TripSpec {
  route: number;
  service: number;
  direction: number;
  /** [stopIdx, depSec] per stop, in order */
  stops: [number, number][];
}

function buildFixture(trips: TripSpec[], footpaths: [number, number, number][] = []): Timetable {
  const nStops = 5;
  const nRoutes = Math.max(...trips.map((t) => t.route)) + 1;
  const nServices = Math.max(...trips.map((t) => t.service)) + 1;
  const nTrips = trips.length;

  type C = { dep: number; arr: number; from: number; to: number; trip: number; seq: number };
  const conns: C[] = [];
  trips.forEach((t, ti) => {
    for (let k = 0; k + 1 < t.stops.length; k++) {
      conns.push({
        dep: t.stops[k][1],
        arr: t.stops[k + 1][1],
        from: t.stops[k][0],
        to: t.stops[k + 1][0],
        trip: ti,
        seq: k,
      });
    }
  });
  conns.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  const n = conns.length;

  const serviceActive = new Uint8Array(nServices * STRIDE);
  // every service active on every horizon day
  for (let s = 0; s < nServices; s++)
    for (let d = 0; d < HORIZON; d++) serviceActive[s * STRIDE + (d >> 3)] |= 1 << (d & 7);

  const footOffset = new Uint32Array(nStops + 1);
  const ft: number[] = [];
  const fw: number[] = [];
  const byFrom: Map<number, [number, number][]> = new Map();
  for (const [a, b, w] of footpaths) {
    (byFrom.get(a) ?? byFrom.set(a, []).get(a)!).push([b, w]);
    (byFrom.get(b) ?? byFrom.set(b, []).get(b)!).push([a, w]);
  }
  for (let s = 0; s < nStops; s++) {
    for (const [to, w] of byFrom.get(s) ?? []) {
      ft.push(to);
      fw.push(w);
    }
    footOffset[s + 1] = ft.length;
  }

  return {
    feedStartEpochDay: FEED_START,
    feedEndEpochDay: FEED_END,
    nStops,
    nRoutes,
    nTrips,
    nServices,
    nConnections: n,
    nFootEdges: ft.length,
    serviceStrideBytes: STRIDE,
    cDepStop: Uint16Array.from(conns.map((c) => c.from)),
    cArrStop: Uint16Array.from(conns.map((c) => c.to)),
    cDepTime: Int32Array.from(conns.map((c) => c.dep)),
    cArrTime: Int32Array.from(conns.map((c) => c.arr)),
    cTrip: Uint16Array.from(conns.map((c) => c.trip)),
    cFlags: Uint8Array.from(conns.map(() => 0b11)),
    cSeq: Uint8Array.from(conns.map((c) => c.seq)),
    tRoute: Uint16Array.from(trips.map((t) => t.route)),
    tService: Uint16Array.from(trips.map((t) => t.service)),
    tDirection: Uint8Array.from(trips.map((t) => t.direction)),
    tHeadsign: new Uint16Array(nTrips),
    serviceActive,
    sLat: new Float32Array(nStops),
    sLon: new Float32Array(nStops),
    footOffset,
    footTarget: Uint16Array.from(ft),
    footWalk: Uint16Array.from(fw),
  };
}

const A = 0, B = 1, C = 2, D = 3, E = 4;
const h = (n: number) => n * 3600;
const DAY_D = FEED_START + 10;
const baseD = DAY_D * 86_400;

function req(over: Partial<SearchRequest>): SearchRequest {
  return {
    sources: [{ stopIdx: A, walkSec: 0 }],
    targets: [{ stopIdx: D, walkSec: 0 }],
    serviceDays: [
      { epochDay: DAY_D - 1, baseEpochSec: (DAY_D - 1) * 86_400 },
      { epochDay: DAY_D, baseEpochSec: baseD },
      { epochDay: DAY_D + 1, baseEpochSec: (DAY_D + 1) * 86_400 },
    ],
    departAfterEpochSec: baseD + h(8),
    maxItineraries: 4,
    mttSec: 90,
    maxJourneySec: 6 * 3600,
    ...over,
  };
}

describe("CSA", () => {
  it("finds a direct trip after the requested time", () => {
    const tt = buildFixture([
      { route: 0, service: 0, direction: 0, stops: [[A, h(7)], [B, h(7.2)], [C, h(7.5)], [D, h(8)]] },
      { route: 0, service: 0, direction: 0, stops: [[A, h(9)], [B, h(9.2)], [C, h(9.5)], [D, h(10)]] },
    ]);
    const r = search(tt, buildTripConns(tt), req({}));
    expect(r.itineraries).toHaveLength(1);
    const j = r.itineraries[0];
    expect(j.transferCount).toBe(0);
    expect(j.departEpochSec).toBe(baseD + h(9)); // the 07:00 trip is filtered out
    expect(j.legs).toHaveLength(1);
    expect(j.legs[0].mode).toBe("transit");
  });

  it("uses a transfer when no direct trip exists", () => {
    const tt = buildFixture([
      { route: 0, service: 0, direction: 0, stops: [[A, h(9)], [B, h(9.5)]] }, // A->B only
      { route: 1, service: 0, direction: 0, stops: [[B, h(9.7)], [C, h(10)], [D, h(10.3)]] }, // B->D
    ]);
    const r = search(tt, buildTripConns(tt), req({}));
    expect(r.itineraries).toHaveLength(1);
    expect(r.itineraries[0].transferCount).toBe(1);
    expect(r.itineraries[0].legs.filter((l) => l.mode === "transit")).toHaveLength(2);
  });

  it("walks between two nearby stops to make a connection", () => {
    // route 0: A->E ; route 1: B->D ; E and B are a 120 s walk apart
    const tt = buildFixture(
      [
        { route: 0, service: 0, direction: 0, stops: [[A, h(9)], [E, h(9.4)]] },
        { route: 1, service: 0, direction: 0, stops: [[B, h(9.7)], [C, h(10)], [D, h(10.3)]] },
      ],
      [[E, B, 120]],
    );
    const r = search(tt, buildTripConns(tt), req({}));
    expect(r.itineraries).toHaveLength(1);
    const modes = r.itineraries[0].legs.map((l) => l.mode);
    expect(modes).toContain("walk");
    expect(modes.filter((m) => m === "transit")).toHaveLength(2);
  });

  it("a 00:30 trip is served from the previous service day", () => {
    // trip departs D-1 at 24:30 (= 00:30 next day)
    const tt = buildFixture([
      { route: 0, service: 0, direction: 0, stops: [[A, 24 * 3600 + h(0.5)], [D, 24 * 3600 + h(1)]] },
    ]);
    const r = search(
      tt,
      buildTripConns(tt),
      req({ departAfterEpochSec: baseD + 5 * 60 }), // 00:05 on day D
    );
    expect(r.itineraries).toHaveLength(1);
    // departs 00:30 local on day D
    expect(r.itineraries[0].departEpochSec).toBe(baseD + h(0.5));
  });

  it("reaches into the next service day when the last bus today has gone", () => {
    const tt = buildFixture([
      { route: 0, service: 0, direction: 0, stops: [[A, h(7)], [D, h(8)]] }, // only a 07:00 trip on D
      { route: 0, service: 0, direction: 0, stops: [[A, 26 * 3600], [D, 27 * 3600]] }, // 02:00 on D+1
    ]);
    const r = search(
      tt,
      buildTripConns(tt),
      req({ departAfterEpochSec: baseD + h(22), maxJourneySec: 30 * 3600 }),
    );
    // search returns the D+1 journey; deriveFlags is what reclassifies it as "next departure".
    expect(r.itineraries).toHaveLength(1);
    expect(r.itineraries[0].departEpochSec).toBe(baseD + 26 * 3600);
  });

  it("returns nothing (and a nextDeparture) when even the widened cap finds no journey today", () => {
    const tt = buildFixture([
      { route: 0, service: 0, direction: 0, stops: [[A, h(7)], [D, h(8)]] },
      { route: 0, service: 0, direction: 0, stops: [[A, 26 * 3600], [D, 27 * 3600]] },
    ]);
    const r = search(
      tt,
      buildTripConns(tt),
      req({ departAfterEpochSec: baseD + h(22), maxJourneySec: 3 * 3600 }),
    );
    expect(r.itineraries).toHaveLength(0);
    expect(r.nextDeparture).not.toBeNull();
    expect(r.nextDeparture!.departEpochSec).toBe(baseD + 26 * 3600);
  });
});
