import { useEffect, useMemo, useRef, useState } from "react";
import type MiniSearch from "minisearch";
import type { Stop } from "../planner/types.ts";
import { searchStops, type StopSuggestion } from "../lib/stopSearch.ts";
import { LocateIcon, PinIcon } from "./icons.tsx";
import "./FromToField.css";

interface Props {
  kind: "from" | "to";
  value: string;
  index: MiniSearch<Stop & { plain: string }> | null;
  stopsById: Map<string, Stop>;
  onText: (text: string) => void;
  onPick: (s: StopSuggestion) => void;
  onUseLocation?: () => void;
  locating?: boolean;
}

export function FromToField({
  kind,
  value,
  index,
  stopsById,
  onText,
  onPick,
  onUseLocation,
  locating,
}: Props) {
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<number>(0);

  const suggestions = useMemo(
    () => (index && value.trim() ? searchStops(index, stopsById, value) : []),
    [index, stopsById, value],
  );
  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  const showList = focused && value.trim().length > 0 && suggestions.length > 0;

  return (
    <div className="ftf">
      <div className={`ftf-card ${focused ? "is-focused" : ""}`}>
        <span className={`ftf-marker ftf-marker--${kind}`} aria-hidden>
          {kind === "from" ? <span className="ftf-dot" /> : <PinIcon size={14} />}
        </span>
        <input
          className="ftf-input"
          value={value}
          placeholder={kind === "from" ? "From" : "To"}
          aria-label={kind === "from" ? "From" : "To"}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setFocused(false), 150);
          }}
        />
        {kind === "from" && onUseLocation && (
          <button
            type="button"
            className="ftf-locate"
            title="Use current location"
            aria-label="Use current location"
            onClick={onUseLocation}
            disabled={locating}
          >
            <LocateIcon size={18} className={locating ? "spin" : undefined} />
          </button>
        )}
      </div>

      {showList && (
        <ul className="ftf-suggest" role="listbox">
          {suggestions.map((s) => (
            <li key={s.stop.stopId} role="option" aria-selected={false}>
              <button
                type="button"
                className="ftf-suggest-row"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(s);
                  setFocused(false);
                }}
              >
                <span className="ftf-suggest-name">{s.name}</span>
                {s.town && <span className="ftf-suggest-town">{s.town}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
