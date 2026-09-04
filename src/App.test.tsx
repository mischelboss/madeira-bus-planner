import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakePlanner, makeItinerary } from "./test/fakePlanner.ts";

const fake = makeFakePlanner();
vi.mock("./planner/index.ts", async () => {
  const actual = await vi.importActual<typeof import("./planner/index.ts")>("./planner/index.ts");
  return { ...actual, planner: fake, usePlanner: () => fake };
});

const { App } = await import("./App.tsx");

describe("App end-to-end (fake planner)", () => {
  beforeEach(() => history.replaceState(null, "", "/"));
  afterEach(() => {
    history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("goes Search → Results and shows an itinerary", async () => {
    render(<App />);

    await userEvent.type(screen.getByLabelText("From"), "Funchal");
    await userEvent.click(await screen.findByText("Funchal - Praça"));
    await userEvent.type(screen.getByLabelText("To"), "Calheta");
    await userEvent.click(await screen.findByText("Calheta - Vila"));

    const search = screen.getByRole("button", { name: "Search" });
    await waitFor(() => expect(search).toBeEnabled());
    await userEvent.click(search);

    // Results screen
    expect(await screen.findByText("08:05")).toBeInTheDocument();
    expect(await screen.findByText("08:52")).toBeInTheDocument();
    expect(screen.getByText("HF 1")).toBeInTheDocument();
    expect(screen.getByText("47 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("renders the no-more-buses edge state", async () => {
    vi.spyOn(fake, "plan").mockResolvedValueOnce({
      itineraries: [],
      flags: { dateAdjustedFromPast: false, beyondPublishedHorizon: false, noMoreServiceToday: true },
      horizonEndDate: "2027-06-30",
      horizonStartDate: "2026-09-08",
      nextDeparture: { departAt: "2026-09-09T08:05:00+01:00", itinerary: makeItinerary() },
      outcome: "ok",
      query: { from: { kind: "stop", stopId: "s1" }, to: { kind: "stop", stopId: "s3" }, effectiveDepartAt: "2026-09-08T23:00:00+01:00" },
      feedVersion: "test",
    });

    render(<App />);
    await userEvent.type(screen.getByLabelText("From"), "Funchal");
    await userEvent.click(await screen.findByText("Funchal - Praça"));
    await userEvent.type(screen.getByLabelText("To"), "Calheta");
    await userEvent.click(await screen.findByText("Calheta - Vila"));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("No more buses today")).toBeInTheDocument();
    expect(screen.getByText(/arrives 08:52/)).toBeInTheDocument();
  });
});
