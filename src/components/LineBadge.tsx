import type { RouteRef } from "../planner/types.ts";
import { OPERATOR_CLASS } from "../lib/format.ts";
import "./LineBadge.css";

export function LineBadge({ route }: { route: RouteRef }) {
  return (
    <span className={`line-badge ${OPERATOR_CLASS[route.operator]}`}>
      {route.operator} {route.shortName}
    </span>
  );
}
