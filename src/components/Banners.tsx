import { ClockIcon, WarningIcon } from "./icons.tsx";
import { humanDate } from "../lib/format.ts";
import "./Banners.css";

export function PastDateBanner() {
  return (
    <div className="banner banner--past">
      <ClockIcon size={17} />
      <p>
        Your date had already passed, so we&rsquo;ve moved this search to <strong>today</strong>.
      </p>
    </div>
  );
}

export function HorizonBanner({ horizonEndDate }: { horizonEndDate: string }) {
  return (
    <div className="banner banner--horizon">
      <WarningIcon size={17} />
      <p>
        Timetables past <strong>{humanDate(horizonEndDate)}</strong> aren&rsquo;t published yet.
        Times shown are estimates and may change.
      </p>
    </div>
  );
}
