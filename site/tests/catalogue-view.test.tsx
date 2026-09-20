/**
 * What a viewer sees above the list and what changes when they change their mind
 * about what a dollar means: the Dollar Basis switch, the header's account of the
 * active basis, the Key Rate and how fresh the snapshot is.
 */
import type { Catalogue } from "@tf2-cosm/data/catalogue";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { fixtureCatalogue } from "./fixtures.ts";

import { CatalogueView } from "@/components/catalogue-view";

function renderView(catalogue: Catalogue = fixtureCatalogue()) {
  return render(<CatalogueView catalogue={catalogue} />);
}

/** Every dollar figure on screen, in the order the rows run. */
function dollarFigures(): string[] {
  const [, body] = screen.getAllByRole("rowgroup");
  if (body === undefined) throw new Error("the list should have a header and a body");
  return within(body)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[4]?.textContent?.trim() ?? "");
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
  // The fixture's five Cosmetics, priced at each basis's refined rate. Dead of
  // Night is Unpriced, and the Ghastly Gibus is worth a ninth of a Refined,
  // which is under a cent at every basis there is.
  const AT_STEAM_MARKET = ["$0.04", "—", "$0.00", "$5.15", "$0.56"];
  const AT_PRICE_SOURCE = ["$0.04", "—", "$0.00", "$5.31", "$0.58"];
  const AT_MANN_CO_STORE = ["$0.05", "—", "$0.00", "$5.60", "$0.61"];

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
    const [, body] = screen.getAllByRole("rowgroup");
    const teamCaptain = within(body!).getAllByRole("row")[3]!;
    expect(within(teamCaptain).getAllByRole("cell").map((cell) => cell.textContent?.trim())).toEqual([
      "",
      "Team Captain",
      "2 keys, 19.66 ref",
      "177 ref",
      "$5.60",
    ]);
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
    expect(dollarFigures()[3]).toBe("$5.60");
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
      expect(dollarFigures()[3]).toBe("$5.60");
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: real });
    }
  });
});

describe("the header", () => {
  it("says how many Cosmetics there are and what a Key is worth in Metal", () => {
    renderView();
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent(/5 Cosmetics/);
    expect(header).toHaveTextContent(/a Key is 78\.66 ref/);
  });

  it("says when the snapshot was taken, in a form a machine can read too", () => {
    renderView();
    const taken = within(screen.getByRole("banner")).getByText(/20 September 2026/);
    expect(taken).toHaveAttribute("dateTime", "2026-09-20T12:00:00.000Z");
    expect(taken.textContent).toContain("UTC");
  });
});

describe("a snapshot with no Dollar Bases in it", () => {
  it("offers no switch and shows no dollar figures, rather than an invented one", () => {
    const catalogue = fixtureCatalogue();
    renderView({ ...catalogue, header: { ...catalogue.header, dollarBases: null } });

    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(dollarFigures()).toEqual(["—", "—", "—", "—", "—"]);
    expect(screen.getByRole("banner")).not.toHaveTextContent(/a Key at the/);
  });
});
