/**
 * The fixture catalogue every component test is driven from: five Cosmetics that
 * between them cover a price in Metal, a price in Keys, the cheapest price there
 * is, Styles, an Unpriced item and all three kinds. It is a copy of the document
 * the data job builds from the shared Cosmetic oracle, so it is shaped exactly
 * like the committed catalogue and is validated against the schema in
 * `catalogue.test.ts`.
 */
import { assertValidCatalogue, type Catalogue, type Cosmetic, type Metal } from "@tf2-cosm/data/catalogue";

import document from "./fixtures/catalogue.json" with { type: "json" };

import { steamMarketBasis } from "@/prices/format";

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

/** A Dollar Basis at a round $2.49 a Key, so the arithmetic in tests is readable. */
export function fixtureBasis() {
  return steamMarketBasis(2.49, fixtureKeyRate());
}
