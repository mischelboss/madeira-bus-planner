import { useEffect, useState } from "react";
import type { LatLon } from "../planner/types.ts";

export type LocationStatus = "idle" | "locating" | "tracking" | "denied";

/** watchPosition — mounted only while the map view is open. */
export function useLiveLocation(active: boolean) {
  const [position, setPosition] = useState<LatLon | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");

  useEffect(() => {
    if (!active || !navigator.geolocation) {
      setStatus("idle");
      return;
    }
    setStatus("locating");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setStatus("tracking");
      },
      () => setStatus("denied"),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  return { position, status };
}
