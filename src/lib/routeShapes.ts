/**
 * Real route geometry for the map — `route-shapes.json` (routeId → shapeId) and
 * `shapes.json` (shapeId → [lon, lat][]). 64 of the 87 routes have a shape; the
 * rest fall back to a straight bead-string through their stops.
 */
const BASE = import.meta.env.BASE_URL || "/";

type LngLat = [number, number];

let bundle: Promise<{
  byRoute: Record<string, string | null>;
  byShape: Record<string, LngLat[]>;
}> | null = null;

function load() {
  bundle ??= Promise.all([
    fetch(`${BASE}data/route-shapes.json`).then((r) => r.json() as Promise<Record<string, string | null>>),
    fetch(`${BASE}data/shapes.json`).then((r) => r.json() as Promise<Record<string, LngLat[]>>),
  ]).then(([byRoute, byShape]) => ({ byRoute, byShape }));
  return bundle;
}

/** The full [lon, lat] polyline for a route, or null when the feed has no shape. */
export async function routeShape(routeId: string): Promise<LngLat[] | null> {
  const { byRoute, byShape } = await load();
  const shapeId = byRoute[routeId];
  return shapeId ? (byShape[shapeId] ?? null) : null;
}

const nearestIndex = (line: LngLat[], p: LngLat): number => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < line.length; i++) {
    const dx = line[i][0] - p[0];
    const dy = line[i][1] - p[1];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};

/** The stretch of `shape` between the two points, by nearest vertex. */
export function sliceShape(shape: LngLat[], from: LngLat, to: LngLat): LngLat[] {
  let a = nearestIndex(shape, from);
  let b = nearestIndex(shape, to);
  if (a > b) [a, b] = [b, a];
  const seg = shape.slice(a, b + 1);
  return seg.length >= 2 ? seg : [from, to];
}
