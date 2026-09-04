import { useEffect, useMemo, useState } from "react";
import type MiniSearch from "minisearch";
import { usePlanner } from "../planner/index.ts";
import type { Stop } from "../planner/types.ts";
import { buildStopIndex, type StopSuggestion } from "../lib/stopSearch.ts";
import { FromToField } from "../components/FromToField.tsx";
import { ChevronDownIcon, SwapIcon } from "../components/icons.tsx";
import { toMadeiraISO, nowEpochSec } from "../planner/time.ts";
import { useSearchState, type Endpoint } from "../state/search.ts";
import "./SearchScreen.css";

function nowLocalParts() {
  const iso = toMadeiraISO(nowEpochSec());
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function SearchScreen() {
  const planner = usePlanner();
  const { state, setFrom, setTo, setDepartAt, swap, submit } = useSearchState();

  const [stops, setStops] = useState<Stop[]>([]);
  const [index, setIndex] = useState<MiniSearch<Stop & { plain: string }> | null>(null);
  const [locating, setLocating] = useState(false);
  const [laterOpen, setLaterOpen] = useState(Boolean(state.departAt));

  const stopsById = useMemo(() => new Map(stops.map((s) => [s.stopId, s])), [stops]);

  useEffect(() => {
    let alive = true;
    planner.listStops().then((all) => {
      if (!alive) return;
      setStops(all);
      setIndex(buildStopIndex(all));
    });
    return () => {
      alive = false;
    };
  }, [planner]);

  const pick = (which: "from" | "to") => (s: StopSuggestion) => {
    const ep: Endpoint = {
      label: s.town ? `${s.name} · ${s.town}` : s.name,
      ref: { kind: "stop", stopId: s.stop.stopId },
    };
    (which === "from" ? setFrom : setTo)(ep);
  };

  const text = (which: "from" | "to") => (t: string) => {
    (which === "from" ? setFrom : setTo)({ label: t, ref: null });
  };

  const useLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setFrom({
          label: "Current location",
          ref: {
            kind: "coord",
            at: { lat: pos.coords.latitude, lon: pos.coords.longitude },
            label: "Current location",
          },
        });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const { date: nowDate, time: nowTime } = nowLocalParts();
  const dateValue = state.departAt?.slice(0, 10) ?? nowDate;
  const timeValue = state.departAt?.slice(11, 16) ?? nowTime;

  const setLater = (date: string, time: string) => {
    // offset from the current instant so we keep the Madeira offset suffix
    const suffix = toMadeiraISO(nowEpochSec()).slice(19);
    setDepartAt(`${date}T${time || "00:00"}:00${suffix}`);
  };

  const canSearch = Boolean(state.from.ref && state.to.ref);

  return (
    <div className="screen search">
      <header className="search-head">
        <div className="search-eyebrow">Madeira Buses</div>
        <h1 className="search-title">Where are you headed?</h1>
      </header>

      <div className="search-fields">
        <FromToField
          kind="from"
          value={state.from.label}
          index={index}
          stopsById={stopsById}
          onText={text("from")}
          onPick={pick("from")}
          onUseLocation={useLocation}
          locating={locating}
        />
        <div className="search-swap-row">
          <button type="button" className="search-swap" title="Swap" aria-label="Swap from and to" onClick={swap}>
            <SwapIcon />
          </button>
        </div>
        <FromToField
          kind="to"
          value={state.to.label}
          index={index}
          stopsById={stopsById}
          onText={text("to")}
          onPick={pick("to")}
        />
      </div>

      <div className="search-later">
        <button
          type="button"
          className="search-later-toggle"
          aria-expanded={laterOpen}
          onClick={() => {
            const next = !laterOpen;
            setLaterOpen(next);
            if (!next) setDepartAt(undefined);
          }}
        >
          <span>{laterOpen ? "Leave now" : "Later"}</span>
          <ChevronDownIcon className={laterOpen ? "chev-open" : undefined} />
        </button>
        {laterOpen && (
          <div className="search-later-fields">
            <input
              type="date"
              aria-label="Departure date"
              value={dateValue}
              min={nowDate}
              onChange={(e) => setLater(e.target.value, timeValue)}
            />
            <input
              type="time"
              aria-label="Departure time"
              value={timeValue}
              onChange={(e) => setLater(dateValue, e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="spacer" />

      <div className="search-submit">
        <button
          type="button"
          className={`btn-primary ${canSearch ? "" : "is-disabled"}`}
          disabled={!canSearch}
          onClick={submit}
        >
          Search
        </button>
      </div>
    </div>
  );
}
