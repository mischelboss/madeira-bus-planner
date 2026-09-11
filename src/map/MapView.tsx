import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibreWorker.ts";
import type { FeatureCollection, LineString } from "geojson";
import type { Itinerary } from "../planner/types.ts";
import { hhmm } from "../lib/format.ts";
import { useLiveLocation } from "./useLiveLocation.ts";
import { RASTER_STYLE, legFeatures, drawLayers, type LngLat } from "./shapeLayers.ts";
import "./MapView.css";

interface Props {
  itineraries: Itinerary[];
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
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
