import type { Itinerary, Leg, TransitLeg } from "../planner/types.ts";
import { durationLabel, hhmm, transferLabel } from "../lib/format.ts";
import { LineBadge } from "./LineBadge.tsx";
import { StopTimeline } from "./StopTimeline.tsx";
import { WalkIcon } from "./icons.tsx";
import "./ItineraryCard.css";

interface Props {
  itinerary: Itinerary;
  expanded: boolean;
  onToggle: () => void;
}

export function ItineraryCard({ itinerary: it, expanded, onToggle }: Props) {
  const transitLegs = it.legs.filter((l): l is TransitLeg => l.mode === "transit");
  const hasWalk = it.legs.some((l: Leg) => l.mode === "walk");

  return (
    <div className="itin card">
      <button type="button" className="itin-summary" onClick={onToggle} aria-expanded={expanded}>
        <div className="itin-times">
          <div className="itin-clock">
            <span className="itin-time tnum">{hhmm(it.departAt)}</span>
            <span className="itin-arrow" aria-hidden>
              →
            </span>
            <span className="itin-time tnum">{hhmm(it.arriveAt)}</span>
          </div>
          <span className="itin-duration">{durationLabel(it.durationSeconds)}</span>
        </div>
        <div className="itin-meta">
          {transitLegs.map((l, i) => (
            <LineBadge key={i} route={l.route} />
          ))}
          {hasWalk && (
            <span className="itin-walk">
              <WalkIcon size={12} /> walk
            </span>
          )}
          <span className="itin-transfers">{transferLabel(it.transferCount)}</span>
          {it.isLastTripToday && <span className="itin-last">Last trip today</span>}
        </div>
      </button>
      {expanded && <StopTimeline itinerary={it} />}
    </div>
  );
}
