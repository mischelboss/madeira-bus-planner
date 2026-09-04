import type { Itinerary, Leg } from "../planner/types.ts";
import { hhmm, OPERATOR_CLASS } from "../lib/format.ts";
import "./StopTimeline.css";

interface Row {
  name: string;
  time: string;
  note?: string;
  dot: "endpoint" | "transfer" | "through";
  opClass?: string;
}

function toRows(it: Itinerary): Row[] {
  const rows: Row[] = [];
  const transit = it.legs.filter((l): l is Extract<Leg, { mode: "transit" }> => l.mode === "transit");
  it.legs.forEach((leg, i) => {
    if (leg.mode === "walk") {
      // fold the walk into a note on the following boarding row, or a standalone row if trailing
      if (i === it.legs.length - 1) {
        rows.push({
          name: leg.to.name,
          time: hhmm(leg.arriveAt),
          note: `${leg.summary} to arrive`,
          dot: "endpoint",
        });
      }
      return;
    }
    const opClass = OPERATOR_CLASS[leg.route.operator];
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
        name: st.stop.name,
        time: hhmm(st.arriveAt),
        note,
        dot: endpoint ? "endpoint" : first || last ? "transfer" : "through",
        opClass: endpoint || first || last ? opClass : undefined,
      });
    });
  });
  return rows;
}

export function StopTimeline({ itinerary }: { itinerary: Itinerary }) {
  const rows = toRows(itinerary);
  return (
    <ol className="timeline">
      {rows.map((r, i) => (
        <li key={i} className="timeline-row">
          <div className="timeline-rail">
            <span
              className={`timeline-dot timeline-dot--${r.dot} ${r.opClass ?? ""}`}
              aria-hidden
            />
            {i < rows.length - 1 && <span className="timeline-line" aria-hidden />}
          </div>
          <div className="timeline-body">
            <div className="timeline-main">
              <span className="timeline-name">{r.name}</span>
              <span className="timeline-time tnum">{r.time}</span>
            </div>
            {r.note && <div className="timeline-note">{r.note}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
