import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakePlanner } from "./test/fakePlanner.ts";
import { FAKE_BROWSE } from "./test/fakeBrowse.ts";

const fake = makeFakePlanner();
vi.mock("./planner/index.ts", async () => {
  const actual = await vi.importActual<typeof import("./planner/index.ts")>("./planner/index.ts");
  return { ...actual, planner: fake, usePlanner: () => fake };
});
vi.mock("./lib/browseData.ts", async () => {
  const actual = await vi.importActual<typeof import("./lib/browseData.ts")>("./lib/browseData.ts");
  return {
    ...actual,
    loadBrowseData: () => Promise.resolve(FAKE_BROWSE),
    useBrowseData: () => ({ data: FAKE_BROWSE, error: null }),
  };
});

const { App } = await import("./App.tsx");

describe("App — Browse tab navigation", () => {
  beforeEach(() => history.replaceState(null, "", "/"));
  afterEach(() => {
    history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("Search → Browse tab → route row → Route Detail → Back", async () => {
    render(<App />);

    // start on Search (its submit button is present)
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Browse tab" }));
    expect(await screen.findByText("Browse routes")).toBeInTheDocument();

    // first region open, drill into a route
    await userEvent.click(
      await screen.findByRole("button", { name: /Funchal ↔ Câmara de Lobos/ }),
    );

    // Route Detail — tab bar is gone, back button present
    expect(await screen.findByText("Horários do Funchal")).toBeInTheDocument();
    expect(screen.getByText("06:15–21:40 · every ~20 min")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browse tab" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByText("Browse routes")).toBeInTheDocument());
  });
});
