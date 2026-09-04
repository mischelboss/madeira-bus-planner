import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FAKE_BROWSE } from "../test/fakeBrowse.ts";

vi.mock("../lib/browseData.ts", async () => {
  const actual = await vi.importActual<typeof import("../lib/browseData.ts")>("../lib/browseData.ts");
  return {
    ...actual,
    loadBrowseData: () => Promise.resolve(FAKE_BROWSE),
    useBrowseData: () => ({ data: FAKE_BROWSE, error: null }),
  };
});

const { BrowseScreen } = await import("./BrowseScreen.tsx");

describe("BrowseScreen", () => {
  beforeEach(() => history.replaceState(null, "", "/"));
  afterEach(() => history.replaceState(null, "", "/"));

  it("shows the first region expanded with its routes", async () => {
    render(<BrowseScreen />);
    const first = await screen.findByRole("button", { name: /Funchal & Around/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Funchal ↔ Câmara de Lobos")).toBeInTheDocument();
    // second region is collapsed
    expect(screen.queryByText("Ribeira Brava ↔ Calheta")).not.toBeInTheDocument();
  });

  it("collapses a region on tap", async () => {
    render(<BrowseScreen />);
    const head = await screen.findByRole("button", { name: /Funchal & Around/ });
    await userEvent.click(head);
    await waitFor(() =>
      expect(screen.queryByText("Funchal ↔ Câmara de Lobos")).not.toBeInTheDocument(),
    );
  });

  it("filters to a flat list across regions, matching an intermediate stop name", async () => {
    render(<BrowseScreen />);
    await screen.findByRole("button", { name: /Funchal & Around/ });

    await userEvent.type(screen.getByLabelText("Filter routes"), "ponta do sol");
    expect(await screen.findByText("1 route found")).toBeInTheDocument();
    expect(screen.getByText("Ribeira Brava ↔ Calheta")).toBeInTheDocument();
    // the region toggle is hidden while filtering
    expect(screen.queryByRole("button", { name: "Regional" })).not.toBeInTheDocument();
  });

  it("opens Route Detail via the URL when a row is tapped", async () => {
    render(<BrowseScreen />);
    const row = await screen.findByRole("button", { name: /Funchal ↔ Câmara de Lobos/ });
    await userEvent.click(row);
    expect(new URLSearchParams(location.search).get("route")).toBe("hf-1");
  });

  it("lists interregional routes on that tab", async () => {
    render(<BrowseScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Interregional" }));
    expect(await screen.findByText("Santana ↔ Machico")).toBeInTheDocument();
    expect(screen.queryByText("Funchal ↔ Câmara de Lobos")).not.toBeInTheDocument();
  });

  it("uses terse operator codes on the badge", async () => {
    render(<BrowseScreen />);
    await userEvent.type(await screen.findByLabelText("Filter routes"), "139");
    const row = await screen.findByRole("button", { name: /Ribeira Brava ↔ Calheta/ });
    expect(within(row).getByText("ROD 139")).toBeInTheDocument();
  });
});
