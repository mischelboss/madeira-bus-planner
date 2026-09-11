import type { NextDeparture } from "../planner/types.ts";
import { dayLabel, hhmm, transferLabel } from "../lib/format.ts";
import { ClockIcon } from "./icons.tsx";
import { toMadeiraISO, nowEpochSec } from "../planner/time.ts";
import "./NoMoreBusesCard.css";

interface Props {
  next: NextDeparture | null;
  /** the date/time the user actually searched for, ISO — used to say
   *  "no more buses [today/tomorrow/Monday]" instead of always "today" */
  requestedAt?: string;
}

export function NoMoreBusesCard({ next, requestedAt }: Props) {
  const todayIso = toMadeiraISO(nowEpochSec());
  const requestedDayLabel = requestedAt ? dayLabel(requestedAt, todayIso) : "";
  const title = !requestedDayLabel
    ? "No more buses today"
    : requestedDayLabel === "Tomorrow"
      ? "No more buses tomorrow"
      : `No more buses on ${requestedDayLabel}`;
  // a journey whose arrival lands on a later calendar day than its own
  // departure (an overnight or multi-day connection) must say so —
  // otherwise a bare "arrives 07:13" can read as arriving before it departs
  const arriveDayLabel = next ? dayLabel(next.itinerary.arriveAt, next.itinerary.departAt) : "";
  return (
    <div className="nmb card">
      <div className="nmb-icon">
        <ClockIcon size={24} />
      </div>
      <div className="nmb-title">{title}</div>
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
            · {transferLabel(next.itinerary.transferCount)} · arrives{" "}
            {arriveDayLabel && `${arriveDayLabel}, `}
            {hhmm(next.itinerary.arriveAt)}
          </div>
        </div>
      )}
    </div>
  );
}
