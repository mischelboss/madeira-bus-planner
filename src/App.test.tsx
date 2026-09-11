import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeFakePlanner, makeItinerary } from "./test/fakePlanner.ts";

const fake = makeFakePlanner();
vi.mock("./planner/index.ts", async () => {
  const actual = await vi.importActual<typeof import("./planner/index.ts")>("./planner/index.ts");
  return { ...actual, planner: fake, usePlanner: () => fake };
});

// maplibre-gl doesn't run under jsdom — stub the lazy-loaded inline map.
vi.mock("./map/ItineraryMap.tsx", () => ({
  ItineraryMap: () => <div data-testid="itin-map" />,
}));

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
    // "today" for the title/day-label wording is real wall-clock time
    // (NoMoreBusesCard calls nowEpochSec() directly) — pin it to the same
    // calendar day as the scenario's effectiveDepartAt below.
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-08T22:30:00+01:00").getTime());

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

  it("says which day when the search itself was for a future date", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-08T10:00:00+01:00").getTime());

    vi.spyOn(fake, "plan").mockResolvedValueOnce({
      itineraries: [],
      flags: { dateAdjustedFromPast: false, beyondPublishedHorizon: false, noMoreServiceToday: true },
      horizonEndDate: "2027-06-30",
      horizonStartDate: "2026-09-08",
      nextDeparture: { departAt: "2026-09-15T08:05:00+01:00", itinerary: makeItinerary() },
      outcome: "ok",
      query: { from: { kind: "stop", stopId: "s1" }, to: { kind: "stop", stopId: "s3" }, effectiveDepartAt: "2026-09-14T10:19:00+01:00" },
      feedVersion: "test",
    });

    render(<App />);
    await userEvent.type(screen.getByLabelText("From"), "Funchal");
    await userEvent.click(await screen.findByText("Funchal - Praça"));
    await userEvent.type(screen.getByLabelText("To"), "Calheta");
    await userEvent.click(await screen.findByText("Calheta - Vila"));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText(/^No more buses on Monday/)).toBeInTheDocument();
  });

  it("Back returns to Search after a direct Results deep link", async () => {
    // Simulate opening a shared link fresh — no prior in-app navigation, so
    // there's nothing else pushing history for this "tab" beyond this one entry.
    history.replaceState(
      null,
      "",
      "/?f=s%3As1&fl=Funchal&t=s%3As3&tl=Calheta&go=1",
    );

    render(<App />);

    // Results screen, reached directly (no Search->Results click in this test)
    expect(await screen.findByText("08:05")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();

    window.history.back();

    await waitFor(() => expect(screen.getByLabelText("From")).toBeInTheDocument());
  });

  it("expanding a result collapses any other expanded result", async () => {
    vi.spyOn(fake, "plan").mockResolvedValueOnce({
      itineraries: [
        makeItinerary({ signature: "sig-1", departAt: "2026-09-08T08:05:00+01:00" }),
        makeItinerary({ signature: "sig-2", departAt: "2026-09-08T09:05:00+01:00" }),
      ],
      flags: { dateAdjustedFromPast: false, beyondPublishedHorizon: false, noMoreServiceToday: false },
      horizonEndDate: "2027-06-30",
      horizonStartDate: "2026-09-08",
      outcome: "ok",
      query: { from: { kind: "stop", stopId: "s1" }, to: { kind: "stop", stopId: "s3" }, effectiveDepartAt: "2026-09-08T08:00:00+01:00" },
      feedVersion: "test",
    });

    render(<App />);
    await userEvent.type(screen.getByLabelText("From"), "Funchal");
    await userEvent.click(await screen.findByText("Funchal - Praça"));
    await userEvent.type(screen.getByLabelText("To"), "Calheta");
    await userEvent.click(await screen.findByText("Calheta - Vila"));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    const cards = await screen.findAllByRole("button", { expanded: false });
    await userEvent.click(cards[0]);
    await waitFor(() => expect(screen.getAllByTestId("itin-map")).toHaveLength(1));

    await userEvent.click(cards[1]);
    await waitFor(() => expect(screen.getAllByTestId("itin-map")).toHaveLength(1));
    expect(cards[0]).toHaveAttribute("aria-expanded", "false");
    expect(cards[1]).toHaveAttribute("aria-expanded", "true");
  });
});
