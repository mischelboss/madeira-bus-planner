import { describe, expect, it } from "vitest";
import { assignLegColors, LEG_COLORS } from "./legColors.ts";
import { makeItinerary, makeTransitLeg, makeWalkLeg } from "../test/fakePlanner.ts";

describe("assignLegColors", () => {
  it("gives a repeated route the same color across multiple legs", () => {
    const it_ = makeItinerary({
      legs: [makeTransitLeg("hf-1"), makeTransitLeg("rod-9"), makeTransitLeg("hf-1")],
    });
    const colors = assignLegColors(it_);
    expect(colors.get("hf-1")).toBe(LEG_COLORS[0]);
    expect(colors.get("rod-9")).toBe(LEG_COLORS[1]);
    expect(colors.size).toBe(2);
  });

  it("never assigns a color to a walk leg", () => {
    const it_ = makeItinerary({ legs: [makeWalkLeg(), makeTransitLeg("hf-1")] });
    const colors = assignLegColors(it_);
    expect(colors.size).toBe(1);
    expect(colors.get("hf-1")).toBe(LEG_COLORS[0]);
  });

  it("cycles the palette when there are more distinct lines than colors", () => {
    const legs = Array.from({ length: LEG_COLORS.length + 2 }, (_, i) => makeTransitLeg(`r${i}`));
    const colors = assignLegColors(makeItinerary({ legs }));
    expect(colors.get("r0")).toBe(colors.get(`r${LEG_COLORS.length}`));
    expect(colors.get("r1")).toBe(colors.get(`r${LEG_COLORS.length + 1}`));
  });

  it("returns an empty map for a walk-only itinerary", () => {
    const it_ = makeItinerary({ legs: [makeWalkLeg()] });
    expect(assignLegColors(it_).size).toBe(0);
  });
});
