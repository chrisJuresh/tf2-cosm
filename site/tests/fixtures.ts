/**
 * The fixture catalogue every component test is driven from: eight Cosmetics that
 * between them cover a price in Metal, a price in Keys, the cheapest price there
 * is, Styles, an Unpriced item, an Event-Only Cosmetic and all three kinds.
 *
 * It is not a copy. This is the data job's own golden document, built from the
 * shared Cosmetic oracle — the one fixture the render job and the data job must
 * agree on — read where it lives. A copy would be a third derivative free to
 * drift; reading the original means a change to the catalogue's shape reaches
 * the site's tests the moment it lands.
 */
import { assertValidCatalogue, type Catalogue, type Cosmetic, type Metal } from "@tf2-cosm/data/catalogue";

import document from "../../data/tests/golden/catalogue.json" with { type: "json" };
import manifest from "./fixtures/renders.json" with { type: "json" };

import { chooseBasis, dollarBases } from "@/prices/format";
import { assertValidRenderManifest, type RenderManifest } from "@/renders/manifest";

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

/**
 * The fixture Worn Render manifest: one the render job itself wrote, covering
 * every rung of the fallback chain — a Cosmetic on two Classes, an All-Class
 * Cosmetic rendered for three of its nine, a Style on one Team and not the
 * other, a BLU entry that is really the RED image, a master with no web
 * derivative yet, a Cosmetic whose render failed and one never attempted.
 *
 * `tests/test_site_render_manifest.py` reads this same file back through the
 * render job's own validator, so it cannot drift into a manifest that job would
 * never write.
 */
export function fixtureManifest(): RenderManifest {
  return assertValidRenderManifest(structuredClone(manifest));
}
