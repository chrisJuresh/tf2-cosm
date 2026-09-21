/**
 * What a viewer sees around the grid and what changes when they change their
 * mind about what a dollar means: the Dollar Basis switch, the header's account
 * of the active basis and the Key Rate, and the footer's account of how fresh
 * the snapshot and that basis's own rate are.
 */
import type { Catalogue } from "@tf2-cosm/data/catalogue";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { fixtureCatalogue } from "./fixtures.ts";

import { CatalogueView } from "@/components/catalogue-view";
import { EMPTY_MANIFEST } from "@/renders/manifest";

function renderView(catalogue: Catalogue = fixtureCatalogue()) {
  return render(<CatalogueView catalogue={catalogue} manifest={EMPTY_MANIFEST} />);
}

/**
 * Every dollar figure on screen, against the Cosmetic it belongs to. Keyed by
 * name rather than by row, because the fixture is the shared Cosmetic oracle and
 * grows whenever a new case has to be covered; a test that counted rows would
 * break on a change that has nothing to do with it.
 */
function dollarFigures(): Record<string, string> {
  return Object.fromEntries(
    screen
      .getAllByRole("listitem")
      .filter((card) => card.dataset["slug"] !== undefined)
      .map((card) => [within(card).getByRole("button").textContent?.trim() ?? "", figureOn(card, "Dollars")]),
  );
}

/** One named figure on a card, found by the name a screen reader hears for it. */
function figureOn(card: HTMLElement, term: string): string {
  const terms = within(card).getAllByRole("term");
  const values = within(card).getAllByRole("definition");
  const at = terms.findIndex((one) => one.textContent?.trim() === term);
  if (at === -1) throw new Error(`no ${term} on this card`);
  return values[at]?.textContent?.trim() ?? "";
}

