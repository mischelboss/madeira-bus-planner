import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LineBadge } from "./LineBadge.tsx";

const route = { operator: "HF" as const, shortName: "1" };

describe("LineBadge", () => {
  it("renders no swatch when accentColor is omitted", () => {
    const { container } = render(<LineBadge route={route} />);
    expect(container.querySelector(".line-badge-accent")).not.toBeInTheDocument();
    expect(container.querySelector(".line-badge")).toHaveTextContent("HF 1");
  });

  it("renders a swatch carrying the given accent color", () => {
    const { container } = render(<LineBadge route={route} accentColor="#2a78d6" />);
    const swatch = container.querySelector(".line-badge-accent");
    expect(swatch).toBeInTheDocument();
    expect((swatch as HTMLElement).style.getPropertyValue("--line-badge-accent")).toBe("#2a78d6");
  });
});
