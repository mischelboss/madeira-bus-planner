/** Minimal GTFS zip reader for the build script (Node only). */
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "csv-parse/sync";

export type Row = Record<string, string>;

export interface Gtfs {
  files: Set<string>;
  table(name: string): Row[];
  has(name: string): boolean;
}

export function readGtfsZip(path: string): Gtfs {
  const zip = unzipSync(readFileSync(path));
  const files = new Set(Object.keys(zip));
  const cache = new Map<string, Row[]>();
  return {
    files,
    has: (n) => files.has(n),
    table(name) {
      if (cache.has(name)) return cache.get(name)!;
      if (!files.has(name)) throw new Error(`feed is missing ${name}`);
      const text = strFromU8(zip[name]).replace(/^﻿/, "");
      const rows = parse(text, {
        columns: (h: string[]) => h.map((c) => c.trim()),
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      }) as Row[];
      cache.set(name, rows);
      return rows;
    },
  };
}

/** "HH:MM:SS" (hours may be >= 24) -> seconds from local midnight. */
export function gtfsTimeToSeconds(t: string): number {
  const m = /^(\d+):(\d{2}):(\d{2})$/.exec(t.trim());
  if (!m) throw new Error(`bad GTFS time ${JSON.stringify(t)}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

/** "YYYYMMDD" -> days since 1970-01-01 (calendar, UTC-anchored). */
export function gtfsDateToEpochDay(d: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(d.trim());
  if (!m) throw new Error(`bad GTFS date ${JSON.stringify(d)}`);
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000);
}

export function gtfsDateToISO(d: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(d.trim());
  if (!m) throw new Error(`bad GTFS date ${JSON.stringify(d)}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}
