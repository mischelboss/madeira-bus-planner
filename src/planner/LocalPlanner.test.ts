/**
 * Integration test: LocalPlanner against the REAL packed data in public/data/,
 * with the Web Worker stubbed by an in-process CSA (jsdom has no Worker).
 * Exercises endpoint resolution, hydration, and deriveFlags end to end.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildTripConns, loadTimetable, search } from "./csa.ts";
import type { Timetable } from "./timetableFormat.ts";

const DATA = resolve(__dirname, "../../public/data");
const readJson = (f: string) => JSON.parse(readFileSync(resolve(DATA, f), "utf8"));

let tt: Timetable;
let tc: { start: Uint32Array; order: Uint32Array };

vi.mock("./csa.worker.ts?worker", () => {
  class StubWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    postMessage(msg: { id: number; type: string; req?: Parameters<typeof search>[2] }) {
      queueMicrotask(() => {
        if (msg.type === "load") {
          this.onmessage?.({ data: { id: msg.id, ok: true, type: "load" } } as MessageEvent);
        } else {
          const result = search(tt, tc, msg.req!);
          this.onmessage?.({ data: { id: msg.id, ok: true, type: "search", result } } as MessageEvent);
        }
      });
    }
    terminate() {}
  }
  return { default: StubWorker };
});

beforeAll(async () => {
  const gz = readFileSync(resolve(DATA, "timetable.bin.gz"));
  tt = await loadTimetable(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength));
  tc = buildTripConns(tt);

  const files: Record<string, unknown> = {
    "stops.json": readJson("stops.json"),
    "routes.json": readJson("routes.json"),
    "headsigns.json": readJson("headsigns.json"),
    "meta.json": readJson("meta.json"),
  };
  vi.stubGlobal("fetch", (url: string) => {
    const name = url.split("/").pop()!;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(files[name]) } as Response);
  });
});

afterAll(() => vi.unstubAllGlobals());

describe("LocalPlanner (real data)", () => {
  it("plans a real Funchal-area trip and hydrates the legs", async () => {
    const { LocalPlanner } = await import("./LocalPlanner.ts");
    const stops = readJson("stops.json") as { stopId: string; name: string }[];
    const from = stops.find((s) => s.name.includes("Praça Autonomia"))!;
    const to = stops.find((s) => /Lido/.test(s.name))!;
    const meta = readJson("meta.json");

    const p = new LocalPlanner();
    await p.ready();
    const res = await p.plan({
      from: { kind: "stop", stopId: from.stopId },
      to: { kind: "stop", stopId: to.stopId },
      departAt: `${meta.feedStartDate}T08:00:00+01:00`,
    });

    expect(res.feedVersion).toBe(meta.feedVersion);
    expect(res.horizonEndDate).toBe(meta.feedEndDate);
    expect(["ok", "no_route"]).toContain(res.outcome);
    if (res.outcome === "ok") {
      const it = res.itineraries[0];
      expect(it.legs.length).toBeGreaterThan(0);
      const transit = it.legs.find((l) => l.mode === "transit");
      expect(transit).toBeTruthy();
      if (transit && transit.mode === "transit") {
        expect(transit.route.operator).toMatch(/HF|RODOESTE|CAM|AEROBUS/);
        expect(transit.stops.length).toBeGreaterThanOrEqual(2);
        expect(transit.stops[0].departAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d/);
      }
    }
  });

  it("never returns a blank result for a connected pair, even before the feed starts", async () => {
    const { LocalPlanner } = await import("./LocalPlanner.ts");
    const stops = readJson("stops.json") as { stopId: string; name: string }[];
    const meta = readJson("meta.json");
    const from = stops.find((s) => s.name.includes("AV Mar") && s.name.includes("E E M"))!;
    const to = stops.find((s) => s.name.startsWith("Ilma"))!;
    expect(from && to).toBeTruthy();

    const p = new LocalPlanner();
    await p.ready();
    // "leave now" — depending on the calendar this is before, on, or after the
    // feed's first day; a connected pair must yield trips or a next departure
    // regardless (the bug was a silently blank Results screen before feed start).
    const res = await p.plan({
      from: { kind: "stop", stopId: from.stopId },
      to: { kind: "stop", stopId: to.stopId },
    });

    expect(res.horizonStartDate).toBe(meta.feedStartDate);
    expect(res.itineraries.length > 0 || !!res.nextDeparture).toBe(true);

    if (res.flags.beforePublishedHorizon) {
      expect(res.outcome).toBe("ok");
      const it = res.itineraries[0];
      expect(it.departAt.slice(0, 10)).toBe(meta.feedStartDate);
      expect(it.durationSeconds).toBeGreaterThan(0);
      expect(it.durationSeconds).toBeLessThan(3 * 3600); // not "midnight → arrival"
    }
  });

  it("flags a date beyond the published horizon", async () => {
    const { LocalPlanner } = await import("./LocalPlanner.ts");
    const stops = readJson("stops.json") as { stopId: string; name: string }[];
    const p = new LocalPlanner();
    await p.ready();
    const res = await p.plan({
      from: { kind: "stop", stopId: stops[0].stopId },
      to: { kind: "stop", stopId: stops[10].stopId },
      departAt: "2099-01-01T08:00:00+01:00",
    });
    expect(res.flags.beyondPublishedHorizon).toBe(true);
  });
});
