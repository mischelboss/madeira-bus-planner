import type {
  Itinerary,
  LatLon,
  PlanQuery,
  PlanResult,
  Stop,
  TripPlanner,
} from "../planner/types.ts";

export const FAKE_STOPS: Stop[] = [
  { stopId: "s1", name: "Funchal - Praça", town: "Funchal", at: { lat: 32.65, lon: -16.91 } },
  { stopId: "s2", name: "Camara de Lobos", town: "Camara de Lobos", at: { lat: 32.65, lon: -16.98 } },
  { stopId: "s3", name: "Calheta - Vila", town: "Calheta", at: { lat: 32.72, lon: -17.18 } },
  // name and town differ — for the "matches on town" test
  { stopId: "s4", name: "Igreja", town: "Estreito da Calheta", at: { lat: 32.71, lon: -17.16 } },
];

export function makeItinerary(over: Partial<Itinerary> = {}): Itinerary {
  return {
    departAt: "2026-09-08T08:05:00+01:00",
    arriveAt: "2026-09-08T08:52:00+01:00",
    durationSeconds: 47 * 60,
    transferCount: 0,
    walkingSeconds: 0,
    walkingMeters: 0,
    isLastTripToday: false,
    signature: "sig-1",
    legs: [
      {
        mode: "transit",
        from: { stopId: "s1", name: "Funchal - Praça", at: FAKE_STOPS[0].at },
        to: { stopId: "s3", name: "Calheta - Vila", at: FAKE_STOPS[2].at },
        departAt: "2026-09-08T08:05:00+01:00",
        arriveAt: "2026-09-08T08:52:00+01:00",
        distanceMeters: 0,
        route: {
          routeId: "hf-1",
          shortName: "1",
          longName: "Funchal – Calheta",
          operator: "HF",
          operatorName: "Horários do Funchal",
        },
        headsign: "Calheta",
        isLastTripToday: false,
        stops: [
          { stop: { stopId: "s1", name: "Funchal - Praça", at: FAKE_STOPS[0].at }, arriveAt: "2026-09-08T08:05:00+01:00", departAt: "2026-09-08T08:05:00+01:00" },
          { stop: { stopId: "s2", name: "Câmara de Lobos", at: FAKE_STOPS[1].at }, arriveAt: "2026-09-08T08:24:00+01:00", departAt: "2026-09-08T08:24:00+01:00" },
          { stop: { stopId: "s3", name: "Calheta - Vila", at: FAKE_STOPS[2].at }, arriveAt: "2026-09-08T08:52:00+01:00", departAt: "2026-09-08T08:52:00+01:00" },
        ],
      },
    ],
    ...over,
  };
}

export function makeFakePlanner(result: Partial<PlanResult> = {}): TripPlanner {
  return {
    feedVersion: "test",
    horizonEndDate: "2027-06-30",
    horizonStartDate: "2026-09-08",
    ready: async () => {},
    listStops: async () => FAKE_STOPS,
    nearbyStops: async (_at: LatLon) => FAKE_STOPS.map((stop) => ({ stop, meters: 100, walkSeconds: 120 })),
    plan: async (q: PlanQuery): Promise<PlanResult> => ({
      itineraries: [makeItinerary()],
      flags: { dateAdjustedFromPast: false, beyondPublishedHorizon: false, noMoreServiceToday: false },
      horizonEndDate: "2027-06-30",
      horizonStartDate: "2026-09-08",
      outcome: "ok",
      query: { from: q.from, to: q.to, effectiveDepartAt: "2026-09-08T08:00:00+01:00" },
      feedVersion: "test",
      ...result,
    }),
  };
}
