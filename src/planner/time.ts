/** Atlantic/Madeira wall-clock helpers. All the timezone maths lives here. */

const TZ = "Atlantic/Madeira";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(utcMs: number): Wall {
  const m: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(new Date(utcMs))) m[p.type] = p.value;
  return {
    year: +m.year,
    month: +m.month,
    day: +m.day,
    hour: +m.hour,
    minute: +m.minute,
    second: +m.second,
  };
}

/** Offset (seconds) such that local wall time = utc + offset, at the given instant. */
function offsetSecAt(utcMs: number): number {
  const w = wallParts(utcMs);
  const asIfUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asIfUTC - utcMs) / 1000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" (Madeira local) for an instant. */
export function localDate(epochSec: number): string {
  const w = wallParts(epochSec * 1000);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** "YYYY-MM-DD" -> days since 1970-01-01 (calendar). */
export function epochDayFromDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function dateFromEpochDay(epochDay: number): string {
  const d = new Date(epochDay * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** UTC epoch seconds of local midnight of `date` in Madeira (DST-correct). */
export function madeiraMidnightEpochSec(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guessMs = Date.UTC(y, m - 1, d, 0, 0, 0);
  let off = offsetSecAt(guessMs) * 1000;
  let ms = guessMs - off;
  const off2 = offsetSecAt(ms) * 1000;
  if (off2 !== off) {
    off = off2;
    ms = guessMs - off;
  }
  return Math.floor(ms / 1000);
}

/** epoch seconds -> ISO 8601 with the Madeira offset, e.g. "2026-09-08T08:05:00+01:00". */
export function toMadeiraISO(epochSec: number): string {
  const w = wallParts(epochSec * 1000);
  const off = offsetSecAt(epochSec * 1000);
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  const oh = pad(Math.floor(a / 3600));
  const om = pad(Math.floor((a % 3600) / 60));
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}${sign}${oh}:${om}`;
}

export function nowEpochSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function isoToEpochSec(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}
