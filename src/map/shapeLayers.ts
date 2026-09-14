import * as maplibregl from "maplibre-gl";
import type { Feature } from "geojson";
import type { Itinerary } from "../planner/types.ts";
import { assignLegColors } from "../lib/legColors.ts";
import { routeShape, sliceShape } from "../lib/routeShapes.ts";

export type LngLat = [number, number];

export const RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** Build the line + stop features for one itinerary, using the real route shape
 *  for each bus leg where the feed has one (straight bead-string otherwise). */
export async function legFeatures(it: Itinerary): Promise<{ lines: Feature[]; stops: Feature[] }> {
  const lines: Feature[] = [];
  const stops: Feature[] = [];
  const allPts: LngLat[] = [];
  const legColors = assignLegColors(it);
  const totalTransitLegs = it.legs.filter((l) => l.mode === "transit").length;
  let transitIndex = 0;

  for (const leg of it.legs) {
    if (leg.mode === "transit") {
      const stopPts = leg.stops.map((s) => [s.stop.at.lon, s.stop.at.lat] as LngLat);
      const shape = await routeShape(leg.route.routeId);
      const coords =
        shape && shape.length >= 2
          ? sliceShape(shape, stopPts[0], stopPts[stopPts.length - 1])
          : stopPts;
      allPts.push(...coords);
      // Two legs sharing a road corridor (e.g. a transfer between two lines
      // running the same street) would otherwise draw exactly on top of one
      // another — the later feature hides the earlier one entirely, even
      // though their colors differ. Fan each transit leg out by a small,
      // zoom-invariant pixel offset (`line-offset` in `drawLayers()`) so
      // overlapping legs render as visible parallel strands instead.
      const lineOffset = (transitIndex - (totalTransitLegs - 1) / 2) * 5;
      transitIndex++;
      lines.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          walk: false,
          color: legColors.get(leg.route.routeId) ?? leg.route.color ?? "#3a6b52",
          lineOffset,
        },
      });
      leg.stops.forEach((s, i) => {
        stops.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.stop.at.lon, s.stop.at.lat] },
          properties: {
            kind: i === 0 || i === leg.stops.length - 1 ? "major" : "minor",
            name: s.stop.name,
          },
        });
      });
    } else {
      const coords: LngLat[] = [
        [leg.from.at.lon, leg.from.at.lat],
        [leg.to.at.lon, leg.to.at.lat],
      ];
      allPts.push(...coords);
      lines.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { walk: true, color: "#8a8a8a" },
      });
    }
  }

  if (allPts.length) {
    stops.unshift({
      type: "Feature",
      geometry: { type: "Point", coordinates: allPts[0] },
      properties: { kind: "origin", name: it.legs[0].from.name },
    });
    stops.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: allPts[allPts.length - 1] },
      properties: { kind: "dest", name: it.legs[it.legs.length - 1].to.name },
    });
  }
  return { lines, stops };
}

export function drawLayers(m: maplibregl.Map) {
  m.addLayer({
    id: "route-transit",
    type: "line",
    source: "route",
    filter: ["!", ["get", "walk"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 4,
      "line-offset": ["coalesce", ["get", "lineOffset"], 0],
    },
  });
  m.addLayer({
    id: "route-walk",
    type: "line",
    source: "route",
    filter: ["==", ["get", "walk"], true],
    layout: { "line-cap": "round" },
    paint: { "line-color": "#8a8a8a", "line-width": 3, "line-dasharray": [1.6, 1.6] },
  });
  m.addLayer({
    id: "stop-dots",
    type: "circle",
    source: "stops",
    paint: {
      "circle-radius": ["match", ["get", "kind"], "origin", 7, "dest", 7, "major", 5, 3],
      "circle-color": [
        "match",
        ["get", "kind"],
        "origin",
        "#3a9a6b",
        "dest",
        "#e8603c",
        "major",
        "#3a6b52",
        "#a9c9b8",
      ],
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });

  // Click a stop dot to see its name.
  m.on("mouseenter", "stop-dots", () => {
    m.getCanvas().style.cursor = "pointer";
  });
  m.on("mouseleave", "stop-dots", () => {
    m.getCanvas().style.cursor = "";
  });
  m.on("click", "stop-dots", (e) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return;
    new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12 })
      .setLngLat(f.geometry.coordinates as [number, number])
      .setText(String(f.properties?.name ?? ""))
      .addTo(m);
  });
}
