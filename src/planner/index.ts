import { createContext, useContext } from "react";
import { createPlanner } from "./LocalPlanner.ts";
import type { TripPlanner } from "./types.ts";

export const planner: TripPlanner = createPlanner();

const PlannerContext = createContext<TripPlanner>(planner);
export const PlannerProvider = PlannerContext.Provider;
export const usePlanner = () => useContext(PlannerContext);

export * from "./types.ts";
