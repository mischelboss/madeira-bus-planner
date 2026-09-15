import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/routeShapes.ts", () => ({
  routeShape: async () => null,
  sliceShape: (shape: unknown, from: unknown, to: unknown) => [from, to],
}));

const { legFeatures } = await import("./shapeLayers.ts");
const { makeItinerary, makeTransitLeg, makeWalkLeg } = await import("../test/fakePlanner.ts");

function transitLineOffsets(lines: { properties?: Record<string, unknown> | null }[]) {
  return lines
    .filter((l) => l.properties?.walk === false)
    .map((l) => l.properties?.lineOffset);
}

describe("legFeatures line offsets", () => {
  it("is 0 for a single-leg itinerary (no visible change)", async () => {
    const it_ = makeItinerary({ legs: [makeTransitLeg("hf-1")] });
    const { lines } = await legFeatures(it_);
    expect(transitLineOffsets(lines)).toEqual([0]);
  });

  it("fans out symmetrically for a 2-leg itinerary", async () => {
    const it_ = makeItinerary({ legs: [makeTransitLeg("hf-1"), makeTransitLeg("rod-9")] });
    const { lines } = await legFeatures(it_);
    expect(transitLineOffsets(lines)).toEqual([-2.5, 2.5]);
  });

  it("fans out symmetrically for a 3-leg itinerary", async () => {
    const it_ = makeItinerary({
      legs: [makeTransitLeg("hf-1"), makeTransitLeg("rod-9"), makeTransitLeg("cam-3")],
    });
    const { lines } = await legFeatures(it_);
    expect(transitLineOffsets(lines)).toEqual([-5, 0, 5]);
  });

  it("does not offset walk legs", async () => {
    const it_ = makeItinerary({ legs: [makeWalkLeg(), makeTransitLeg("hf-1")] });
    const { lines } = await legFeatures(it_);
    const walkLine = lines.find((l) => l.properties?.walk === true);
    expect(walkLine?.properties?.lineOffset).toBeUndefined();
  });

  it("labels the origin/destination markers with the itinerary's real endpoint names, not 'Start'/'End'", async () => {
    const it_ = makeItinerary({ legs: [makeTransitLeg("hf-1")] });
    const { stops } = await legFeatures(it_);
    const origin = stops.find((s) => s.properties?.kind === "origin");
    const dest = stops.find((s) => s.properties?.kind === "dest");
    expect(origin?.properties?.name).toBe(it_.legs[0].from.name);
    expect(dest?.properties?.name).toBe(it_.legs[it_.legs.length - 1].to.name);
    expect(origin?.properties?.name).not.toBe("Start");
    expect(dest?.properties?.name).not.toBe("End");
  });
});
