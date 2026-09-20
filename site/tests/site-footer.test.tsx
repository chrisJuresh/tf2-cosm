/**
 * The footer is where the site says whose work it is showing. Nothing on the
 * page is the site's own: the schema, the icons and the game assets are Valve's,
 * the prices are the price source's, the Key's dollar price is the Steam
 * Community Market's, and the renders exist because of SourceIO.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/site-footer";

describe("the credits footer", () => {
  it("credits every source the page is built from, each one linked", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    const credits = within(footer)
      .getAllByRole("link")
      .map((link) => [link.textContent?.trim(), link.getAttribute("href")]);

    expect(credits).toEqual([
      ["Valve", "https://www.teamfortress.com/"],
      ["backpack.tf", "https://backpack.tf/"],
      ["Steam Community Market", "https://steamcommunity.com/market/"],
      ["SourceIO", "https://github.com/REDxEYE/SourceIO"],
    ]);
  });

  it("says what each source gave the page, not just that it exists", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(/item schema, icons and game assets/i);
    expect(footer).toHaveTextContent(/prices/i);
    expect(footer).toHaveTextContent(/key's dollar price/i);
    expect(footer).toHaveTextContent(/model import/i);
  });

  it("sends every outbound link off without handing this page's address along", () => {
    render(<SiteFooter />);
    for (const link of within(screen.getByRole("contentinfo")).getAllByRole("link")) {
      expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    }
  });
});
