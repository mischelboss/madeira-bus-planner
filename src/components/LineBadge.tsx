import type { CSSProperties } from "react";
import type { OperatorId } from "../planner/types.ts";
import { OPERATOR_CLASS, OPERATOR_SHORT } from "../lib/format.ts";
import "./LineBadge.css";

/** Colored operator/line pill — e.g. "HF 1". Accepts anything carrying an
 *  operator + short name (a full `RouteRef` or a Browse route).
 *
 *  `accentColor`, when given, adds a small leg-identity swatch dot (see
 *  `lib/legColors.ts`) so a multi-leg itinerary's badges agree with the
 *  map on which color means which specific line — distinct from the
 *  operator pill's own bg/fg, which stays a brand color, not a per-line
 *  one. Omitted, the badge renders exactly as before. */
export function LineBadge({
  route,
  accentColor,
}: {
  route: { operator: OperatorId; shortName: string };
  accentColor?: string;
}) {
  return (
    <span className={`line-badge ${OPERATOR_CLASS[route.operator]}`}>
      {accentColor && (
        <span
          className="line-badge-accent"
          style={{ "--line-badge-accent": accentColor } as CSSProperties}
          aria-hidden
        />
      )}
      {OPERATOR_SHORT[route.operator]} {route.shortName}
    </span>
  );
}
