import { useMemo, useState } from "react";
import { useBrowseData, routeMatches, type BrowseRoute } from "../lib/browseData.ts";
import { RouteRow } from "../components/RouteRow.tsx";
import { SearchIcon, ChevronDownIcon } from "../components/icons.tsx";
import "./BrowseScreen.css";

type Tab = "regional" | "interregional";

export function BrowseScreen() {
  const { data, error } = useBrowseData();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("regional");
  // explicit user toggles; a region not in the map falls back to "first one open"
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());

  const firstRegionId = data?.regions[0]?.id;
  const isOpen = (id: string) => toggled.get(id) ?? id === firstRegionId;
  const toggleRegion = (id: string) =>
    setToggled((prev) => new Map(prev).set(id, !isOpen(id)));

  const filtering = query.trim().length > 0;

  const filtered = useMemo(() => {
    if (!data || !filtering) return [];
    return Object.values(data.routes)
      .filter((r) => routeMatches(r, query))
      .sort(byLineNumber);
  }, [data, query, filtering]);

  if (error) {
    return (
      <div className="screen browse">
        <BrowseHeader query={query} onQuery={setQuery} />
        <p className="browse-status">Couldn&rsquo;t load the route list: {error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="screen browse">
        <BrowseHeader query={query} onQuery={setQuery} />
        <p className="browse-status">Loading routes…</p>
      </div>
    );
  }

  const interregional = data.interregionalRouteIds.map((id) => data.routes[id]).filter(Boolean);

  return (
    <div className="screen browse">
      <BrowseHeader query={query} onQuery={setQuery} />

      {!filtering && (
        <div className="browse-tabs">
          <button
            type="button"
            className={tab === "regional" ? "is-active" : ""}
            onClick={() => setTab("regional")}
          >
            Regional
          </button>
          <button
            type="button"
            className={tab === "interregional" ? "is-active" : ""}
            onClick={() => setTab("interregional")}
          >
            Interregional
          </button>
        </div>
      )}

      <div className="browse-body">
        {filtering ? (
          <>
            <p className="browse-count">
              {filtered.length} {filtered.length === 1 ? "route" : "routes"} found
            </p>
            {filtered.map((r) => (
              <RouteRow key={r.routeId} route={r} />
            ))}
          </>
        ) : tab === "regional" ? (
          data.regions.map((region) => {
            const open = isOpen(region.id);
            return (
              <section key={region.id} className="browse-region">
                <button
                  type="button"
                  className="browse-region-head"
                  aria-expanded={open}
                  onClick={() => toggleRegion(region.id)}
                >
                  <span className="browse-region-name">{region.name}</span>
                  <span className="browse-region-count">
                    {region.routeIds.length} {region.routeIds.length === 1 ? "route" : "routes"}
                  </span>
                  <ChevronDownIcon className={open ? "chev-open" : undefined} />
                </button>
                {open && (
                  <div className="browse-region-routes">
                    {region.routeIds.map((id) => {
                      const r = data.routes[id];
                      return r ? <RouteRow key={id} route={r} /> : null;
                    })}
                  </div>
                )}
              </section>
            );
          })
        ) : interregional.length ? (
          interregional.map((r) => <RouteRow key={r.routeId} route={r} />)
        ) : (
          <p className="browse-status">No cross-region routes in this feed.</p>
        )}
      </div>
    </div>
  );
}

function BrowseHeader({ query, onQuery }: { query: string; onQuery: (v: string) => void }) {
  return (
    <>
      <header className="browse-head">
        <div className="browse-eyebrow">Madeira Buses</div>
        <h1 className="browse-title">Browse routes</h1>
      </header>
      <div className="browse-filter">
        <SearchIcon size={17} />
        <input
          type="search"
          aria-label="Filter routes"
          placeholder="Route number or place"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
    </>
  );
}

function byLineNumber(a: BrowseRoute, b: BrowseRoute): number {
  const na = parseInt(a.shortName, 10);
  const nb = parseInt(b.shortName, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.shortName.localeCompare(b.shortName);
}
