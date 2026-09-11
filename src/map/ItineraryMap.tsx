import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./maplibreWorker.ts";
import type { FeatureCollection, LineString } from "geojson";
import type { Itinerary } from "../planner/types.ts";
import { RASTER_STYLE, legFeatures, drawLayers, type LngLat } from "./shapeLayers.ts";
import "./ItineraryMap.css";

interface Props {
  itinerary: Itinerary;
}

/** A lightweight, single-itinerary map for an expanded result card — no
 *  live-location tracking (that stays on the full "Map" tab, MapView.tsx). */
export function ItineraryMap({ itinerary }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

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
    };
  }, []);

  // draw the itinerary
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let cancelled = false;

    legFeatures(itinerary).then(({ lines, stops }) => {
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
        if (!b.isEmpty()) m.fitBounds(b, { padding: 24, duration: 300 });
      };

      if (m.isStyleLoaded()) apply();
      else m.once("load", apply);
    });

    return () => {
      cancelled = true;
    };
  }, [itinerary]);

  return <div ref={container} className="itin-map-canvas" />;
}
