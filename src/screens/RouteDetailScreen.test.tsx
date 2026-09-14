import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FAKE_BROWSE } from "../test/fakeBrowse.ts";
import type { RouteTimesEntry } from "../lib/routeTimes.ts";

vi.mock("../lib/browseData.ts", async () => {
  const actual = await vi.importActual<typeof import("../lib/browseData.ts")>("../lib/browseData.ts");
  return {
    ...actual,
    loadBrowseData: () => Promise.resolve(FAKE_BROWSE),
    useBrowseData: () => ({ data: FAKE_BROWSE, error: null }),
  };
});

// A Wednesday 09:15 Madeira time — trips below are chosen so each stop's
// "next" cell lands in a different column, proving the highlight is
// computed independently per row, not just once for the whole table.
const NOW_ISO = "2026-09-09T09:15:00+01:00";
vi.mock("../planner/time.ts", async () => {
  const actual = await vi.importActual<typeof import("../planner/time.ts")>("../planner/time.ts");
  return { ...actual, nowEpochSec: () => Math.floor(new Date(NOW_ISO).getTime() / 1000) };
});

const FAKE_ROUTE_TIMES: Record<string, RouteTimesEntry> = {
  "hf-1": {
    stops: [
      { stopId: "s1", name: "Funchal — Praça" },
      { stopId: "s2", name: "Ajuda" },
      { stopId: "s3", name: "Câmara de Lobos" },
    ],
    trips: [
      { weekend: false, times: ["08:50", "09:05", "09:20"] },
      { weekend: false, times: ["09:10", null, "09:40"] },
      { weekend: false, times: ["09:20", "09:35", "09:50"] },
      { weekend: true, times: ["10:00", "10:15", "10:30"] },
    ],
  },
};
vi.mock("../lib/routeTimes.ts", () => ({
  routeTimes: async (routeId: string) => FAKE_ROUTE_TIMES[routeId] ?? null,
}));

const { RouteDetailScreen } = await import("./RouteDetailScreen.tsx");

describe("RouteDetailScreen", () => {
  beforeEach(() => history.replaceState(null, "", "/"));
  afterEach(() => history.replaceState(null, "", "/"));

  it("shows the route header, both service windows, and the ordered stops", async () => {
    render(<RouteDetailScreen routeId="hf-1" />);

    expect(await screen.findByText("Funchal ↔ Câmara de Lobos")).toBeInTheDocument();
    expect(screen.getByText("Horários do Funchal")).toBeInTheDocument();

    expect(screen.getByText("Mon–Fri")).toBeInTheDocument();
    expect(screen.getByText("06:15–21:40 · every ~20 min")).toBeInTheDocument();
    expect(screen.getByText("Sat–Sun & holidays")).toBeInTheDocument();
    expect(screen.getByText("07:30–20:30 · every ~40 min")).toBeInTheDocument();

    expect(screen.getByText("Ajuda")).toBeInTheDocument();
    expect(screen.getByText("Câmara de Lobos")).toBeInTheDocument();
  });

  it("says 'No service' for a route that doesn't run at the weekend", async () => {
    render(<RouteDetailScreen routeId="hf-20" />);
    expect(await screen.findByText("No service")).toBeInTheDocument();
  });

  it("handles an unknown route id", async () => {
    render(<RouteDetailScreen routeId="nope" />);
    expect(await screen.findByText("Route not found")).toBeInTheDocument();
  });

  describe("Times view", () => {
    it("renders one row per stop, blank cells for a trip that skips a stop, and defaults to the weekday tab on a weekday", async () => {
      render(<RouteDetailScreen routeId="hf-1" />);
      await userEvent.click(screen.getByRole("button", { name: "Times" }));

      expect(screen.getByRole("button", { name: "Mon–Fri" })).toHaveClass("is-active");

      const rows = screen.getAllByRole("row");
      expect(rows).toHaveLength(3); // one per stop; the weekend-only trip's column isn't shown

      const ajudaRow = rows.find((r) => within(r).queryByText("Ajuda"));
      expect(ajudaRow).toBeTruthy();
      const ajudaCells = within(ajudaRow!).getAllByRole("cell");
      expect(ajudaCells.map((c) => c.textContent)).toEqual(["09:05", "—", "09:35"]);
    });

    it("highlights each row's own next upcoming departure independently", async () => {
      render(<RouteDetailScreen routeId="hf-1" />);
      await userEvent.click(screen.getByRole("button", { name: "Times" }));

      const rows = screen.getAllByRole("row");
      const nextCellOf = (stopName: string) => {
        const row = rows.find((r) => within(r).queryByText(stopName))!;
        return within(row)
          .getAllByRole("cell")
          .find((c) => c.className.includes("rd-times-next"));
      };

      // "now" is 09:15 — Funchal/Ajuda's soonest upcoming departure is the
      // 09:20-starting trip; Câmara de Lobos's is the 08:50-starting trip,
      // which is still en route to it (09:20 arrival there), a different
      // column from the other two rows'.
      expect(nextCellOf("Funchal — Praça")?.textContent).toBe("09:20");
      expect(nextCellOf("Ajuda")?.textContent).toBe("09:35");
      expect(nextCellOf("Câmara de Lobos")?.textContent).toBe("09:20");
    });

    it("switches to the weekend trips on the toggle", async () => {
      render(<RouteDetailScreen routeId="hf-1" />);
      await userEvent.click(screen.getByRole("button", { name: "Times" }));
      await userEvent.click(screen.getByRole("button", { name: "Sat–Sun & holidays" }));

      const rows = screen.getAllByRole("row");
      const ajudaRow = rows.find((r) => within(r).queryByText("Ajuda"));
      expect(within(ajudaRow!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["10:15"]);
    });

    it("shows a message when a route has no schedule data", async () => {
      render(<RouteDetailScreen routeId="hf-20" />);
      await userEvent.click(screen.getByRole("button", { name: "Times" }));
      expect(await screen.findByText("No schedule available for this route.")).toBeInTheDocument();
    });
  });
});
