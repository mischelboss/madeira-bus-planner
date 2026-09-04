import type { NextDeparture } from "../planner/types.ts";
import { dayLabel, hhmm, transferLabel } from "../lib/format.ts";
import { ClockIcon } from "./icons.tsx";
import { toMadeiraISO, nowEpochSec } from "../planner/time.ts";
import "./NoMoreBusesCard.css";

export function NoMoreBusesCard({ next }: { next: NextDeparture | null }) {
  const todayIso = toMadeiraISO(nowEpochSec());
  return (
    <div className="nmb card">
      <div className="nmb-icon">
        <ClockIcon size={24} />
      </div>
      <div className="nmb-title">No more buses today</div>
      <p className="nmb-body">
        {next
          ? "The last departure on this route has already gone. Next available departure:"
          : "The last departure has gone, and we couldn't find a later service within the published timetable."}
      </p>
      {next && (
        <div className="nmb-next">
          <div className="nmb-next-when tnum">
            {dayLabel(next.departAt, todayIso) || "Today"}, {hhmm(next.departAt)}
          </div>
          <div className="nmb-next-detail">
            {next.itinerary.legs
              .filter((l) => l.mode === "transit")
              .map((l) => (l.mode === "transit" ? `${l.route.operator} ${l.route.shortName}` : ""))
              .join(" · ")}{" "}
            · {transferLabel(next.itinerary.transferCount)} · arrives {hhmm(next.itinerary.arriveAt)}
          </div>
        </div>
      )}
    </div>
  );
}
