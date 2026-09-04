/**
 * Top-level navigation. There's no router — the URL query string is the whole
 * nav state, and every push dispatches `NAV_EVENT` so `App` re-reads it.
 *
 *   (nothing)          Search
 *   ?…&go=1            Results     (search params carried by state/search.ts)
 *   ?tab=browse        Browse
 *   ?tab=browse&route  Route Detail
 */
import { NAV_EVENT } from "./search.ts";

export type View = "search" | "results" | "browse" | "routeDetail";

export interface Nav {
  view: View;
  routeId: string | null;
}

export function navFromUrl(search: string = location.search): Nav {
  const p = new URLSearchParams(search);
  const routeId = p.get("route");
  if (routeId) return { view: "routeDetail", routeId };
  if (p.get("go") === "1") return { view: "results", routeId: null };
  if (p.get("tab") === "browse") return { view: "browse", routeId: null };
  return { view: "search", routeId: null };
}

function navigate(mutate: (p: URLSearchParams) => void): void {
  const p = new URLSearchParams(location.search);
  mutate(p);
  const q = p.toString();
  history.pushState(null, "", q ? `?${q}` : location.pathname);
  dispatchEvent(new Event(NAV_EVENT));
}

/** Bottom tab bar. Keeps any resolved from/to params so Search is where you left it. */
export function goToTab(tab: "search" | "browse"): void {
  navigate((p) => {
    p.delete("route");
    p.delete("go");
    if (tab === "browse") p.set("tab", "browse");
    else p.delete("tab");
  });
}

export function openRoute(routeId: string): void {
  navigate((p) => {
    p.set("tab", "browse");
    p.set("route", routeId);
    p.delete("go");
  });
}
