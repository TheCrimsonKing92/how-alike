import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ResultsPanel from "@/components/ResultsPanel";

describe("ResultsPanel", () => {
  it("annotates region descriptions with glossary tooltips", () => {
    render(
      <ResultsPanel
        scores={[{ region: "nose", score: 0.82 }]}
        texts={[{ region: "nose", text: "Narrow nasal bridge with defined philtrum" }]}
        hasDetailedAnalysis
      />
    );

    expect(screen.getByRole("listitem")).toHaveTextContent(/nose:\s*82\.0%/i);
    expect(screen.getByRole("button", { name: /nasal bridge/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /philtrum/i })).toBeInTheDocument();
  });

  it("omits tooltip when no description provided", () => {
    render(
      <ResultsPanel
        scores={[{ region: "chin", score: 0.54 }]}
        texts={[]}
        hasDetailedAnalysis
      />
    );

    expect(screen.getByRole("listitem")).toHaveTextContent("chin: 54.0%");
    expect(screen.queryByRole("button", { name: /chin/i })).not.toBeInTheDocument();
  });
});
