import { useEffect, useState } from "react";
import { PlannerProvider, planner } from "./planner/index.ts";
import { SearchScreen } from "./screens/SearchScreen.tsx";
import { ResultsScreen } from "./screens/ResultsScreen.tsx";
import { BrowseScreen } from "./screens/BrowseScreen.tsx";
import { RouteDetailScreen } from "./screens/RouteDetailScreen.tsx";
import { TabBar } from "./components/TabBar.tsx";
import { NAV_EVENT } from "./state/search.ts";
import { navFromUrl, homeUrlFor } from "./state/nav.ts";

export function App() {
  const [nav, setNav] = useState(() => navFromUrl());

  useEffect(() => {
    void planner.ready();
    const sync = () => setNav(navFromUrl());
    addEventListener("popstate", sync);
    addEventListener(NAV_EVENT, sync);
    return () => {
      removeEventListener("popstate", sync);
      removeEventListener(NAV_EVENT, sync);
    };
  }, []);

  // A direct deep link (a shared URL landing straight on Results or Route
  // Detail) arrives with no prior entry in this tab's session history, so
  // the browser Back button has nowhere same-app to go. Every in-app
  // navigation already marks its history entries with `{ mbp: true }`
  // (nav.ts / state/search.ts); a bare first load never carries that
  // marker, so this only fires once, on a genuine direct load.
  useEffect(() => {
    const initial = navFromUrl();
    const home = homeUrlFor(initial);
    if (home && history.state?.mbp !== true) {
      const deepUrl = location.pathname + location.search;
      history.replaceState({ mbp: true }, "", home);
      history.pushState({ mbp: true }, "", deepUrl);
    }
  }, []);

  const showTabBar = nav.view === "search" || nav.view === "browse";

  return (
    <PlannerProvider value={planner}>
      <div className="app-column">
        {nav.view === "search" && <SearchScreen />}
        {nav.view === "results" && <ResultsScreen />}
        {nav.view === "browse" && <BrowseScreen />}
        {nav.view === "routeDetail" && nav.routeId && (
          <RouteDetailScreen key={nav.routeId} routeId={nav.routeId} />
        )}
        {showTabBar && <TabBar active={nav.view === "browse" ? "browse" : "search"} />}
      </div>
    </PlannerProvider>
  );
}
