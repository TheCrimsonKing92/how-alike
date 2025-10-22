import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DefinitionTooltip, annotateGlossaryText } from "@/components/DefinitionTooltip";

const setupMatchMedia = (matches: boolean) => {
  const mediaQuery = {
    matches,
    media: "(hover: hover) and (pointer: fine)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(mediaQuery),
  });

  return mediaQuery;
};

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: undefined,
  });
});

describe("DefinitionTooltip", () => {
  it("wraps glossary terms within text", () => {
    const { container } = render(
      <p>{annotateGlossaryText("Both show zygomatic prominence and a defined philtrum contour.")}</p>
    );
    const abbrs = container.querySelectorAll("abbr");
    expect(abbrs).toHaveLength(2);
    expect(abbrs[0]).toHaveTextContent(/zygomatic prominence/i);
    expect(abbrs[1]).toHaveTextContent(/philtrum/i);
  });

  it("shows tooltip content on hover when pointer supports hover", async () => {
    setupMatchMedia(true);
    const user = userEvent.setup();

    render(<DefinitionTooltip termId="zygomatic" />);

    const trigger = await screen.findByText("Zygomatic Prominence");
    await user.hover(trigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(
      "The outward projection of the cheekbone; determines how prominent or flat the midface appears."
    );
    expect(trigger).not.toHaveAttribute("title");
  });

  it("falls back to title attribute and toggles via click when hover is unavailable", async () => {
    setupMatchMedia(false);
    const user = userEvent.setup();

    render(<DefinitionTooltip termId="philtrum" />);

    const trigger = await screen.findByText("Philtrum");
    const container = trigger.closest("span");
    expect(container).toBeTruthy();

    await waitFor(() =>
      expect(trigger).toHaveAttribute(
        "title",
        "The vertical groove between the base of the nose and the upper lip."
      )
    );

    await user.click(container!);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("The vertical groove between the base of the nose and the upper lip.");
    await waitFor(() => expect(container).toHaveAttribute("aria-expanded", "true"));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });
});
