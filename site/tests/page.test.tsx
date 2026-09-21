/**
 * The page itself, built from the committed catalogue exactly as `next build`
 * builds it — no fixture, no stub.
 *
 * The component tests either side of this one drive the view and the footer
 * apart from each other, which leaves the one thing neither of them can see:
 * whether the page actually puts them on the same screen. Deleting the footer
 * from the page would leave both of those suites green.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import CataloguePage from "@/app/page";

describe("the catalogue page", () => {
  it("puts the grid, the Dollar Basis switch and the credits on one page", () => {
    render(<CataloguePage />);

    expect(screen.getByRole("list", { name: "Cosmetics" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Dollar Basis" })).toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo")).getAllByRole("link")).not.toHaveLength(0);
  });

  it("quotes every rate out of the committed catalogue's own header", () => {
    // Not the fixture's rates: this is the file the site actually ships with,
    // so a header that had drifted out of schema would fail before a build did.
    render(<CataloguePage />);
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent(/1,833 Cosmetics/);
    expect(header).toHaveTextContent(/a Key is [\d.]+ ref/);
    expect(header).toHaveTextContent(/\$[\d.]+ a Key at the Steam Community Market/);
  });
});
