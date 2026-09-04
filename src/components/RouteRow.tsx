import { type BrowseRoute, routeSummaryLabel } from "../lib/browseData.ts";
import { openRoute } from "../state/nav.ts";
import { LineBadge } from "./LineBadge.tsx";
import { ChevronRightIcon } from "./icons.tsx";
import "./RouteRow.css";

export function RouteRow({ route }: { route: BrowseRoute }) {
  return (
    <button type="button" className="route-row" onClick={() => openRoute(route.routeId)}>
      <LineBadge route={route} />
      <span className="route-row-body">
        <span className="route-row-name">
          {route.origin} ↔ {route.destination}
        </span>
        <span className="route-row-freq">{routeSummaryLabel(route)}</span>
      </span>
      <ChevronRightIcon className="route-row-chev" />
    </button>
  );
}
