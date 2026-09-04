/**
 * Binary layout of `public/data/timetable.bin` — the routing blob.
 * Shared verbatim by `scripts/build-data.ts` (writer) and `csa.worker.ts`
 * (reader). No DOM / Node APIs so it loads in both.
 *
 * All little-endian. One header, then fixed-order sections, each a typed-array
 * view over the single backing `ArrayBuffer` (zero copy on read).
 *
 * The worker is purely numeric: it never sees a GTFS string id or a timezone.
 * Stop / route / headsign strings live in the sibling JSON files, index-aligned
 * with the dense `0..N-1` indices used here; `LocalPlanner` hydrates them.
 */

export const MAGIC = 0x3150424d; // "MBP1"
export const FORMAT_VERSION = 1;

/** Section order — the index into the section table. */
export const SECTIONS = [
  "cDepStop", // Uint16[nConn]  boarding stop idx
  "cArrStop", // Uint16[nConn]  alighting stop idx
  "cDepTime", // Int32[nConn]   seconds from service-day local midnight (may be >= 86400)
  "cArrTime", // Int32[nConn]
  "cTrip", // Uint16[nConn]  trip idx
  "cFlags", // Uint8[nConn]   bit0 pickup, bit1 dropoff
  "cSeq", // Uint8[nConn]   position of the departing stop within its trip (0-based)
  "tRoute", // Uint16[nTrips]
  "tService", // Uint16[nTrips]
  "tDirection", // Uint8[nTrips]  0 | 1 | 255 unknown
  "tHeadsign", // Uint16[nTrips] headsign string idx
  "serviceActive", // Uint8[nServices * strideBytes] bitset over [feedStart, feedEnd]
  "sLat", // Float32[nStops]
  "sLon", // Float32[nStops]
  "footOffset", // Uint32[nStops + 1]  CSR row pointers
  "footTarget", // Uint16[nFootEdges]
  "footWalk", // Uint16[nFootEdges]   walk seconds
] as const;

export type SectionName = (typeof SECTIONS)[number];

export const FLAG_PICKUP = 1;
export const FLAG_DROPOFF = 2;

export interface Header {
  feedStartEpochDay: number;
  feedEndEpochDay: number;
  nStops: number;
  nRoutes: number;
  nTrips: number;
  nServices: number;
  nConnections: number;
  nFootEdges: number;
  serviceStrideBytes: number;
}

const HEADER_BYTES = 128;

export interface Timetable extends Header {
  cDepStop: Uint16Array;
  cArrStop: Uint16Array;
  cDepTime: Int32Array;
  cArrTime: Int32Array;
  cTrip: Uint16Array;
  cFlags: Uint8Array;
  cSeq: Uint8Array;
  tRoute: Uint16Array;
  tService: Uint16Array;
  tDirection: Uint8Array;
  tHeadsign: Uint16Array;
  serviceActive: Uint8Array;
  sLat: Float32Array;
  sLon: Float32Array;
  footOffset: Uint32Array;
  footTarget: Uint16Array;
  footWalk: Uint16Array;
}

interface SectionSource {
  cDepStop: Uint16Array;
  cArrStop: Uint16Array;
  cDepTime: Int32Array;
  cArrTime: Int32Array;
  cTrip: Uint16Array;
  cFlags: Uint8Array;
  cSeq: Uint8Array;
  tRoute: Uint16Array;
  tService: Uint16Array;
  tDirection: Uint8Array;
  tHeadsign: Uint16Array;
  serviceActive: Uint8Array;
  sLat: Float32Array;
  sLon: Float32Array;
  footOffset: Uint32Array;
  footTarget: Uint16Array;
  footWalk: Uint16Array;
}

const align4 = (n: number) => (n + 3) & ~3;

