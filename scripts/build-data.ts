/**
 * GTFS feed  ->  public/data/*   (routing blob + UI JSON)
 *
 *   npm run build:data            # from the committed snapshot
 *   npm run build:data -- --url https://.../latest.zip
 *
 * Deterministic: same feed + same geocode cache => identical output => no git
 * diff. Reverse-geocoding is a separate step (scripts/geocode-stops.ts) whose
 * result is cached in data/geocode-cache.json and committed; this script only
 * reads that cache.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readGtfsZip,
  gtfsTimeToSeconds,
  gtfsDateToEpochDay,
  gtfsDateToISO,
  type Row,
} from "./lib/gtfs.ts";
import { haversineMeters } from "./lib/geo.ts";
import {
  encodeTimetable,
  epochDayFromISO,
  FLAG_PICKUP,
  FLAG_DROPOFF,
  type Header,
} from "../src/planner/timetableFormat.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/data");
const SNAPSHOT = resolve(ROOT, "data/feed-snapshot/latest.zip");
const GEOCODE_CACHE = resolve(ROOT, "data/geocode-cache.json");

const FOOT_THRESHOLD_M = 150;
const FOOT_CLOSURE_M = 400;
const WALK_MPS = 1.1;
const DETOUR = 1.3;
const MIN_WALK_S = 60;

const OPERATORS = ["HF", "RODOESTE", "CAM", "AEROBUS"] as const;
type OperatorId = (typeof OPERATORS)[number];

// agency_id in the feed -> our canonical operator id
function toOperator(agencyId: string, agencyName: string): OperatorId {
  const s = `${agencyId} ${agencyName}`.toUpperCase();
  if (s.includes("RODOESTE")) return "RODOESTE";
  if (s.includes("AEROBUS")) return "AEROBUS";
  if (s.includes("CAM")) return "CAM";
  return "HF";
}

const OPERATOR_FALLBACK_COLOR: Record<OperatorId, { color: string; text: string }> = {
  HF: { color: "3B7A57", text: "FFFFFF" },
  RODOESTE: { color: "C25E00", text: "FFFFFF" },
  CAM: { color: "8A8A00", text: "FFFFFF" },
  AEROBUS: { color: "5B3FA0", text: "FFFFFF" },
};

function contrastText(hex: string): string {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return "FFFFFF";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? "000000" : "FFFFFF";
}

function normColor(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const h = v.trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(h) ? h : undefined;
}

function decodePolyline(rows: Row[]): number[][] {
  return rows
    .map((r) => ({
      seq: +r.shape_pt_sequence,
      lon: +r.shape_pt_lon,
      lat: +r.shape_pt_lat,
    }))
    .sort((a, b) => a.seq - b.seq)
    .map((p) => [round6(p.lon), round6(p.lat)]);
}
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function assertShape(gtfs: ReturnType<typeof readGtfsZip>): void {
  const problems: string[] = [];
  if (gtfs.has("calendar.txt")) problems.push("feed has calendar.txt — this build assumes calendar_dates only");
  if (!gtfs.has("calendar_dates.txt")) problems.push("feed has no calendar_dates.txt");
  else {
    const bad = gtfs.table("calendar_dates.txt").find((r) => r.exception_type !== "1");
    if (bad) problems.push(`calendar_dates has exception_type ${bad.exception_type} (expected only 1)`);
  }
  const info = gtfs.table("feed_info.txt")[0];
  if (!info?.feed_start_date || !info?.feed_end_date) problems.push("feed_info missing feed_start_date / feed_end_date");
  const st = gtfs.table("stop_times.txt");
  const badTime = st.find((r) => !/^\d+:\d{2}:\d{2}$/.test(r.departure_time || r.arrival_time));
  if (badTime) problems.push(`stop_times has a malformed time: ${badTime.departure_time || badTime.arrival_time}`);
  if (problems.length) {
    throw new Error("feed shape assertions failed:\n  - " + problems.join("\n  - "));
  }
}

const FEED_URL =
  process.env.GTFS_FEED_URL ||
  "https://github.com/mischelboss/madeira-gtfs/releases/download/latest/latest.zip";

async function main() {
  const args = process.argv.slice(2);
  const urlArg = args[args.indexOf("--url") + 1];
  const src = args.includes("--url")
    ? urlArg
    : existsSync(SNAPSHOT)
      ? SNAPSHOT
      : FEED_URL;

  let zipPath = src;
  if (/^https?:/.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    zipPath = resolve(ROOT, "data/feed-snapshot/latest.zip");
    mkdirSync(dirname(zipPath), { recursive: true });
    writeFileSync(zipPath, buf);
    console.log(`fetched ${src} -> ${zipPath} (${buf.length} bytes)`);
  }

  const gtfs = readGtfsZip(zipPath);
  assertShape(gtfs);

  const feedInfo = gtfs.table("feed_info.txt")[0];
  const feedVersion = feedInfo.feed_version;
  const feedStartDate = gtfsDateToISO(feedInfo.feed_start_date);
  const feedEndDate = gtfsDateToISO(feedInfo.feed_end_date);
  const feedStartEpochDay = epochDayFromISO(feedStartDate);
  const feedEndEpochDay = epochDayFromISO(feedEndDate);
  const horizonDays = feedEndEpochDay - feedStartEpochDay + 1;

  // ---- agencies ----
  const agencyById = new Map<string, Row>();
  for (const a of gtfs.table("agency.txt")) agencyById.set(a.agency_id, a);

  // ---- dense stop index ----
  const stopRows = gtfs.table("stops.txt").filter((s) => s.stop_lat && s.stop_lon);
  stopRows.sort((a, b) => a.stop_id.localeCompare(b.stop_id));
  const stopIdx = new Map<string, number>();
  stopRows.forEach((s, i) => stopIdx.set(s.stop_id, i));
  const nStops = stopRows.length;

  const geocode: Record<string, { town?: string; address?: Record<string, string> }> =
    existsSync(GEOCODE_CACHE) ? JSON.parse(readFileSync(GEOCODE_CACHE, "utf8")) : {};
  let missingTowns = 0;
  const stopsJson = stopRows.map((s) => {
    const key = geoKey(s.stop_id, +s.stop_lat, +s.stop_lon);
    const town = geocode[key]?.town;
    if (!town) missingTowns++;
    return {
      stopId: s.stop_id,
      name: s.stop_name,
      ...(town ? { town } : {}),
      ...(s.stop_code ? { code: s.stop_code } : {}),
      at: { lat: round6(+s.stop_lat), lon: round6(+s.stop_lon) },
    };
  });

  // ---- dense route index ----
  const routeRows = gtfs.table("routes.txt").slice();
  routeRows.sort((a, b) => a.route_id.localeCompare(b.route_id));
  const routeIdx = new Map<string, number>();
  routeRows.forEach((r, i) => routeIdx.set(r.route_id, i));
  const nRoutes = routeRows.length;

  const routesJson = routeRows.map((r) => {
    const agency = agencyById.get(r.agency_id);
    const operator = toOperator(r.agency_id, agency?.agency_name ?? "");
    let color = normColor(r.route_color);
    let textColor = normColor(r.route_text_color);
    if (!color) {
      color = OPERATOR_FALLBACK_COLOR[operator].color;
      textColor = OPERATOR_FALLBACK_COLOR[operator].text;
    } else if (!textColor) {
      textColor = contrastText(color);
    }
    return {
      routeId: r.route_id,
      shortName: r.route_short_name || r.route_id,
      longName: r.route_long_name || "",
      operator,
      operatorName: agency?.agency_name ?? operator,
      color,
      textColor,
    };
  });

  const agenciesJson = OPERATORS.map((op) => {
    const row = [...agencyById.values()].find(
      (a) => toOperator(a.agency_id, a.agency_name) === op,
    );
    return { operator: op, name: row?.agency_name ?? op, url: row?.agency_url ?? "" };
  }).filter((a) => routesJson.some((r) => r.operator === a.operator));

  // ---- dense service index + active-date bitmaps ----
  const serviceIdx = new Map<string, number>();
  for (const cd of gtfs.table("calendar_dates.txt")) {
    if (!serviceIdx.has(cd.service_id)) serviceIdx.set(cd.service_id, serviceIdx.size);
  }
  const nServices = serviceIdx.size;
  const stride = Math.ceil(horizonDays / 8);
  const serviceActive = new Uint8Array(nServices * stride);
  for (const cd of gtfs.table("calendar_dates.txt")) {
    const si = serviceIdx.get(cd.service_id)!;
    const d = gtfsDateToEpochDay(cd.date) - feedStartEpochDay;
    if (d < 0 || d >= horizonDays) continue;
    serviceActive[si * stride + (d >> 3)] |= 1 << (d & 7);
  }

  // ---- dense trip index ----
  const tripRows = gtfs.table("trips.txt").slice();
  tripRows.sort((a, b) => a.trip_id.localeCompare(b.trip_id));
  const tripIdx = new Map<string, number>();
  tripRows.forEach((t, i) => tripIdx.set(t.trip_id, i));
  const nTrips = tripRows.length;

  const headsigns: string[] = [];
  const headsignIdx = new Map<string, number>();
  const internHeadsign = (s: string) => {
    let i = headsignIdx.get(s);
    if (i === undefined) {
      i = headsigns.length;
      headsigns.push(s);
      headsignIdx.set(s, i);
    }
    return i;
  };

  const tRoute = new Uint16Array(nTrips);
  const tService = new Uint16Array(nTrips);
  const tDirection = new Uint8Array(nTrips);
  const tHeadsign = new Uint16Array(nTrips);
  const tShapeId: (string | null)[] = new Array(nTrips).fill(null);
  tripRows.forEach((t, i) => {
    tRoute[i] = routeIdx.get(t.route_id) ?? 0;
    tService[i] = serviceIdx.get(t.service_id) ?? 0;
    tDirection[i] = t.direction_id === "0" ? 0 : t.direction_id === "1" ? 1 : 255;
    const route = routesJson[tRoute[i]];
    tHeadsign[i] = internHeadsign(t.trip_headsign || route.longName || route.shortName);
    tShapeId[i] = t.shape_id || null;
  });

  // ---- connections ----
  interface Conn {
    depStop: number;
    arrStop: number;
    depTime: number;
    arrTime: number;
    trip: number;
    flags: number;
    seq: number;
  }
  const stByTrip = new Map<number, Row[]>();
  for (const r of gtfs.table("stop_times.txt")) {
    const ti = tripIdx.get(r.trip_id);
    if (ti === undefined) continue;
    (stByTrip.get(ti) ?? stByTrip.set(ti, []).get(ti)!).push(r);
  }

  const conns: Conn[] = [];
  for (const [ti, rows] of stByTrip) {
    rows.sort((a, b) => +a.stop_sequence - +b.stop_sequence);
    const seq = rows
      .map((r) => ({
        si: stopIdx.get(r.stop_id),
        dep: gtfsTimeToSeconds(r.departure_time || r.arrival_time),
        arr: gtfsTimeToSeconds(r.arrival_time || r.departure_time),
        pickup: r.pickup_type !== "1",
        dropoff: r.drop_off_type !== "1",
      }))
      .filter((x) => x.si !== undefined) as {
      si: number;
      dep: number;
      arr: number;
      pickup: boolean;
      dropoff: boolean;
    }[];
    const list: Conn[] = [];
    for (let k = 0; k + 1 < seq.length; k++) {
      const a = seq[k];
      const b = seq[k + 1];
      if (b.arr < a.dep) continue; // non-monotonic; drop the pair
      list.push({
        depStop: a.si,
        arrStop: b.si,
        depTime: a.dep,
        arrTime: b.arr,
        trip: ti,
        flags: (a.pickup ? FLAG_PICKUP : 0) | (b.dropoff ? FLAG_DROPOFF : 0),
        seq: k,
      });
    }
    conns.push(...list);
  }

  conns.sort((a, b) => a.depTime - b.depTime || a.arrTime - b.arrTime);
  const nConn = conns.length;

  const cDepStop = new Uint16Array(nConn);
  const cArrStop = new Uint16Array(nConn);
  const cDepTime = new Int32Array(nConn);
  const cArrTime = new Int32Array(nConn);
  const cTrip = new Uint16Array(nConn);
  const cFlags = new Uint8Array(nConn);
  const cSeq = new Uint8Array(nConn);
  conns.forEach((c, i) => {
    cDepStop[i] = c.depStop;
    cArrStop[i] = c.arrStop;
    cDepTime[i] = c.depTime;
    cArrTime[i] = c.arrTime;
    cTrip[i] = c.trip;
    cFlags[i] = c.flags;
    cSeq[i] = Math.min(c.seq, 255);
  });

  // ---- footpaths (brute force; 1839^2 haversines ~ fine) ----
  type Edge = { to: number; walk: number };
  const adj150: Edge[][] = Array.from({ length: nStops }, () => []);
  for (let i = 0; i < nStops; i++) {
    const s = stopsJson[i];
    for (let j = i + 1; j < nStops; j++) {
      const t = stopsJson[j];
      const d = haversineMeters(s.at.lat, s.at.lon, t.at.lat, t.at.lon);
      if (d <= FOOT_THRESHOLD_M) {
        const w = Math.max(MIN_WALK_S, Math.round((d * DETOUR) / WALK_MPS));
        adj150[i].push({ to: j, walk: w });
        adj150[j].push({ to: i, walk: w });
      }
    }
  }
  // transitive closure per stop, bounded by FOOT_CLOSURE_M cumulative distance
  const closureWalkCap = Math.round((FOOT_CLOSURE_M * DETOUR) / WALK_MPS);
  const footOffset = new Uint32Array(nStops + 1);
  const footTarget: number[] = [];
  const footWalk: number[] = [];
  for (let s = 0; s < nStops; s++) {
    const best = new Map<number, number>();
    const stack: [number, number][] = [[s, 0]];
    while (stack.length) {
      const [u, wsofar] = stack.pop()!;
      for (const e of adj150[u]) {
        const nw = wsofar + e.walk;
        if (e.to === s || nw > closureWalkCap) continue;
        if ((best.get(e.to) ?? Infinity) <= nw) continue;
        best.set(e.to, nw);
        stack.push([e.to, nw]);
      }
    }
    for (const [to, w] of [...best].sort((a, b) => a[0] - b[0])) {
      footTarget.push(to);
      footWalk.push(Math.min(w, 65535));
    }
    footOffset[s + 1] = footTarget.length;
  }

  // ---- shapes.json ----
  const shapesJson: Record<string, number[][]> = {};
  if (gtfs.has("shapes.txt")) {
    const byShape = new Map<string, Row[]>();
    for (const r of gtfs.table("shapes.txt")) {
      (byShape.get(r.shape_id) ?? byShape.set(r.shape_id, []).get(r.shape_id)!).push(r);
    }
    const used = new Set(tShapeId.filter(Boolean) as string[]);
    for (const id of used) {
      const rows = byShape.get(id);
      if (rows) shapesJson[id] = decodePolyline(rows);
    }
  }
  const routeShapeId: Record<string, string | null> = {};
  for (let ti = 0; ti < nTrips; ti++) {
    const rid = routesJson[tRoute[ti]].routeId;
    if (routeShapeId[rid] == null && tShapeId[ti]) routeShapeId[rid] = tShapeId[ti];
  }

  // ---- browse.json (route catalogue for the Browse tab) ----
  // Region clusters map real municipalities to the coarse geography the design
  // asks for. The prototype hardcoded 4 sample clusters; this derives them from
  // the reverse-geocoded municipality of each route's two endpoints.
  //
  // The network is radial — almost every route touches Funchal — so a route is
  // filed under the region of its *outermost* endpoint (Funchal & Câmara de
  // Lobos being the hub region). A route that links two different outer regions
  // without a hub endpoint is "interregional".
  const MUNI_FIX: Record<string, string> = {
    Caniço: "Santa Cruz",
    "Curral das Freiras": "Câmara de Lobos",
  };
  const REGION_DEFS: { id: string; name: string; munis: string[] }[] = [
    { id: "funchal", name: "Funchal & Around", munis: ["Funchal", "Câmara de Lobos"] },
    {
      id: "west",
      name: "West Coast",
      munis: ["Ribeira Brava", "Ponta do Sol", "Calheta", "Porto Moniz"],
    },
    { id: "north", name: "North", munis: ["São Vicente", "Santana"] },
    { id: "east", name: "East", munis: ["Santa Cruz", "Machico"] },
  ];
  const regionOfMuni = new Map<string, string>();
  for (const r of REGION_DEFS) for (const m of r.munis) regionOfMuni.set(m, r.id);

  const municipalityOf = (stopId: string, lat: number, lon: number): string | undefined => {
    const g = geocode[geoKey(stopId, lat, lon)];
    const a = g?.address ?? {};
    const raw = a.municipality || a.city || a.town || a.village || g?.town;
    return raw ? (MUNI_FIX[raw] ?? raw) : undefined;
  };

  const stopRowById = new Map(stopRows.map((s) => [s.stop_id, s]));
  const serviceActiveOnDay = (si: number, epochDay: number): boolean => {
    const d = epochDay - feedStartEpochDay;
    if (d < 0 || d >= horizonDays) return false;
    return (serviceActive[si * stride + (d >> 3)] & (1 << (d & 7))) !== 0;
  };

  // sample every day of the horizon, split weekday / weekend
  const sampleDays: { epochDay: number; weekend: boolean }[] = [];
  for (let d = 0; d < horizonDays; d++) {
    const ed = feedStartEpochDay + d;
    const dow = (ed + 4) % 7; // 1970-01-01 was a Thursday; 0 = Sun … 6 = Sat
    sampleDays.push({ epochDay: ed, weekend: dow === 0 || dow === 6 });
  }

  const fmtClock = (sec: number): string => {
    const h = Math.floor(sec / 3600) % 24;
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  interface ServiceWindow {
    first: string;
    last: string;
    frequencyMin: number | null;
  }
  const serviceWindow = (tripIdxs: number[], weekend: boolean): ServiceWindow | null => {
    // representative day = the sample day of this kind with the most active trips
    let bestDeps: number[] | null = null;
    for (const s of sampleDays) {
      if (s.weekend !== weekend) continue;
      const deps: number[] = [];
      for (const ti of tripIdxs) {
        if (!serviceActiveOnDay(tService[ti], s.epochDay)) continue;
        const st = stByTrip.get(ti);
        if (!st?.length) continue;
        deps.push(gtfsTimeToSeconds(st[0].departure_time || st[0].arrival_time));
      }
      if (deps.length && (!bestDeps || deps.length > bestDeps.length)) bestDeps = deps;
    }
    if (!bestDeps) return null;
    const deps = bestDeps.slice().sort((a, b) => a - b);
    let frequencyMin: number | null = null;
    if (deps.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < deps.length; i++) gaps.push(deps[i] - deps[i - 1]);
      gaps.sort((a, b) => a - b);
      const mins = Math.round(gaps[gaps.length >> 1] / 60);
      frequencyMin = mins >= 8 ? Math.round(mins / 5) * 5 : mins || null;
    }
    return { first: fmtClock(deps[0]), last: fmtClock(deps[deps.length - 1]), frequencyMin };
  };

  const municipalityLabel = (s: Row): string =>
    municipalityOf(s.stop_id, +s.stop_lat, +s.stop_lon) ??
    s.stop_name.split(/\s+[-–—]\s+/)[0].trim();

  const titleCase = (s: string): string =>
    s
      .toLowerCase()
      .replace(/(^|[\s/(-])([a-zà-ÿ])/g, (_, p: string, c: string) => p + c.toUpperCase())
      // lower-case Portuguese particles mid-phrase
      .replace(/(?!^)\b(Da|De|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase());
  const cleanTerminus = (s: string): string =>
    s
      .replace(/[–—]/g, "-")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s+via\s+.*$/i, "")
      .trim();

  // "{Origin} ↔ {Destination}" for a route. The operator's own route name
  // (route_long_name) is authoritative — often already "A - B"; HF names carry
  // just the terminus. Fall back to the reverse-geocoded municipalities.
  const endpointLabels = (long: string, a: Row, b: Row): [string, string] => {
    const parts = cleanTerminus(long)
      .split(/\s+-\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) return [titleCase(parts[0]), titleCase(parts[parts.length - 1])];
    const [ma, mb] = [municipalityLabel(a), municipalityLabel(b)];
    const term = parts[0] ? titleCase(parts[0]) : "";
    if (term && term.toLowerCase() !== ma.toLowerCase()) return [ma, term];
    return [ma, mb];
  };

  interface BrowseRoute {
    routeId: string;
    shortName: string;
    operator: OperatorId;
    operatorName: string;
    origin: string;
    destination: string;
    stops: { name: string; lat: number; lon: number }[];
    weekday: ServiceWindow | null;
    weekend: ServiceWindow | null;
  }
  const browseRoutes: Record<string, BrowseRoute> = {};
  const routeRegion = new Map<string, string | null>();

  for (let ri = 0; ri < nRoutes; ri++) {
    const route = routesJson[ri];
    const tripIdxs: number[] = [];
    for (let ti = 0; ti < nTrips; ti++) if (tRoute[ti] === ri) tripIdxs.push(ti);
    if (!tripIdxs.length) continue;

    // representative pattern = the trip visiting the most stops (ties: lowest index)
    let repTi = tripIdxs[0];
    let repLen = stByTrip.get(repTi)?.length ?? 0;
    for (const ti of tripIdxs) {
      const len = stByTrip.get(ti)?.length ?? 0;
      if (len > repLen) {
        repLen = len;
        repTi = ti;
      }
    }
    const repStops = (stByTrip.get(repTi) ?? [])
      .map((r) => stopRowById.get(r.stop_id))
      .filter((s): s is Row => !!s);
    if (repStops.length < 2) continue;

    const originStop = repStops[0];
    // a true loop (returns to its first stop) — use the far point for geo/region
    const lastStop = repStops[repStops.length - 1];
    const destStop =
      lastStop.stop_id === originStop.stop_id
        ? repStops[repStops.length >> 1] ?? lastStop
        : lastStop;
    const [originLabel, destLabel] = endpointLabels(
      route.longName || "",
      originStop,
      destStop,
    );
    browseRoutes[route.routeId] = {
      routeId: route.routeId,
      shortName: route.shortName,
      operator: route.operator,
      operatorName: route.operatorName,
      origin: originLabel,
      destination: destLabel,
      stops: repStops.map((s) => ({
        name: s.stop_name,
        lat: round6(+s.stop_lat),
        lon: round6(+s.stop_lon),
      })),
      weekday: serviceWindow(tripIdxs, false),
      weekend: serviceWindow(tripIdxs, true),
    };

    const ends = [originStop, destStop].map((s) =>
      regionOfMuni.get(municipalityOf(s.stop_id, +s.stop_lat, +s.stop_lon) ?? ""),
    );
    const outer = [...new Set(ends.filter((r) => r && r !== "funchal"))];
    routeRegion.set(
      route.routeId,
      outer.length === 0 ? "funchal" : outer.length === 1 ? outer[0]! : null,
    );
  }

  const sortRouteIds = (ids: string[]): string[] =>
    ids.slice().sort((a, b) => {
      const na = parseInt(browseRoutes[a].shortName, 10);
      const nb = parseInt(browseRoutes[b].shortName, 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return browseRoutes[a].shortName.localeCompare(browseRoutes[b].shortName);
    });

  const browseJson = {
    regions: REGION_DEFS.map((r) => ({
      id: r.id,
      name: r.name,
      routeIds: sortRouteIds(Object.keys(browseRoutes).filter((id) => routeRegion.get(id) === r.id)),
    })).filter((r) => r.routeIds.length),
    interregionalRouteIds: sortRouteIds(
      Object.keys(browseRoutes).filter((id) => !routeRegion.get(id)),
    ),
    routes: browseRoutes,
    operators: agenciesJson.map((a) => ({ code: a.operator, name: a.name })),
  };

  // ---- write ----
  mkdirSync(OUT, { recursive: true });

  const header: Header = {
    feedStartEpochDay,
    feedEndEpochDay,
    nStops,
    nRoutes,
    nTrips,
    nServices,
    nConnections: nConn,
    nFootEdges: footTarget.length,
    serviceStrideBytes: stride,
  };
  const bin = encodeTimetable(header, {
    cDepStop,
    cArrStop,
    cDepTime,
    cArrTime,
    cTrip,
    cFlags,
    cSeq,
    tRoute,
    tService,
    tDirection,
    tHeadsign,
    serviceActive,
    sLat: Float32Array.from(stopsJson.map((s) => s.at.lat)),
    sLon: Float32Array.from(stopsJson.map((s) => s.at.lon)),
    footOffset,
    footTarget: Uint16Array.from(footTarget),
    footWalk: Uint16Array.from(footWalk),
  });
  writeFileSync(resolve(OUT, "timetable.bin.gz"), gzipSync(Buffer.from(bin), { level: 9 }));

  writeJson("stops.json", stopsJson);
  writeJson("routes.json", routesJson);
  writeJson("agencies.json", agenciesJson);
  writeJson("headsigns.json", headsigns);
  writeJson("shapes.json", shapesJson);
  writeJson("route-shapes.json", routeShapeId);
  writeJson("browse.json", browseJson);
  writeJson("meta.json", {
    feedVersion,
    feedStartDate,
    feedEndDate,
    builtAt: new Date().toISOString(),
    counts: {
      stops: nStops,
      routes: nRoutes,
      trips: nTrips,
      services: nServices,
      connections: nConn,
      footEdges: footTarget.length,
      shapedRoutes: Object.values(routeShapeId).filter(Boolean).length,
      browseRoutes: Object.keys(browseJson.routes).length,
    },
  });

  console.log(
    [
      `feed ${feedVersion}  horizon ${feedStartDate} .. ${feedEndDate} (${horizonDays}d)`,
      `stops ${nStops}  routes ${nRoutes}  trips ${nTrips}  services ${nServices}`,
      `connections ${nConn}  foot edges ${footTarget.length}`,
      `timetable.bin.gz ${(bin.byteLength / 1e6).toFixed(2)} MB raw`,
      `towns: ${nStops - missingTowns}/${nStops} geocoded` +
        (missingTowns ? `  (run: npm run geocode)` : ""),
      `shaped routes ${Object.values(routeShapeId).filter(Boolean).length}/${nRoutes}`,
      `browse: ${Object.keys(browseJson.routes).length} routes, ` +
        `${browseJson.regions.length} regions, ${browseJson.interregionalRouteIds.length} interregional`,
    ].join("\n"),
  );
}

function geoKey(stopId: string, lat: number, lon: number): string {
  return `${stopId}@${lat.toFixed(5)},${lon.toFixed(5)}`;
}

function writeJson(name: string, data: unknown): void {
  writeFileSync(resolve(OUT, name), JSON.stringify(data));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
