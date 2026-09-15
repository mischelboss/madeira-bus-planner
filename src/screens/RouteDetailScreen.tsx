import { lazy, Suspense, useEffect, useState } from "react";
import { useBrowseData, serviceHoursLabel, type ServiceWindow } from "../lib/browseData.ts";
import { routeTimes as fetchRouteTimes, type RouteTimesEntry } from "../lib/routeTimes.ts";
import { epochDayFromDate, localDate, madeiraMidnightEpochSec, nowEpochSec } from "../planner/time.ts";
import { LineBadge } from "../components/LineBadge.tsx";
import { BackIcon } from "../components/icons.tsx";
import { OPERATOR_CLASS, OPERATOR_LINE_COLOR } from "../lib/format.ts";
import "./RouteDetailScreen.css";

const RouteMap = lazy(() => import("../map/RouteMap.tsx").then((m) => ({ default: m.RouteMap })));

export function RouteDetailScreen({ routeId }: { routeId: string }) {
  const { data, error } = useBrowseData();
  const [view, setView] = useState<"stops" | "map" | "times">("stops");
  const route = data?.routes[routeId];

  const back = () => history.back();

  if (error || (data && !route)) {
    return (
      <div className="screen rd">
        <header className="rd-head">
          <button type="button" className="rd-back" aria-label="Back" onClick={back}>
            <BackIcon size={18} />
          </button>
          <div className="rd-head-text">
            <div className="rd-route">Route not found</div>
          </div>
        </header>
        <p className="rd-status">{error ?? "That route isn’t in the current feed."}</p>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="screen rd">
        <header className="rd-head">
          <button type="button" className="rd-back" aria-label="Back" onClick={back}>
            <BackIcon size={18} />
          </button>
        </header>
        <p className="rd-status">Loading route…</p>
      </div>
    );
  }

  const opClass = OPERATOR_CLASS[route.operator];

  return (
    <div className="screen rd">
      <header className="rd-head">
        <button type="button" className="rd-back" aria-label="Back" onClick={back}>
          <BackIcon size={18} />
        </button>
        <LineBadge route={route} />
        <div className="rd-head-text">
          <div className="rd-route">
            {route.origin} ↔ {route.destination}
          </div>
          <div className="rd-operator">{route.operatorName}</div>
        </div>
      </header>

      <div className="rd-toggle">
        <button
          type="button"
          className={view === "stops" ? "is-active" : ""}
          onClick={() => setView("stops")}
        >
          Stops
        </button>
        <button
          type="button"
          className={view === "map" ? "is-active" : ""}
          onClick={() => setView("map")}
        >
          Map
        </button>
        <button
          type="button"
          className={view === "times" ? "is-active" : ""}
          onClick={() => setView("times")}
        >
          Times
        </button>
      </div>

      {view === "stops" && (
        <div className="rd-stops">
          <div className="rd-hours card">
            <ServiceRow label="Mon–Fri" window={route.weekday} />
            <ServiceRow label="Sat–Sun & holidays" window={route.weekend} />
          </div>
          <ol className="rd-timeline card">
            {route.stops.map((s, i) => {
              const endpoint = i === 0 || i === route.stops.length - 1;
              return (
                <li key={i} className="rd-timeline-row">
                  <span className="rd-rail">
                    <span
                      className={`rd-dot ${endpoint ? opClass : "rd-dot--through"}`}
                      aria-hidden
                    />
                    {i < route.stops.length - 1 && <span className="rd-line" aria-hidden />}
                  </span>
                  <span className="rd-stop-name">{s.name}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {view === "map" && (
        <Suspense fallback={<p className="rd-status">Loading map…</p>}>
          <RouteMap
            routeId={route.routeId}
            stops={route.stops}
            color={OPERATOR_LINE_COLOR[route.operator]}
          />
        </Suspense>
      )}

      {view === "times" && <RouteTimesTable routeId={route.routeId} />}
    </div>
  );
}

/** Madeira-local minutes-since-midnight for "now". */
function nowMinutesInMadeira(): number {
  const now = nowEpochSec();
  const midnight = madeiraMidnightEpochSec(localDate(now));
  return Math.floor((now - midnight) / 60);
}

/** Same weekday/weekend rule scripts/build-data.ts uses to pick a representative day. */
function isWeekendInMadeira(): boolean {
  const epochDay = epochDayFromDate(localDate(nowEpochSec()));
  const dow = (epochDay + 4) % 7; // 1970-01-01 was a Thursday; 0 = Sun … 6 = Sat
  return dow === 0 || dow === 6;
}

const timeToMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Index of the soonest time in `times` that's still upcoming, or null if none is. */
function nextDepartureIndex(times: (string | null)[], nowMin: number): number | null {
  let best: number | null = null;
  let bestVal = Infinity;
  times.forEach((t, i) => {
    if (t == null) return;
    const v = timeToMin(t);
    if (v >= nowMin && v < bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

/** One row per stop, one column per trip departure — the classic printed-
 *  timetable grid, with each row highlighting its own next upcoming time. */
function RouteTimesTable({ routeId }: { routeId: string }) {
  const [entry, setEntry] = useState<RouteTimesEntry | null | undefined>(undefined);
  const [weekend, setWeekend] = useState(isWeekendInMadeira);

  useEffect(() => {
    let alive = true;
    setEntry(undefined);
    fetchRouteTimes(routeId).then((e) => {
      if (alive) setEntry(e);
    });
    return () => {
      alive = false;
    };
  }, [routeId]);

  if (entry === undefined) return <p className="rd-status">Loading times…</p>;
  if (entry === null) return <p className="rd-status">No schedule available for this route.</p>;

  const trips = entry.trips.filter((t) => t.weekend === weekend);
  const nowMin = nowMinutesInMadeira();

  return (
    <div className="rd-times">
      <div className="rd-toggle rd-times-toggle">
        <button
          type="button"
          className={!weekend ? "is-active" : ""}
          onClick={() => setWeekend(false)}
        >
          Mon–Fri
        </button>
        <button
          type="button"
          className={weekend ? "is-active" : ""}
          onClick={() => setWeekend(true)}
        >
          Sat–Sun & holidays
        </button>
      </div>
      {trips.length === 0 ? (
        <p className="rd-status">No service {weekend ? "on weekends" : "on weekdays"}.</p>
      ) : (
        <div className="rd-times-scroll card">
          <table className="rd-times-table">
            <tbody>
              {entry.stops.map((s, i) => {
                const rowTimes = trips.map((t) => t.times[i]);
                const nextIdx = nextDepartureIndex(rowTimes, nowMin);
                return (
                  <tr key={s.stopId + i}>
                    <th scope="row" className="rd-times-stop">
                      {s.name}
                    </th>
                    {rowTimes.map((t, j) => (
                      <td
                        key={j}
                        className={`tnum${j === nextIdx ? " rd-times-next" : ""}`}
                      >
                        {t ?? "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ServiceRow({ label, window: w }: { label: string; window: ServiceWindow | null }) {
  return (
    <div className="rd-hours-row">
      <span className="rd-hours-label">{label}</span>
      <span className="rd-hours-value tnum">{w ? serviceHoursLabel(w) : "No service"}</span>
    </div>
  );
}
