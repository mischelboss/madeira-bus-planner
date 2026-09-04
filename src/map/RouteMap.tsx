import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection } from "geojson";
import type { BrowseStop } from "../lib/browseData.ts";
import { routeShape } from "../lib/routeShapes.ts";
import { useLiveLocation } from "./useLiveLocation.ts";
import "./MapView.css";

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

/** Standalone map for one route: its real shape (or a bead-string through the
 *  stops when the feed has none) + stop markers + live "you". */
export function RouteMap({
  routeId,
  stops,
  color,
}: {
  routeId: string;
  stops: BrowseStop[];
  color: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const youMarker = useRef<maplibregl.Marker | null>(null);
  const { position, status } = useLiveLocation(true);

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

  useEffect(() => {
    const m = map.current;
    if (!m || stops.length < 2) return;
    let cancelled = false;

    routeShape(routeId).then((shape) => {
      if (cancelled || map.current !== m) return;
      const path: LngLat[] =
        shape && shape.length >= 2 ? shape : stops.map((s) => [s.lon, s.lat]);

      const line: Feature = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: path },
        properties: {},
      };
      const points: Feature[] = stops.map((s, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: {
          kind: i === 0 ? "origin" : i === stops.length - 1 ? "dest" : "mid",
          name: s.name,
        },
      }));

      const apply = () => {
        const lineData: FeatureCollection = { type: "FeatureCollection", features: [line] };
        const stopData: FeatureCollection = { type: "FeatureCollection", features: points };
        if (m.getSource("route")) {
          (m.getSource("route") as maplibregl.GeoJSONSource).setData(lineData);
          (m.getSource("stops") as maplibregl.GeoJSONSource).setData(stopData);
        } else {
          m.addSource("route", { type: "geojson", data: lineData });
          m.addSource("stops", { type: "geojson", data: stopData });
          m.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": color, "line-width": 4 },
          });
          m.addLayer({
            id: "stop-dots",
            type: "circle",
            source: "stops",
            paint: {
              "circle-radius": ["match", ["get", "kind"], "origin", 7, "dest", 7, 4],
              "circle-color": [
                "match",
                ["get", "kind"],
                "origin",
                "#3a9a6b",
                "dest",
                "#e8603c",
                "#a9c9b8",
              ],
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 2,
            },
          });
        }
        const b = new maplibregl.LngLatBounds();
        path.forEach((c) => b.extend(c));
        if (!b.isEmpty()) m.fitBounds(b, { padding: 36, duration: 300 });
      };

      if (m.isStyleLoaded()) apply();
      else m.once("load", apply);
    });

    return () => {
      cancelled = true;
    };
  }, [routeId, stops, color]);

  useEffect(() => {
    const m = map.current;
    if (!m || !position) return;
    if (!youMarker.current) {
      const el = document.createElement("div");
      el.className = "you-marker";
      youMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([position.lon, position.lat])
        .addTo(m);
    } else {
      youMarker.current.setLngLat([position.lon, position.lat]);
    }
  }, [position]);

  const recenter = () => {
    if (map.current && position) map.current.easeTo({ center: [position.lon, position.lat], zoom: 14 });
  };

  return (
    <div className="mapview">
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
