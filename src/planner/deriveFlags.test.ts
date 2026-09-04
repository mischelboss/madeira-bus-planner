import { describe, expect, it } from "vitest";
import { adjustDeparture, deriveFlags } from "./deriveFlags.ts";
import type { Itinerary } from "./types.ts";

const madeira = (s: string) => `${s}+01:00`;

function itin(departAt: string, arriveAt: string): Itinerary {
  return {
    departAt: madeira(departAt),
    arriveAt: madeira(arriveAt),
    durationSeconds: 3000,
    transferCount: 0,
    walkingSeconds: 0,
    walkingMeters: 0,
    isLastTripToday: false,
    legs: [],
    signature: `${departAt}`,
  };
}

describe("adjustDeparture", () => {
  it("leaves 'now' alone", () => {
    const a = adjustDeparture({ feedEndDate: "2027-06-30", nowIso: madeira("2026-09-08T10:00:00") });
    expect(a.dateAdjustedFromPast).toBe(false);
  });

  it("shifts a past requested time to now", () => {
    const a = adjustDeparture({
      feedEndDate: "2027-06-30",
      nowIso: madeira("2026-09-08T11:00:00"),
      requestedDepartAt: madeira("2026-09-08T09:00:00"),
    });
    expect(a.dateAdjustedFromPast).toBe(true);
    expect(a.adjustedTo).toBe(madeira("2026-09-08T11:00:00"));
  });

  it("keeps a near-future requested time (within grace)", () => {
    const a = adjustDeparture({
      feedEndDate: "2027-06-30",
      nowIso: madeira("2026-09-08T11:00:00"),
      requestedDepartAt: madeira("2026-09-08T11:01:00"),
    });
    expect(a.dateAdjustedFromPast).toBe(false);
  });
});

describe("deriveFlags", () => {
  const ctx = { feedEndDate: "2027-06-30", nowIso: madeira("2026-09-08T10:00:00") };
  const adjusted = adjustDeparture(ctx);

  it("keeps same-day itineraries and sets no flags", () => {
    const d = deriveFlags(
      { itineraries: [itin("2026-09-08T12:00:00", "2026-09-08T12:40:00")], nextDeparture: null, effectiveEpochSec: adjusted.effectiveEpochSec },
      ctx,
      adjusted,
    );
    expect(d.flags.noMoreServiceToday).toBe(false);
    expect(d.itineraries).toHaveLength(1);
  });

  it("flags noMoreServiceToday and surfaces nextDeparture when nothing today", () => {
    const next = { departAt: madeira("2026-09-09T08:00:00"), itinerary: itin("2026-09-09T08:00:00", "2026-09-09T08:50:00") };
    const d = deriveFlags(
      { itineraries: [next.itinerary], nextDeparture: next, effectiveEpochSec: adjusted.effectiveEpochSec },
      ctx,
      adjusted,
    );
    expect(d.flags.noMoreServiceToday).toBe(true);
    expect(d.itineraries).toHaveLength(0);
    expect(d.nextDeparture).toBe(next);
    expect(d.noServiceInHorizon).toBe(false);
  });

  it("flags beyondPublishedHorizon for a date past feed_end_date", () => {
    const far = { feedEndDate: "2027-06-30", nowIso: madeira("2026-09-08T10:00:00"), requestedDepartAt: madeira("2027-08-01T09:00:00") };
    const adj = adjustDeparture(far);
    const d = deriveFlags(
      { itineraries: [], nextDeparture: null, effectiveEpochSec: adj.effectiveEpochSec },
      far,
      adj,
    );
    expect(d.flags.beyondPublishedHorizon).toBe(true);
  });

  it("reports noServiceInHorizon when there is no path at all", () => {
    const d = deriveFlags(
      { itineraries: [], nextDeparture: null, effectiveEpochSec: adjusted.effectiveEpochSec },
      ctx,
      adjusted,
    );
    expect(d.noServiceInHorizon).toBe(true);
  });
});
