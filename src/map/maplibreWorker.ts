/**
 * maplibre-gl v6 locates its parsing worker at runtime with
 * `new URL("maplibre-gl-worker.mjs", import.meta.url)` — a bare string no
 * bundler can see, so Vite never emits the file and the request 404s in a
 * production build. Without that worker MapLibre cannot parse GeoJSON sources:
 * the raster basemap still draws (raster decodes on the main thread), but every
 * line/circle layer silently stays empty. Nothing throws.
 *
 * `?worker&url` makes Vite build the worker properly (it has its own imports,
 * so a raw file copy would break) and hand back the hashed URL.
 *
 * Import this module before constructing any `maplibregl.Map`.
 */
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
