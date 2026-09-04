/**
 * Edge-state logic — a pure function shared by `LocalPlanner` and any future
 * server, so both compute the three first-class edge states identically.
 */
import { localDate, nowEpochSec, isoToEpochSec } from "./time.ts";
import type { Itinerary, NextDeparture, PlanFlags } from "./types.ts";

const GRACE_SECONDS = 120;

export interface FlagContext {
  /** ISO — "now" in Madeira. Injectable for tests. */
  nowIso?: string;
  /** the user's chosen departure ISO, or undefined for "leave now" */
  requestedDepartAt?: string;
  /** feed_end_date, "YYYY-MM-DD" */
  feedEndDate: string;
}

export interface AdjustedDeparture {
  /** epoch seconds actually searched from */
  effectiveEpochSec: number;
  dateAdjustedFromPast: boolean;
  /** ISO, present iff dateAdjustedFromPast */
  adjustedTo?: string;
}

/** Step 1: shift a past requested time up to "now". */
export function adjustDeparture(ctx: FlagContext): AdjustedDeparture {
  const now = ctx.nowIso ? isoToEpochSec(ctx.nowIso) : nowEpochSec();
  if (!ctx.requestedDepartAt) {
    return { effectiveEpochSec: now, dateAdjustedFromPast: false };
  }
  const requested = isoToEpochSec(ctx.requestedDepartAt);
  if (requested < now - GRACE_SECONDS) {
    return {
      effectiveEpochSec: now,
      dateAdjustedFromPast: true,
      adjustedTo: ctx.nowIso ?? new Date(now * 1000).toISOString(),
    };
  }
  return { effectiveEpochSec: requested, dateAdjustedFromPast: false };
}

export interface RawFlagInput {
  /** itineraries the worker returned, sorted by departure (may span days) */
  itineraries: Itinerary[];
  nextDeparture: NextDeparture | null;
  effectiveEpochSec: number;
}

export interface DerivedFlags {
  itineraries: Itinerary[];
  flags: PlanFlags;
  nextDeparture: NextDeparture | null;
  /** true iff a path exists somewhere but not from here within the horizon */
  noServiceInHorizon: boolean;
}

/** Step 2: same-day filter + the beyond-horizon / no-more-today flags. */
export function deriveFlags(
  raw: RawFlagInput,
  ctx: FlagContext,
  adjusted: AdjustedDeparture,
): DerivedFlags {
  const effectiveDate = localDate(raw.effectiveEpochSec);
  const requestedDate = ctx.requestedDepartAt
    ? localDate(isoToEpochSec(ctx.requestedDepartAt))
    : effectiveDate;

  const beyondPublishedHorizon = requestedDate > ctx.feedEndDate;

  const sameDay = raw.itineraries.filter((it) => localDate(isoToEpochSec(it.departAt)) === effectiveDate);

  let noMoreServiceToday = false;
  let noServiceInHorizon = false;
  let itineraries = sameDay;
  let nextDeparture: NextDeparture | null = null;

  if (sameDay.length === 0) {
    noMoreServiceToday = true;
    itineraries = [];
    if (raw.nextDeparture) {
      nextDeparture = raw.nextDeparture;
    } else {
      noServiceInHorizon = true;
    }
  }

  return {
    itineraries,
    flags: {
      dateAdjustedFromPast: adjusted.dateAdjustedFromPast,
      beyondPublishedHorizon,
      noMoreServiceToday,
    },
    nextDeparture,
    noServiceInHorizon,
  };
}
