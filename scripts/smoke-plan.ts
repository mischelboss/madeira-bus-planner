/** Quick end-to-end sanity check of the routing over the real built data. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTripConns, loadTimetable, search } from "../src/planner/csa.ts";
import {
  epochDayFromDate,
  dateFromEpochDay,
  madeiraMidnightEpochSec,
  toMadeiraISO,
} from "../src/planner/time.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const stops = JSON.parse(readFileSync(resolve(ROOT, "public/data/stops.json"), "utf8")) as {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
}[];
const routes = JSON.parse(readFileSync(resolve(ROOT, "public/data/routes.json"), "utf8")) as {
  shortName: string;
  operator: string;
}[];
const meta = JSON.parse(readFileSync(resolve(ROOT, "public/data/meta.json"), "utf8"));

const gz = readFileSync(resolve(ROOT, "public/data/timetable.bin.gz"));
const tt = await loadTimetable(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength));
const tc = buildTripConns(tt);

function findStop(q: string): number {
  const i = stops.findIndex((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  if (i < 0) throw new Error(`no stop matching ${q}`);
  console.log(`  "${q}" -> [${i}] ${stops[i].name}`);
  return i;
}

const fromIdx = findStop(process.argv[2] ?? "Funchal");
const toIdx = findStop(process.argv[3] ?? "Calheta");
const dateStr = process.argv[4] ?? meta.feedStartDate;
const timeSec = 8 * 3600; // 08:00 local

const startEpochDay = epochDayFromDate(dateStr);
const serviceDays = [];
for (let d = -1; d <= 4; d++) {
  const date = dateFromEpochDay(startEpochDay + d);
  serviceDays.push({ epochDay: startEpochDay + d, baseEpochSec: madeiraMidnightEpochSec(date) });
}
const departAfter = madeiraMidnightEpochSec(dateStr) + timeSec;

console.log(`\nplanning ${dateStr} 08:00  (feed ${meta.feedVersion})\n`);
const t0 = performance.now();
const res = search(tt, tc, {
  sources: [{ stopIdx: fromIdx, walkSec: 0 }],
  targets: [{ stopIdx: toIdx, walkSec: 0 }],
  serviceDays,
  departAfterEpochSec: departAfter,
  maxItineraries: 4,
  mttSec: 90,
  maxJourneySec: 6 * 3600,
});
const ms = (performance.now() - t0).toFixed(1);

console.log(`${res.itineraries.length} itineraries in ${ms} ms\n`);
for (const it of res.itineraries) {
  console.log(
    `  ${toMadeiraISO(it.departEpochSec).slice(11, 16)} → ${toMadeiraISO(it.arriveEpochSec).slice(11, 16)}` +
      `  ${Math.round((it.arriveEpochSec - it.departEpochSec) / 60)} min  ` +
      `${it.transferCount} transfer(s)${it.isLastTripToday ? "  [LAST TRIP TODAY]" : ""}`,
  );
  for (const l of it.legs) {
    if (l.mode === "walk") {
      console.log(`      walk ${Math.round(l.walkSec / 60)} min`);
    } else {
      const r = routes[l.routeIdx];
      console.log(`      ${r.operator} ${r.shortName}  ${l.stopTimes.length} stops`);
      for (const st of l.stopTimes) {
        console.log(`        ${toMadeiraISO(st.arriveEpochSec).slice(11, 16)}  ${stops[st.stopIdx].name}`);
      }
    }
  }
  console.log();
}
if (res.nextDeparture) {
  console.log(`  next departure: ${toMadeiraISO(res.nextDeparture.departEpochSec)}`);
}
