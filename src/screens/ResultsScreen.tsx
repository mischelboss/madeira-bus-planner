import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { usePlanner } from "../planner/index.ts";
import type { PlanResult } from "../planner/types.ts";
import { useSearchState } from "../state/search.ts";
import { BackIcon } from "../components/icons.tsx";
import { PastDateBanner, HorizonBanner, BeforeHorizonBanner } from "../components/Banners.tsx";
import { NoMoreBusesCard } from "../components/NoMoreBusesCard.tsx";
import { ItineraryCard } from "../components/ItineraryCard.tsx";
import { hhmm } from "../lib/format.ts";
import "./ResultsScreen.css";

// maplibre-gl is ~330 KB gzipped — keep it out of the initial load.
const MapView = lazy(() => import("../map/MapView.tsx").then((m) => ({ default: m.MapView })));

export function ResultsScreen() {
  const planner = usePlanner();
  const { state, back } = useSearchState();
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeMap, setActiveMap] = useState(0);

  useEffect(() => {
    if (!state.from.ref || !state.to.ref) return;
    const controller = new AbortController();
    setResult(null);
    setError(null);
    planner
      .plan({
        from: state.from.ref,
        to: state.to.ref,
        departAt: state.departAt,
        signal: controller.signal,
      })
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => controller.abort();
  }, [planner, state.from.ref, state.to.ref, state.departAt]);

  const routeSummary = `${state.from.label} → ${state.to.label}`;
  const whenSummary = useMemo(() => {
    if (!state.departAt) return "Leaving now";
    return `Departing ${hhmm(state.departAt)}`;
  }, [state.departAt]);

  const toggle = (sig: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(sig)) n.delete(sig);
      else n.add(sig);
      return n;
    });

  const showList = result && !result.flags.noMoreServiceToday && result.itineraries.length > 0;

  return (
    <div className="screen results">
      <header className="results-head">
        <button type="button" className="results-back" aria-label="Back" onClick={back}>
          <BackIcon size={18} />
        </button>
        <div className="results-head-text">
          <div className="results-route">{routeSummary}</div>
          <div className="results-when">
            {result?.flags.noMoreServiceToday ? "Tonight" : whenSummary}
          </div>
        </div>
      </header>

      {!result && !error && <div className="results-status">Planning…</div>}
      {error && <div className="results-status results-status--error">Couldn&rsquo;t plan this trip: {error}</div>}

      {result && (
        <>
          {result.flags.dateAdjustedFromPast && <PastDateBanner />}
          {result.flags.beforePublishedHorizon && (
            <BeforeHorizonBanner horizonStartDate={result.horizonStartDate} />
          )}
          {result.flags.beyondPublishedHorizon && (
            <HorizonBanner horizonEndDate={result.horizonEndDate} />
          )}

          {result.flags.noMoreServiceToday && (
            <NoMoreBusesCard next={result.nextDeparture ?? null} />
          )}

          {result.outcome === "origin_unreachable" && result.nearestStop && (
            <div className="results-status">
              No bus stop within walking distance of your start. Closest is{" "}
              {result.nearestStop.stop.name} ({Math.round(result.nearestStop.meters)} m away).
            </div>
          )}
          {result.outcome === "destination_unreachable" && result.nearestStop && (
            <div className="results-status">
              No bus stop within walking distance of your destination. Closest is{" "}
              {result.nearestStop.stop.name} ({Math.round(result.nearestStop.meters)} m away).
            </div>
          )}
          {result.outcome === "no_route" && !result.flags.noMoreServiceToday && (
            <div className="results-status">No bus route connects these two places.</div>
          )}
          {result.outcome === "no_service_in_horizon" && !result.flags.noMoreServiceToday && (
            <div className="results-status">
              No bus service runs between these stops within the published timetable
              (through {result.horizonEndDate}).
            </div>
          )}

          {showList && (
            <>
              <div className="results-toggle">
                <button
                  type="button"
                  className={view === "list" ? "is-active" : ""}
                  onClick={() => setView("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  className={view === "map" ? "is-active" : ""}
                  onClick={() => setView("map")}
                >
                  Map
                </button>
              </div>

              {view === "list" ? (
                <div className="results-list">
                  {result.itineraries.map((it) => (
                    <ItineraryCard
                      key={it.signature}
                      itinerary={it}
                      expanded={expanded.has(it.signature)}
                      onToggle={() => toggle(it.signature)}
                    />
                  ))}
                </div>
              ) : (
                <Suspense fallback={<div className="results-status">Loading map…</div>}>
                  <MapView
                    itineraries={result.itineraries}
                    activeIndex={Math.min(activeMap, result.itineraries.length - 1)}
                    onActiveIndexChange={setActiveMap}
                  />
                </Suspense>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
