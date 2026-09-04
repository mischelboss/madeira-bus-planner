import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlannerProvider } from "../planner/index.ts";
import { makeFakePlanner } from "../test/fakePlanner.ts";
import { SearchScreen } from "./SearchScreen.tsx";

const planner = makeFakePlanner();

function renderSearch() {
  return render(
    <PlannerProvider value={planner}>
      <SearchScreen />
    </PlannerProvider>,
  );
}

describe("SearchScreen", () => {
  beforeEach(() => history.replaceState(null, "", "/"));
  afterEach(() => history.replaceState(null, "", "/"));

  it("disables Search until both endpoints are picked", async () => {
    renderSearch();
    const search = screen.getByRole("button", { name: "Search" });
    expect(search).toBeDisabled();

    await userEvent.type(screen.getByLabelText("From"), "Funchal");
    await screen.findByText("Funchal - Praça");
    await userEvent.click(screen.getByText("Funchal - Praça"));

    expect(search).toBeDisabled(); // still only one endpoint

    await userEvent.type(screen.getByLabelText("To"), "Calheta");
    await userEvent.click(await screen.findByText("Calheta - Vila"));

    await waitFor(() => expect(search).toBeEnabled());
  });

  it("autocomplete matches on the town, not just the stop name", async () => {
    renderSearch();
    await userEvent.type(screen.getByLabelText("From"), "Estreito");
    // "Igreja" is in Estreito da Calheta — found by town
    expect(await screen.findByText("Igreja")).toBeInTheDocument();
  });

  it("swaps From and To", async () => {
    renderSearch();
    await userEvent.type(screen.getByLabelText("From"), "Funchal");
    await userEvent.click(await screen.findByText("Funchal - Praça"));
    await userEvent.type(screen.getByLabelText("To"), "Calheta");
    await userEvent.click(await screen.findByText("Calheta - Vila"));

    await userEvent.click(screen.getByRole("button", { name: "Swap from and to" }));

    expect(screen.getByLabelText("From")).toHaveValue("Calheta - Vila · Calheta");
    expect(screen.getByLabelText("To")).toHaveValue("Funchal - Praça · Funchal");
  });
});
