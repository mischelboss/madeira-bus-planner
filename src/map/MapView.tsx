import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibreWorker.ts";
import type { Feature, FeatureCollection, LineString } from "geojson";
import type { Itinerary } from "../planner/types.ts";
import { hhmm } from "../lib/format.ts";
import { routeShape, sliceShape } from "../lib/routeShapes.ts";
import { useLiveLocation } from "./useLiveLocation.ts";
import "./MapView.css";

interface Props {
  itineraries: Itinerary[];
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
}

type LngLat = [number, number];

const RASTER_STYLE: maplibregl.StyleSpecification = {
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
async function legFeatures(it: Itinerary): Promise<{ lines: Feature[]; stops: Feature[] }> {
  const lines: Feature[] = [];
  const stops: Feature[] = [];
  const allPts: LngLat[] = [];

  for (const leg of it.legs) {
    if (leg.mode === "transit") {
      const stopPts = leg.stops.map((s) => [s.stop.at.lon, s.stop.at.lat] as LngLat);
      const shape = await routeShape(leg.route.routeId);
      const coords =
        shape && shape.length >= 2
          ? sliceShape(shape, stopPts[0], stopPts[stopPts.length - 1])
          : stopPts;
      allPts.push(...coords);
      lines.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { walk: false, color: leg.route.color ?? "#3a6b52" },
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
      properties: { kind: "origin", name: "Start" },
    });
    stops.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: allPts[allPts.length - 1] },
      properties: { kind: "dest", name: "End" },
    });
  }
  return { lines, stops };
}

function drawLayers(m: maplibregl.Map) {
  m.addLayer({
    id: "route-transit",
    type: "line",
    source: "route",
    filter: ["!", ["get", "walk"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 4 },
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
}

export function MapView({ itineraries, activeIndex, onActiveIndexChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const youMarker = useRef<maplibregl.Marker | null>(null);
  const { position, status } = useLiveLocation(true);

  const active = itineraries[activeIndex];

  // create / destroy the map with the component
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: RASTER_STYLE,
      center: [-16.92, 32.72],
      zoom: 9.5,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      youMarker.current = null;
    };
  }, []);

  // draw the active itinerary
  useEffect(() => {
    const m = map.current;
    if (!m || !active) return;
    let cancelled = false;

    legFeatures(active).then(({ lines, stops }) => {
      if (cancelled || map.current !== m) return;

      const apply = () => {
        const lineData: FeatureCollection = { type: "FeatureCollection", features: lines };
        const stopData: FeatureCollection = { type: "FeatureCollection", features: stops };
        if (m.getSource("route")) {
          (m.getSource("route") as maplibregl.GeoJSONSource).setData(lineData);
          (m.getSource("stops") as maplibregl.GeoJSONSource).setData(stopData);
        } else {
          m.addSource("route", { type: "geojson", data: lineData });
          m.addSource("stops", { type: "geojson", data: stopData });
          drawLayers(m);
        }
        const b = new maplibregl.LngLatBounds();
        lines.forEach((f) =>
          (f.geometry as LineString).coordinates.forEach((c) => b.extend(c as LngLat)),
        );
        if (!b.isEmpty()) m.fitBounds(b, { padding: 36, duration: 300 });
      };

      if (m.isStyleLoaded()) apply();
      else m.once("load", apply);
    });

    return () => {
      cancelled = true;
    };
  }, [active]);

  // live "you are here"
  useEffect(() => {
    const m = map.current;
    if (!m || !position) return;
    if (!youMarker.current) {
      const el = document.createElement("div");
      el.className = "you-marker";
      youMarker.current = new maplibregl.Marker({ element: el }).setLngLat([position.lon, position.lat]).addTo(m);
      m.easeTo({ center: [position.lon, position.lat], duration: 400 });
    } else {
      youMarker.current.setLngLat([position.lon, position.lat]);
    }
  }, [position]);

  const recenter = () => {
    if (map.current && position) map.current.easeTo({ center: [position.lon, position.lat], zoom: 14 });
  };

  return (
    <div className="mapview">
      <div className="mapview-chips">
        {itineraries.map((it, i) => (
          <button
            key={it.signature}
            type="button"
            className={i === activeIndex ? "is-active" : ""}
            onClick={() => onActiveIndexChange(i)}
          >
            {hhmm(it.departAt)}
          </button>
        ))}
      </div>
      <div ref={container} className="mapview-canvas" />
      <div className="mapview-foot">
        <span className="mapview-status">
          {status === "denied"
            ? "Location unavailable — enable it to see yourself on the map"
            : status === "tracking"
              ? "Tracking your location"
              : "Finding your location…"}
        </span>
        <button type="button" className="mapview-recenter" onClick={recenter} disabled={!position}>
          Center on me
        </button>
      </div>
    </div>
  );
}
