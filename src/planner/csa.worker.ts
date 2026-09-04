/// <reference lib="webworker" />
/**
 * Thin worker: load `timetable.bin.gz` once, then answer `search` requests with
 * `csa.search`. All timezone maths is done by LocalPlanner on the main thread;
 * this side is purely numeric.
 */
import { buildTripConns, loadTimetable, search, type SearchRequest, type RawResult } from "./csa.ts";
import type { Timetable } from "./timetableFormat.ts";

type InMsg =
  | { id: number; type: "load"; url: string }
  | { id: number; type: "search"; req: SearchRequest };
type OutMsg =
  | { id: number; ok: true; type: "load" }
  | { id: number; ok: true; type: "search"; result: RawResult }
  | { id: number; ok: false; error: string };

let tt: Timetable | null = null;
let tc: { start: Uint32Array; order: Uint32Array } | null = null;

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const res = await fetch(msg.url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`timetable ${res.status}`);
      tt = await loadTimetable(await res.arrayBuffer());
      tc = buildTripConns(tt);
      post({ id: msg.id, ok: true, type: "load" });
      return;
    }
    if (msg.type === "search") {
      if (!tt || !tc) throw new Error("timetable not loaded");
      const result = search(tt, tc, msg.req);
      post({ id: msg.id, ok: true, type: "search", result });
      return;
    }
  } catch (err) {
    post({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

function post(m: OutMsg) {
  (self as unknown as Worker).postMessage(m);
}
