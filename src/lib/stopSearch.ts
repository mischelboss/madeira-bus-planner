import MiniSearch from "minisearch";
import type { Stop } from "../planner/types.ts";
import { stripAccents } from "./text.ts";
import { stopLabel } from "./stopNames.ts";

export interface StopSuggestion {
  stop: Stop;
  /** what to show the rider — readable form where we have one, else the sign */
  name: string;
  /** muted secondary line — town / parish */
  town: string;
}

export function buildStopIndex(stops: Stop[]): MiniSearch<Stop & { plain: string }> {
  const idx = new MiniSearch<Stop & { plain: string }>({
    idField: "stopId",
    fields: ["name", "displayName", "town", "code", "plain"],
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
      displayName: s.displayName ?? "",
      plain: stripAccents(`${s.name} ${s.displayName ?? ""} ${s.town ?? ""}`),
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
    if (!stop) continue;
    // one entry per physical stop — the HF feed lists some as several poles
    // a few metres apart, all with the same name and code
    const groupKey = stop.groupId ?? stop.stopId;
    if (seen.has(groupKey)) continue;
    seen.add(groupKey);
    out.push({ stop, name: stopLabel(stop), town: stop.town ?? "" });
    if (out.length >= limit) break;
  }
  return out;
}
