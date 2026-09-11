import type { CSSProperties } from "react";
import type { Itinerary, Leg } from "../planner/types.ts";
import { hhmm } from "../lib/format.ts";
import { stopLabel } from "../lib/stopNames.ts";
import "./StopTimeline.css";

interface Row {
  name: string;
  time: string;
  note?: string;
  dot: "endpoint" | "transfer" | "through";
  /** Leg-identity color (see `lib/legColors.ts`) for every stop within a
   *  transit leg — undefined for the trailing-walk row, which stays neutral. */
  color?: string;
  /** Index into `itinerary.legs` this row belongs to, so the connecting
   *  rail segment can tell "still the same leg" from "crossing a transfer". */
  legIndex?: number;
}

function toRows(it: Itinerary, legColors: Map<string, string>): Row[] {
  const rows: Row[] = [];
  const transit = it.legs.filter((l): l is Extract<Leg, { mode: "transit" }> => l.mode === "transit");
  it.legs.forEach((leg, i) => {
    if (leg.mode === "walk") {
      // fold the walk into a note on the following boarding row, or a standalone row if trailing
      if (i === it.legs.length - 1) {
        rows.push({
          name: stopLabel(leg.to),
          time: hhmm(leg.arriveAt),
          note: `${leg.summary} to arrive`,
          dot: "endpoint",
        });
      }
      return;
    }
    const color = legColors.get(leg.route.routeId);
    const isFirst = leg === transit[0];
    leg.stops.forEach((st, k) => {
      const first = k === 0;
      const last = k === leg.stops.length - 1;
      const endpoint = (isFirst && first) || (leg === transit[transit.length - 1] && last);
      let note: string | undefined;
      if (first && !isFirst) note = leg.boardNote;
      const prevWalk = it.legs[i - 1];
      if (first && prevWalk?.mode === "walk") note = prevWalk.summary;
      rows.push({
        name: stopLabel(st.stop),
        time: hhmm(st.arriveAt),
        note,
        dot: endpoint ? "endpoint" : first || last ? "transfer" : "through",
        color,
        legIndex: i,
      });
    });
  });
  return rows;
}

export function StopTimeline({
  itinerary,
  legColors,
}: {
  itinerary: Itinerary;
  legColors: Map<string, string>;
}) {
  const rows = toRows(itinerary, legColors);
  return (
    <ol className="timeline">
      {rows.map((r, i) => {
        const next = rows[i + 1];
        // The rail segment after this row represents travel *within* the
        // same leg only when both ends belong to it — at a transfer, the
        // gap between the last stop of one leg and the first of the next
        // isn't "on" either line, so it stays the neutral color.
        const lineColor = next && r.legIndex !== undefined && r.legIndex === next.legIndex ? r.color : undefined;
        return (
          <li key={i} className="timeline-row">
            <div className="timeline-rail">
              <span
                className={`timeline-dot timeline-dot--${r.dot}`}
                style={{ "--timeline-dot-color": r.color } as CSSProperties}
                aria-hidden
              />
              {i < rows.length - 1 && (
                <span
                  className="timeline-line"
                  style={{ "--timeline-line-color": lineColor } as CSSProperties}
                  aria-hidden
                />
              )}
            </div>
            <div className="timeline-body">
              <div className="timeline-main">
                <span className="timeline-name">{r.name}</span>
                <span className="timeline-time tnum">{r.time}</span>
              </div>
              {r.note && <div className="timeline-note">{r.note}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
