import MiniSearch from "minisearch";
import type { Stop } from "../planner/types.ts";
import { stripAccents } from "./text.ts";

export interface StopSuggestion {
  stop: Stop;
  /** display name — the operator's verbatim name */
  name: string;
  /** muted secondary line — town / parish */
  town: string;
}

export function buildStopIndex(stops: Stop[]): MiniSearch<Stop & { plain: string }> {
  const idx = new MiniSearch<Stop & { plain: string }>({
    idField: "stopId",
    fields: ["name", "town", "code", "plain"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.15,
      boost: { name: 2, town: 1 },
      combineWith: "AND",
    },
  });
  idx.addAll(
    stops.map((s) => ({
      ...s,
      town: s.town ?? "",
      code: s.code ?? "",
      plain: stripAccents(`${s.name} ${s.town ?? ""}`),
    })),
  );
  return idx;
}

export function searchStops(
  idx: MiniSearch<Stop & { plain: string }>,
  stopsById: Map<string, Stop>,
  query: string,
  limit = 5,
): StopSuggestion[] {
  const q = query.trim();
  if (!q) return [];
  const hits = idx.search(stripAccents(q));
  const out: StopSuggestion[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const stop = stopsById.get(String(h.id));
    if (!stop || seen.has(stop.stopId)) continue;
    seen.add(stop.stopId);
    out.push({ stop, name: stop.name, town: stop.town ?? "" });
    if (out.length >= limit) break;
  }
  return out;
}
