import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItineraryCard } from "./ItineraryCard.tsx";
import { makeItinerary } from "../test/fakePlanner.ts";

describe("ItineraryCard", () => {
  it("shows departure, arrival, duration and the line badge", () => {
    render(<ItineraryCard itinerary={makeItinerary()} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("08:05")).toBeInTheDocument();
    expect(screen.getByText("08:52")).toBeInTheDocument();
    expect(screen.getByText("47 min")).toBeInTheDocument();
    expect(screen.getByText("HF 1")).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
  });

  it("shows the walk chip only when there is a walking leg", () => {
    const { rerender } = render(
      <ItineraryCard itinerary={makeItinerary()} expanded={false} onToggle={() => {}} />,
    );
    expect(screen.queryByText("walk")).not.toBeInTheDocument();

    const withWalk = makeItinerary({
      legs: [
        {
          mode: "walk",
          from: { stopId: "@p", name: "Start", at: { lat: 0, lon: 0 } },
          to: { stopId: "s1", name: "Funchal - Praça", at: { lat: 0, lon: 0 } },
          departAt: "2026-09-08T08:00:00+01:00",
          arriveAt: "2026-09-08T08:06:00+01:00",
          distanceMeters: 400,
          summary: "6 min walk",
        },
        ...makeItinerary().legs,
      ],
    });
    rerender(<ItineraryCard itinerary={withWalk} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("walk")).toBeInTheDocument();
  });

  it("shows the last-trip badge only when flagged", () => {
    const { rerender } = render(
      <ItineraryCard itinerary={makeItinerary()} expanded={false} onToggle={() => {}} />,
    );
    expect(screen.queryByText("Last trip today")).not.toBeInTheDocument();
    rerender(
      <ItineraryCard
        itinerary={makeItinerary({ isLastTripToday: true })}
        expanded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByText("Last trip today")).toBeInTheDocument();
  });

  it("toggles and, when expanded, renders the stop sequence", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ItineraryCard itinerary={makeItinerary()} expanded={false} onToggle={onToggle} />,
    );
    await userEvent.click(screen.getByRole("button", { expanded: false }));
    expect(onToggle).toHaveBeenCalled();

    rerender(<ItineraryCard itinerary={makeItinerary()} expanded onToggle={onToggle} />);
    expect(screen.getByText("Câmara de Lobos")).toBeInTheDocument();
  });
});