/** Build the single `ArrayBuffer`. */
export function encodeTimetable(header: Header, sections: SectionSource): ArrayBuffer {
  const tableBytes = SECTIONS.length * 8;
  let offset = align4(HEADER_BYTES + tableBytes);

  const layout: { off: number; len: number }[] = [];
  for (const name of SECTIONS) {
    const view = sections[name] as ArrayBufferView;
    const len = view.byteLength;
    layout.push({ off: offset, len });
    offset = align4(offset + len);
  }

  const buf = new ArrayBuffer(offset);
  const dv = new DataView(buf);
  const bytes = new Uint8Array(buf);

  dv.setUint32(0, MAGIC, true);
  dv.setUint16(4, FORMAT_VERSION, true);
  dv.setInt32(8, header.feedStartEpochDay, true);
  dv.setInt32(12, header.feedEndEpochDay, true);
  dv.setUint32(16, header.nStops, true);
  dv.setUint32(20, header.nRoutes, true);
  dv.setUint32(24, header.nTrips, true);
  dv.setUint32(28, header.nServices, true);
  dv.setUint32(32, header.nConnections, true);
  dv.setUint32(36, header.nFootEdges, true);
  dv.setUint32(40, header.serviceStrideBytes, true);

  SECTIONS.forEach((name, i) => {
    const { off, len } = layout[i];
    dv.setUint32(HEADER_BYTES + i * 8, off, true);
    dv.setUint32(HEADER_BYTES + i * 8 + 4, len, true);
    const view = sections[name] as ArrayBufferView;
    bytes.set(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      off,
    );
  });

  return buf;
}

const TA: Record<SectionName, { ctor: typeof Uint16Array | typeof Int32Array | typeof Uint8Array | typeof Uint32Array | typeof Float32Array }> = {
  cDepStop: { ctor: Uint16Array },
  cArrStop: { ctor: Uint16Array },
  cDepTime: { ctor: Int32Array },
  cArrTime: { ctor: Int32Array },
  cTrip: { ctor: Uint16Array },
  cFlags: { ctor: Uint8Array },
  cSeq: { ctor: Uint8Array },
  tRoute: { ctor: Uint16Array },
  tService: { ctor: Uint16Array },
  tDirection: { ctor: Uint8Array },
  tHeadsign: { ctor: Uint16Array },
  serviceActive: { ctor: Uint8Array },
  sLat: { ctor: Float32Array },
  sLon: { ctor: Float32Array },
  footOffset: { ctor: Uint32Array },
  footTarget: { ctor: Uint16Array },
  footWalk: { ctor: Uint16Array },
};

/** Views over `buf` — hold `buf` for the reader's lifetime. */
export function decodeTimetable(buf: ArrayBuffer): Timetable {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error("timetable.bin: bad magic");
  if (dv.getUint16(4, true) !== FORMAT_VERSION) throw new Error("timetable.bin: version mismatch");

  const header: Header = {
    feedStartEpochDay: dv.getInt32(8, true),
    feedEndEpochDay: dv.getInt32(12, true),
    nStops: dv.getUint32(16, true),
    nRoutes: dv.getUint32(20, true),
    nTrips: dv.getUint32(24, true),
    nServices: dv.getUint32(28, true),
    nConnections: dv.getUint32(32, true),
    nFootEdges: dv.getUint32(36, true),
    serviceStrideBytes: dv.getUint32(40, true),
  };

  const out = { ...header } as Timetable;
  SECTIONS.forEach((name, i) => {
    const off = dv.getUint32(HEADER_BYTES + i * 8, true);
    const len = dv.getUint32(HEADER_BYTES + i * 8 + 4, true);
    const ctor = TA[name].ctor;
    // deno-lint-ignore no-explicit-any
    (out as any)[name] = new ctor(buf, off, len / ctor.BYTES_PER_ELEMENT);
  });
  return out;
}

/** Days since 1970-01-01 for a "YYYY-MM-DD" string (UTC-anchored, calendar only). */
export function epochDayFromISO(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Is `serviceIdx` active on `epochDay`? Out-of-horizon => false (the "beyond horizon" behaviour). */
export function serviceActiveOn(
  tt: Pick<Timetable, "serviceActive" | "serviceStrideBytes" | "feedStartEpochDay" | "feedEndEpochDay">,
  serviceIdx: number,
  epochDay: number,
): boolean {
  const d = epochDay - tt.feedStartEpochDay;
  if (d < 0 || epochDay > tt.feedEndEpochDay) return false;
  const byte = tt.serviceActive[serviceIdx * tt.serviceStrideBytes + (d >> 3)];
  return ((byte >> (d & 7)) & 1) === 1;
}
