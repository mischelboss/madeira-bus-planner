import { describe, expect, it } from "vitest";
import { haversineMeters } from "./geo.ts";

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters({ lat: 32.65, lon: -16.91 }, { lat: 32.65, lon: -16.91 })).toBe(0);
  });

  it("is roughly correct for a known pair", () => {
    // 1 degree of latitude is ~111.2 km everywhere on Earth.
    const meters = haversineMeters({ lat: 32.65, lon: -16.91 }, { lat: 33.65, lon: -16.91 });
    expect(meters).toBeGreaterThan(110_000);
    expect(meters).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const a = { lat: 32.65, lon: -16.91 };
    const b = { lat: 32.72, lon: -17.18 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});
