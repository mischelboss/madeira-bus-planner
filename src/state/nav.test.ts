import { describe, expect, it } from "vitest";
import { homeUrlFor } from "./nav.ts";

describe("homeUrlFor", () => {
  it("strips go= from a results deep link, keeps the search params", () => {
    const url = homeUrlFor(
      { view: "results", routeId: null },
      "?f=s%3As1&fl=A&t=s%3As2&tl=B&go=1",
    );
    expect(url).toBe("?f=s%3As1&fl=A&t=s%3As2&tl=B");
  });

  it("returns the bare path when results has no other params", () => {
    const url = homeUrlFor({ view: "results", routeId: null }, "?go=1");
    expect(url).toBe(location.pathname);
  });

  it("strips route= and sets tab=browse for a routeDetail deep link", () => {
    const url = homeUrlFor({ view: "routeDetail", routeId: "HF1" }, "?tab=browse&route=HF1");
    expect(url).toBe("?tab=browse");
  });

  it("returns null for search (no synthesis needed)", () => {
    expect(homeUrlFor({ view: "search", routeId: null }, "")).toBeNull();
  });

  it("returns null for browse (no synthesis needed)", () => {
    expect(homeUrlFor({ view: "browse", routeId: null }, "?tab=browse")).toBeNull();
  });
});
