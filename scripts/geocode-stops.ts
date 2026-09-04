/**
 * Reverse-geocode every feed stop to a town/parish, cached in
 * data/geocode-cache.json (committed). Nominatim policy: <= 1 req/s, a real
 * User-Agent. Incremental — only new / moved stops are fetched.
 *
 *   npm run geocode                 # fill gaps from the snapshot feed
 *   npm run geocode -- --refresh    # also re-fetch entries older than 180 days
 *   npm run geocode -- --roads      # second pass: the street each stop is on
 *
 * The town pass queries at zoom 14, which resolves to a parish and carries no
 * street. `--roads` re-queries at zoom 17, where `address.road` is the street
 * the stop actually stands on — "AV Mar  E E M (11)" sits on "Avenida do Mar e
 * das Comunidades Madeirenses". That is what makes a readable display name
 * possible without anyone inventing one (see build-data.ts's displayName).
 *
 * Mirrors madeira-gtfs/scripts/geocode_stops.py conventions.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readGtfsZip, type Row } from "./lib/gtfs.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = resolve(ROOT, "data/feed-snapshot/latest.zip");
const CACHE = resolve(ROOT, "data/geocode-cache.json");

const UA = "madeira-bus-planner build (github.com/mischelboss/madeira-bus-planner; mischel.boss@gmail.com)";
const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const SPACING_MS = 1100;
const REFRESH_DAYS = 180;

// Nominatim occasionally mislabels a stop's parish — override by stop id.
const TOWN_OVERRIDES: Record<string, string> = {};

interface Entry {
  town?: string;
  /** street the stop stands on, from the zoom-17 pass (`--roads`) */
  road?: string;
  admin?: string;
  address?: Record<string, string>;
  displayName?: string;
  fetchedAt: string;
}

const key = (stopId: string, lat: number, lon: number) =>
  `${stopId}@${lat.toFixed(5)},${lon.toFixed(5)}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickTown(addr: Record<string, string>): string | undefined {
  return (
    addr.town ??
    addr.village ??
    addr.city ??
    addr.municipality ??
    addr.suburb ??
    addr.hamlet ??
    addr.isolated_dwelling ??
    addr.locality
  );
}

async function reverse(lat: number, lon: number, attempt = 0): Promise<Entry> {
  const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&accept-language=pt&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`status ${res.status}`);
    const j = (await res.json()) as { address?: Record<string, string>; display_name?: string };
    const addr = j.address ?? {};
    return {
      town: pickTown(addr),
      admin: addr.county ?? addr.state_district ?? addr.state,
      address: addr,
      displayName: j.display_name,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    if (attempt >= 3) throw e;
    await sleep(2000 * (attempt + 1));
    return reverse(lat, lon, attempt + 1);
  }
}

/** Zoom 17 resolves to the street rather than the parish. */
async function reverseRoad(lat: number, lon: number, attempt = 0): Promise<string | undefined> {
  const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=17&accept-language=pt&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) throw new Error(`status ${res.status}`);
    const j = (await res.json()) as { address?: Record<string, string> };
    return j.address?.road;
  } catch (e) {
    if (attempt >= 3) throw e;
    await sleep(2000 * (attempt + 1));
    return reverseRoad(lat, lon, attempt + 1);
  }
}

async function roadPass(stops: Row[], cache: Record<string, Entry>): Promise<void> {
  const todo = stops.filter((s) => {
    const hit = cache[key(s.stop_id, +s.stop_lat, +s.stop_lon)];
    return !hit || hit.road === undefined;
  });
  console.log(`roads: ${stops.length - todo.length} cached · ${todo.length} to fetch`);
  if (todo.length === 0) return;
  console.log(`~${Math.round((todo.length * SPACING_MS) / 60000)} min at ${SPACING_MS} ms/request\n`);

  let done = 0;
  for (const s of todo) {
    const k = key(s.stop_id, +s.stop_lat, +s.stop_lon);
    const road = await reverseRoad(+s.stop_lat, +s.stop_lon);
    // "" records "asked, no road here" so a re-run doesn't retry forever
    cache[k] = { ...(cache[k] ?? { fetchedAt: new Date().toISOString() }), road: road ?? "" };
    done++;
    if (done % 25 === 0 || done === todo.length) {
      save(cache);
      console.log(`  ${done}/${todo.length}  (last: ${s.stop_name} -> ${road ?? "?"})`);
    }
    await sleep(SPACING_MS);
  }
  save(cache);
  const withRoad = Object.values(cache).filter((e) => e.road).length;
  console.log(`\nroads done. ${withRoad}/${Object.keys(cache).length} entries have a street.`);
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const zipPath = process.argv.includes("--url")
    ? process.argv[process.argv.indexOf("--url") + 1]
    : SNAPSHOT;

  const gtfs = readGtfsZip(zipPath);
  const stops = gtfs.table("stops.txt").filter((s) => s.stop_lat && s.stop_lon);

  const cache: Record<string, Entry> = existsSync(CACHE)
    ? JSON.parse(readFileSync(CACHE, "utf8"))
    : {};

  if (process.argv.includes("--roads")) {
    await roadPass(stops, cache);
    return;
  }

  const cutoff = Date.now() - REFRESH_DAYS * 86_400_000;
  const todo = stops.filter((s) => {
    const k = key(s.stop_id, +s.stop_lat, +s.stop_lon);
    const hit = cache[k];
    if (!hit) return true;
    if (refresh && new Date(hit.fetchedAt).getTime() < cutoff) return true;
    return false;
  });

  console.log(`${stops.length} stops · ${stops.length - todo.length} cached · ${todo.length} to fetch`);
  if (todo.length === 0) {
    applyOverrides(cache);
    save(cache);
    return;
  }
  const eta = Math.round((todo.length * SPACING_MS) / 60000);
  console.log(`~${eta} min at ${SPACING_MS} ms/request\n`);

  let done = 0;
  for (const s of todo) {
    const k = key(s.stop_id, +s.stop_lat, +s.stop_lon);
    const entry = await reverse(+s.stop_lat, +s.stop_lon);
    cache[k] = entry;
    done++;
    if (done % 25 === 0 || done === todo.length) {
      save(cache);
      console.log(`  ${done}/${todo.length}  (last: ${s.stop_name} -> ${entry.town ?? "?"})`);
    }
    await sleep(SPACING_MS);
  }

  applyOverrides(cache);
  save(cache);
  const missing = Object.values(cache).filter((e) => !e.town).length;
  console.log(`\ndone. ${Object.keys(cache).length} entries, ${missing} without a town.`);
}

function applyOverrides(cache: Record<string, Entry>) {
  for (const [k, entry] of Object.entries(cache)) {
    const stopId = k.split("@")[0];
    if (TOWN_OVERRIDES[stopId]) entry.town = TOWN_OVERRIDES[stopId];
  }
}

function save(cache: Record<string, Entry>) {
  mkdirSync(dirname(CACHE), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(CACHE, JSON.stringify(sorted, null, 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
