import { describe, expect, it } from "vitest";
import type { Stop } from "../planner/types.ts";
import { haversineMeters } from "./geo.ts";
import { buildStopIndex, searchStops } from "./stopSearch.ts";

function index(stops: Stop[]) {
  return { idx: buildStopIndex(stops), stopsById: new Map(stops.map((s) => [s.stopId, s])) };
}

describe("searchStops ranking", () => {
  it("puts a stop whose own name exactly matches the query first, ahead of a stop that only matches it via other fields", () => {
    // modeled on the real collision: searching "Calheta" ranked "Fajã
    // Calheta" (matches via name, displayName AND town) above the stop
    // literally named "Calheta" (matches via name and town only).
    const exact: Stop = {
      stopId: "calheta-exact",
      name: "Calheta",
      town: "Calheta",
      at: { lat: 32.723582, lon: -17.181795 },
    };
    const incidental: Stop = {
      stopId: "faja-calheta",
      name: "Fajã Calheta",
      displayName: "Caminho da Faja — Calheta",
      town: "Calheta",
      at: { lat: 32.713362, lon: -17.160572 },
    };
    const { idx, stopsById } = index([incidental, exact]);

    const out = searchStops(idx, stopsById, "Calheta");
    expect(out[0].stop.stopId).toBe("calheta-exact");
  });

  it("still finds stops by an accent- and case-insensitive prefix match", () => {
    const stop: Stop = { stopId: "s1", name: "São Vicente", town: "São Vicente", at: { lat: 0, lon: 0 } };
    const { idx, stopsById } = index([stop]);
    expect(searchStops(idx, stopsById, "sao vic")[0]?.stop.stopId).toBe("s1");
  });

  it("still finds a stop via its town when the query doesn't match the name", () => {
    const stop: Stop = { stopId: "s1", name: "Igreja", town: "Estreito da Calheta", at: { lat: 0, lon: 0 } };
    const { idx, stopsById } = index([stop]);
    expect(searchStops(idx, stopsById, "Estreito")[0]?.stop.stopId).toBe("s1");
  });
});

describe("searchStops duplicate-name disambiguation", () => {
  const centroA: Stop = {
    stopId: "centro-a",
    name: "Centro",
    town: "Funchal",
    at: { lat: 32.677503, lon: -16.946604 },
  };
  const centroB: Stop = {
    stopId: "centro-b",
    name: "Centro",
    town: "Funchal",
    at: { lat: 32.664137, lon: -16.936055 },
  };
  const barreira: Stop = {
    stopId: "barreira",
    name: "Barreira",
    town: "Funchal",
    at: { lat: 32.68568, lon: -16.94815 },
  };

  it("appends a distance hint to a stop sharing another's exact name+town, but not to the first one", () => {
    const { idx, stopsById } = index([centroA, centroB, barreira]);
    const out = searchStops(idx, stopsById, "Funchal");

    const rowA = out.find((s) => s.stop.stopId === "centro-a")!;
    const rowB = out.find((s) => s.stop.stopId === "centro-b")!;
    expect(rowA.town).toBe("Funchal");
    expect(rowB.town).toMatch(/^Funchal · (<50 m|\d+(\.\d+)? (m|km)) away$/);

    const expectedMeters = haversineMeters(centroA.at, centroB.at);
    expect(expectedMeters).toBeGreaterThan(1000); // sanity: these really are far apart
  });

  it("leaves a non-duplicate stop's town untouched", () => {
    const { idx, stopsById } = index([centroA, centroB, barreira]);
    const out = searchStops(idx, stopsById, "Funchal");
    const row = out.find((s) => s.stop.stopId === "barreira")!;
    expect(row.town).toBe("Funchal");
  });
});
