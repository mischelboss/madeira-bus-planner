import { useEffect, useState } from "react";
import { PlannerProvider, planner } from "./planner/index.ts";
import { SearchScreen } from "./screens/SearchScreen.tsx";
import { ResultsScreen } from "./screens/ResultsScreen.tsx";
import { BrowseScreen } from "./screens/BrowseScreen.tsx";
import { RouteDetailScreen } from "./screens/RouteDetailScreen.tsx";
import { TabBar } from "./components/TabBar.tsx";
import { NAV_EVENT } from "./state/search.ts";
import { navFromUrl } from "./state/nav.ts";

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
