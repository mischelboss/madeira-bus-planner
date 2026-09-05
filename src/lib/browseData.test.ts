import { describe, expect, it } from "vitest";
import { frequencyLabel, routeSummaryLabel, serviceHoursLabel, type BrowseRoute } from "./browseData.ts";

describe("frequencyLabel / serviceHoursLabel", () => {
  it("shows the span and headway for a normal route", () => {
    const w = { first: "06:15", last: "21:40", frequencyMin: 20 };
    expect(frequencyLabel(w)).toBe("Every ~20 min · 06:15–21:40");
    expect(serviceHoursLabel(w)).toBe("06:15–21:40 · every ~20 min");
  });

  it("drops the headway when there isn't a stable one", () => {
    const w = { first: "06:30", last: "20:30", frequencyMin: null };
    expect(frequencyLabel(w)).toBe("06:30–20:30");
    expect(serviceHoursLabel(w)).toBe("06:30–20:30");
  });

  it("reads as a single departure rather than a zero-length span", () => {
    // Rodoeste 380 (Funchal -> Porto Moniz) genuinely runs once a day —
    // was rendering as "10:00–10:00", which reads like a data bug
    const w = { first: "10:00", last: "10:00", frequencyMin: null };
    expect(frequencyLabel(w)).toBe("10:00 only");
    expect(serviceHoursLabel(w)).toBe("10:00 only");
  });
});

describe("routeSummaryLabel", () => {
  const base: BrowseRoute = {
    routeId: "rodoeste-380",
    shortName: "380",
    operator: "RODOESTE",
    operatorName: "Rodoeste",
    origin: "Funchal",
    destination: "Porto Moniz",
    stops: [],
    weekday: null,
    weekend: null,
  };

  it("prefers weekday, falls back to weekend, then a placeholder", () => {
    expect(routeSummaryLabel({ ...base, weekend: { first: "08:00", last: "18:00", frequencyMin: null } })).toBe(
      "08:00–18:00",
    );
    expect(routeSummaryLabel(base)).toBe("Timetable varies");
  });

  it("never shows a single-departure route as a zero-length span", () => {
    const once = { first: "10:00", last: "10:00", frequencyMin: null };
    expect(routeSummaryLabel({ ...base, weekday: once })).toBe("10:00 only");
  });
});
