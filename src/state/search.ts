import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLon, PlaceRef } from "../planner/types.ts";

/** A resolved endpoint plus the text to show for it. */
export interface Endpoint {
  label: string;
  ref: PlaceRef | null; // null while the user is still typing free text
}

export interface SearchState {
  from: Endpoint;
  to: Endpoint;
  /** ISO 8601 with offset, or undefined for "leave now" */
  departAt?: string;
  /** true once the user has pressed Search — drives the Results screen */
  submitted: boolean;
}

const EMPTY: Endpoint = { label: "", ref: null };

/** history.pushState doesn't fire popstate; our own navigations dispatch this. */
export const NAV_EVENT = "mbp:navigate";

function serializeRef(ep: Endpoint): string {
  if (!ep.ref) return "";
  if (ep.ref.kind === "stop") return `s:${ep.ref.stopId}`;
  return `c:${ep.ref.at.lat.toFixed(5)},${ep.ref.at.lon.toFixed(5)}`;
}

function parseRef(raw: string, label: string): Endpoint {
  if (!raw) return { label, ref: null };
  if (raw.startsWith("s:")) return { label, ref: { kind: "stop", stopId: raw.slice(2) } };
  if (raw.startsWith("c:")) {
    const [lat, lon] = raw.slice(2).split(",").map(Number);
    return { label, ref: { kind: "coord", at: { lat, lon }, label } };
  }
  return { label, ref: null };
}

export function stateFromUrl(search: string): SearchState {
  const p = new URLSearchParams(search);
  return {
    from: parseRef(p.get("f") ?? "", p.get("fl") ?? ""),
    to: parseRef(p.get("t") ?? "", p.get("tl") ?? ""),
    departAt: p.get("d") ?? undefined,
    submitted: p.get("go") === "1",
  };
}

/** Only endpoints with a resolved ref go in the URL (a shareable link needs both). */
export function urlFromState(s: SearchState): string {
  const p = new URLSearchParams();
  if (s.from.ref) {
    p.set("f", serializeRef(s.from));
    p.set("fl", s.from.label);
  }
  if (s.to.ref) {
    p.set("t", serializeRef(s.to));
    p.set("tl", s.to.label);
  }
  if (s.departAt) p.set("d", s.departAt);
  if (s.submitted) p.set("go", "1");
  const q = p.toString();
  return q ? `?${q}` : location.pathname;
}

export function useSearchState() {
  const [state, setState] = useState<SearchState>(() => stateFromUrl(location.search));
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    // the URL is the source of truth only for external navigation (Back / a link)
    const onPop = () => setState(stateFromUrl(location.search));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const commit = useCallback((next: SearchState, replace: boolean) => {
    setState(next);
    const url = urlFromState(next);
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    dispatchEvent(new Event(NAV_EVENT));
  }, []);

  const patch = useCallback(
    (p: Partial<SearchState>, replace = true) =>
      commit({ ...ref.current, submitted: false, ...p }, replace),
    [commit],
  );

  const setFrom = useCallback((from: Endpoint) => patch({ from }), [patch]);
  const setTo = useCallback((to: Endpoint) => patch({ to }), [patch]);
  const setDepartAt = useCallback((departAt?: string) => patch({ departAt }), [patch]);
  const swap = useCallback(
    () => patch({ from: ref.current.to, to: ref.current.from }),
    [patch],
  );
  const submit = useCallback(() => {
    const cur = ref.current;
    if (cur.from.ref && cur.to.ref) commit({ ...cur, submitted: true }, false);
  }, [commit]);
  const back = useCallback(() => history.back(), []);

  return { state, setFrom, setTo, setDepartAt, swap, submit, back };
}

export type Coord = LatLon;
export { EMPTY as EMPTY_ENDPOINT };
