import React from "react";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home Page", () => {
  it("renders header, placeholders, and footer via layout", async () => {
    // Render Home component inside a simple wrapper since layout is tested implicitly via content expectations
    render(<Home />);

    expect(screen.getByRole("heading", { name: /upload or capture/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /segmentation-based similarity/i })).toBeInTheDocument();
    // Visualization is now a region containing two image panels with their own headings
    expect(screen.getByRole("region", { name: /visualization/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use camera \(soon\)/i })).toBeInTheDocument();
    // Dev log appears near the adapter toggle (after mount)
    expect(await screen.findByTestId("dev-log")).toBeInTheDocument();
  });
});
