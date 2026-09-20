/**
 * The fixture catalogue every component test is driven from: five Cosmetics that
 * between them cover a price in Metal, a price in Keys, the cheapest price there
 * is, Styles, an Unpriced item and all three kinds.
 *
 * It is not a copy. This is the data job's own golden document, built from the
 * shared Cosmetic oracle — the one fixture the render job and the data job must
 * agree on — read where it lives. A copy would be a third derivative free to
 * drift; reading the original means a change to the catalogue's shape reaches
 * the site's tests the moment it lands.
 */
import { assertValidCatalogue, type Catalogue, type Cosmetic, type Metal } from "@tf2-cosm/data/catalogue";

import document from "../../data/tests/golden/catalogue.json" with { type: "json" };

import { chooseBasis, dollarBases } from "@/prices/format";

export function fixtureCatalogue(): Catalogue {
  return assertValidCatalogue(structuredClone(document));
}

export function fixtureCosmetics(): Cosmetic[] {
  return fixtureCatalogue().cosmetics;
}

/** The fixture's Key Rate: 78.66 ref to the Key. */
export function fixtureKeyRate(): Metal {
  const prices = fixtureCatalogue().header.prices;
  if (prices === null) throw new Error("the fixture catalogue is meant to carry prices");
  return prices.keyRate;
}

/** The fixture's three Dollar Bases: $2.29, $2.36 and $2.49 a Key. */
export function fixtureBases() {
  const bases = dollarBases(fixtureCatalogue().header.dollarBases);
  if (bases.length === 0) throw new Error("the fixture catalogue is meant to carry Dollar Bases");
  return bases;
}

/** The fixture's default basis: the Steam Community Market's lowest listing, $2.29 a Key. */
export function fixtureBasis() {
  const basis = chooseBasis(fixtureBases(), null);
  if (basis === null) throw new Error("the fixture catalogue is meant to carry a Steam Market rate");
  return basis;
}