function chooseBasisNamed(name: RegExp): void {
  fireEvent.click(screen.getByRole("radio", { name }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("the Dollar Basis switch", () => {
  it("offers all three bases the snapshot carries", () => {
    renderView();
    expect(
      within(screen.getByRole("radiogroup", { name: /dollar basis/i }))
        .getAllByRole("radio")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["steam-community-market", "price-source", "mann-co-store"]);
  });

  it("shows today's rate against each basis, so the choice is never blind", () => {
    renderView();
    const group = screen.getByRole("radiogroup", { name: /dollar basis/i });
    expect(within(group).getByRole("radio", { name: /Steam Community Market/ })).toHaveAccessibleName(
      /\$2\.29 a Key/,
    );
    expect(within(group).getByRole("radio", { name: /backpack\.tf estimate/ })).toHaveAccessibleName(/\$2\.36 a Key/);
    expect(within(group).getByRole("radio", { name: /Mann Co\. Store/ })).toHaveAccessibleName(/\$2\.49 a Key/);
  });

  it("starts on the Steam Community Market", () => {
    renderView();
    expect(screen.getByRole("radio", { name: /Steam Community Market/ })).toBeChecked();
  });
});

describe("switching the Dollar Basis", () => {
  // The fixture's Cosmetics, priced at each basis's refined rate. Dead of Night
  // is Unpriced; the Ghastly Gibus is worth a ninth of a Refined, which is under
  // a cent at every basis there is; and the two Blanket Prices read as about,
  // because the source quotes them for every cheap hat rather than for these
  // (ADR-0004).
  const AT_STEAM_MARKET = {
    "Baronial Badge": "$0.18",
    "Bolt Boy": "$0.04",
    "Crocodile Smile": "≈$0.04",
    "Dead of Night": "—",
    "Ghastly Gibus": "$0.00",
    "Scotsman's Stove Pipe": "≈$0.04",
    "Team Captain": "$5.15",
    "Tin Pot": "$0.56",
  };
  const AT_PRICE_SOURCE = { ...AT_STEAM_MARKET, "Team Captain": "$5.31", "Tin Pot": "$0.58" };
  const AT_MANN_CO_STORE = {
    ...AT_STEAM_MARKET,
    "Baronial Badge": "$0.19",
    "Bolt Boy": "$0.05",
    "Team Captain": "$5.60",
    "Tin Pot": "$0.61",
  };

  it("recomputes every dollar figure on screen", () => {
    renderView();
    expect(dollarFigures()).toEqual(AT_STEAM_MARKET);

    chooseBasisNamed(/backpack\.tf estimate/);
    expect(dollarFigures()).toEqual(AT_PRICE_SOURCE);

    chooseBasisNamed(/Mann Co\. Store/);
    expect(dollarFigures()).toEqual(AT_MANN_CO_STORE);
  });

  it("leaves the Trader Notation and the Metal Value alone, which no basis touches", () => {
    renderView();
    chooseBasisNamed(/Mann Co\. Store/);
    const teamCaptain = screen
      .getAllByRole("listitem")
      .find((card) => card.getAttribute("data-slug") === "team-captain")!;
    expect(figureOn(teamCaptain, "Trader Notation")).toBe("2 keys, 19.66 ref");
    expect(figureOn(teamCaptain, "Metal Value")).toBe("177 ref");
    expect(figureOn(teamCaptain, "Dollars")).toBe("$5.60");
  });

  it("says in the header which basis is active and what a Key costs under it", () => {
    renderView();
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent(/\$2\.29 a Key at the Steam Community Market/);

    chooseBasisNamed(/Mann Co\. Store/);
    expect(header).toHaveTextContent(/\$2\.49 a Key at the Mann Co\. Store/);
  });
});

describe("the basis a viewer chose", () => {
  it("is still the one in force when they come back", () => {
    const { unmount } = renderView();
    chooseBasisNamed(/Mann Co\. Store/);
    unmount();

    renderView();
    expect(screen.getByRole("radio", { name: /Mann Co\. Store/ })).toBeChecked();
    expect(dollarFigures()["Team Captain"]).toBe("$5.60");
  });

  it("gives way to the default when the snapshot no longer offers it", () => {
    // A basis remembered in a browser outlives the snapshot that offered it.
    localStorage.setItem("tf2-cosm.dollar-basis", "price-source");
    const catalogue = fixtureCatalogue();
    const bases = catalogue.header.dollarBases!;
    renderView({ ...catalogue, header: { ...catalogue.header, dollarBases: { ...bases, priceSource: null } } });

    expect(screen.getByRole("radio", { name: /Steam Community Market/ })).toBeChecked();
  });

  it("survives a browser that refuses to remember anything", () => {
    // A private window throws on the first read rather than answering nothing.
    const refuse = () => {
      throw new Error("access denied");
    };
    const storage = { getItem: refuse, setItem: refuse } as unknown as Storage;
    const real = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    try {
      renderView();
      chooseBasisNamed(/Mann Co\. Store/);
      expect(dollarFigures()["Team Captain"]).toBe("$5.60");
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: real });
    }
  });
});

describe("the header", () => {
  it("says how many Cosmetics there are and what a Key is worth in Metal", () => {
    renderView();
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent(/8 Cosmetics/);
    expect(header).toHaveTextContent(/a Key is 78\.66 ref/);
  });

  it("leaves the snapshot's own age to the footer, where the rest of the provenance is", () => {
    renderView();
    expect(screen.getByRole("banner")).not.toHaveTextContent(/Snapshot taken/);
  });
});

describe("the provenance in the footer", () => {
  it("says when the snapshot was taken, in a form a machine can read too", () => {
    renderView();
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(/Snapshot taken 20 September 2026 at 12:00 UTC/);
    expect(within(footer).getAllByRole("time")[0]).toHaveAttribute("dateTime", "2026-09-20T12:00:00.000Z");
  });

  it("says when the active basis's own rate was quoted, which can be weeks older", () => {
    // The snapshot is from 20 September; backpack.tf last repriced a Refined on
    // the 8th. A viewer told only the snapshot's age would read the rate as
    // twelve days fresher than it is.
    renderView();
    chooseBasisNamed(/backpack\.tf estimate/);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(/backpack\.tf estimate rate quoted 08 September 2026 at 20:40 UTC/);
    expect(within(footer).getAllByRole("time")[1]).toHaveAttribute("dateTime", "2026-09-08T20:40:00.000Z");
  });

  it("claims no such date for the Mann Co. Store, whose constant has none", () => {
    renderView();
    chooseBasisNamed(/Mann Co\. Store/);
    expect(screen.getByRole("contentinfo")).not.toHaveTextContent(/rate quoted/);
  });
});

describe("a snapshot with no Dollar Bases in it", () => {
  it("offers no switch and shows no dollar figures, rather than an invented one", () => {
    const catalogue = fixtureCatalogue();
    renderView({ ...catalogue, header: { ...catalogue.header, dollarBases: null } });

    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(Object.values(dollarFigures()).every((figure) => figure === "—")).toBe(true);
    expect(screen.getByRole("banner")).not.toHaveTextContent(/a Key at the/);
  });
});
