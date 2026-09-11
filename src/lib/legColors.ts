/**
 * Per-itinerary leg-identity colors — a deterministic, itinerary-scoped
 * palette so the map and the overview/summary badges agree on which color
 * means which specific transit line, independent of the feed's own
 * `route.color` (a corridor/operator brand color in the real data, not
 * distinct per line — RODOESTE's 17 routes all share #C25E00, CAM's 16
 * share #8A7A00, HF's 64 reduce to 13 distinct colors by corridor).
 *
 * Palette: the dataviz skill's validated 8-hue categorical set, reordered
 * into a dedicated "leg identity" theme that pushes the hues nearest this
 * app's other meaningful map colors (walk-leg gray #8a8a8a, origin
 * #3a9a6b, destination #e8603c, major-stop #3a6b52 in shapeLayers.ts's
 * drawLayers()) to the back of the cycle. The front 4 slots — used by the
 * overwhelming majority of itineraries, which have 0-2 transfers (1-3
 * transit legs) — clear OKLab ΔE >= 12.5 from all four meaningful colors;
 * slots 5-8 sit much closer to the origin/destination marker colors and
 * are only reached by 5+-line itineraries. This reorder was found by
 * searching permutations of the documented 8 hues for ones that still
 * clear the skill's adjacent-pair CVD gates in both light and dark modes —
 * an arbitrary reorder is not safe without re-checking that, since the
 * CVD-safety property depends on which hues sit next to each other.
 */
import type { Itinerary } from "../planner/types.ts";

export const LEG_COLORS: readonly string[] = [
  "#2a78d6", // blue
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#4a3aa7", // violet
  "#eb6834", // orange — close to the destination marker (#e8603c); tail of the cycle
  "#1baf7a", // aqua — close to the origin marker (#3a9a6b); tail of the cycle
  "#e34948", // red — close to the destination marker (#e8603c); tail of the cycle
  "#008300", // green — close to the origin/major-stop markers; tail of the cycle
];

/** Deterministically maps each distinct TRANSIT route in `it` (in the order
 *  its leg first appears) to a color from LEG_COLORS, cycling if there are
 *  more distinct lines than palette entries. Walk legs are never assigned a
 *  color — they stay the fixed neutral gray everywhere they're drawn. */
export function assignLegColors(it: Itinerary): Map<string, string> {
  const map = new Map<string, string>();
  for (const leg of it.legs) {
    if (leg.mode !== "transit") continue;
    if (map.has(leg.route.routeId)) continue;
    map.set(leg.route.routeId, LEG_COLORS[map.size % LEG_COLORS.length]);
  }
  return map;
}
