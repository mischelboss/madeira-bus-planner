import { lazy, Suspense, useState } from "react";
import { useBrowseData, serviceHoursLabel, type ServiceWindow } from "../lib/browseData.ts";
import { LineBadge } from "../components/LineBadge.tsx";
import { BackIcon } from "../components/icons.tsx";
import { OPERATOR_CLASS, OPERATOR_LINE_COLOR } from "../lib/format.ts";
import "./RouteDetailScreen.css";

const RouteMap = lazy(() => import("../map/RouteMap.tsx").then((m) => ({ default: m.RouteMap })));

export function RouteDetailScreen({ routeId }: { routeId: string }) {
  const { data, error } = useBrowseData();
  const [view, setView] = useState<"stops" | "map">("stops");
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
      </div>

      {view === "stops" ? (
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
      ) : (
        <Suspense fallback={<p className="rd-status">Loading map…</p>}>
          <RouteMap stops={route.stops} color={OPERATOR_LINE_COLOR[route.operator]} />
        </Suspense>
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
