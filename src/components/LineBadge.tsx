import type { OperatorId } from "../planner/types.ts";
import { OPERATOR_CLASS, OPERATOR_SHORT } from "../lib/format.ts";
import "./LineBadge.css";

/** Colored operator/line pill — e.g. "HF 1". Accepts anything carrying an
 *  operator + short name (a full `RouteRef` or a Browse route). */
export function LineBadge({
  route,
}: {
  route: { operator: OperatorId; shortName: string };
}) {
  return (
    <span className={`line-badge ${OPERATOR_CLASS[route.operator]}`}>
      {OPERATOR_SHORT[route.operator]} {route.shortName}
    </span>
  );
}
