import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FAKE_BROWSE } from "../test/fakeBrowse.ts";

vi.mock("../lib/browseData.ts", async () => {
  const actual = await vi.importActual<typeof import("../lib/browseData.ts")>("../lib/browseData.ts");
  return {
    ...actual,
    loadBrowseData: () => Promise.resolve(FAKE_BROWSE),
    useBrowseData: () => ({ data: FAKE_BROWSE, error: null }),
  };
});

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
});
