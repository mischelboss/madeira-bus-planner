import { useEffect, useState } from "react";
import { PlannerProvider, planner } from "./planner/index.ts";
import { SearchScreen } from "./screens/SearchScreen.tsx";
import { ResultsScreen } from "./screens/ResultsScreen.tsx";
import { NAV_EVENT, stateFromUrl } from "./state/search.ts";

export function App() {
  const [submitted, setSubmitted] = useState(() => stateFromUrl(location.search).submitted);

  useEffect(() => {
    void planner.ready();
    const sync = () => setSubmitted(stateFromUrl(location.search).submitted);
    addEventListener("popstate", sync);
    addEventListener(NAV_EVENT, sync);
    return () => {
      removeEventListener("popstate", sync);
      removeEventListener(NAV_EVENT, sync);
    };
  }, []);

  return (
    <PlannerProvider value={planner}>
      <div className="app-column">{submitted ? <ResultsScreen /> : <SearchScreen />}</div>
    </PlannerProvider>
  );
}
