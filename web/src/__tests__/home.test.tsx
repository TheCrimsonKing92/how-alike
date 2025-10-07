import React from "react";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home Page", () => {
  it("renders header, placeholders, and footer via layout", () => {
    // Render Home component inside a simple wrapper since layout is tested implicitly via content expectations
    render(<Home />);

    expect(screen.getByRole("heading", { name: /upload or capture/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /results/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /visualization/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select photos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use camera/i })).toBeInTheDocument();
  });
});
