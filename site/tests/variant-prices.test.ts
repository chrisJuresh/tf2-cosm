/**
 * The Variant Prices document, on the reading side.
 *
 * The contract exists twice — the data job writes it against its own schema,
 * this validates what arrives over the network — so the thing worth asserting is
 * that the two agree. The subject is the data job's own golden file, read where
 * it lives rather than copied here, so a change to the document's shape reaches
 * this test the moment it lands.
 */
import golden from "../../data/tests/golden/variant-prices.json" with { type: "json" };
import { describe, expect, it } from "vitest";

import { readVariantPrices, variantPriceFor, VariantPricesError } from "@/prices/variant-prices";

/** The golden document's own snapshot time, which is the catalogue's. */
const SNAPSHOT = (golden as { header: { snapshotTakenAt: string } }).header.snapshotTakenAt;

describe("the Variant Prices as the site reads them", () => {
  it("accepts the document the data job actually writes", () => {
    const prices = readVariantPrices(structuredClone(golden), SNAPSHOT);
    expect(prices.header.counts.variants).toBeGreaterThan(0);
    expect(Object.keys(prices.bySlug).length).toBeGreaterThan(0);
  });

  it("finds what one Quality-and-craftability pair of a Cosmetic is worth", () => {
    const prices = readVariantPrices(structuredClone(golden), SNAPSHOT);
    // The Crocodile Smile takes its blanket Unique figure as the Reference
    // Price, so its Genuine price is nowhere in the catalogue — and is what a
    // Genuine copy of it is worth.
    const genuine = variantPriceFor(prices, "crocodile-smile", "genuine", true);
    expect(genuine?.scrap.mid).toBeGreaterThan(0);
    expect(genuine?.blanket).toBe(false);
  });

  it("has nothing for a Quality the source did not price, which is ordinary", () => {
    const prices = readVariantPrices(structuredClone(golden), SNAPSHOT);
    expect(variantPriceFor(prices, "crocodile-smile", "haunted", true)).toBeUndefined();
  });

  it("never carries an Unusual, which is priced by its effect", () => {
    const prices = readVariantPrices(structuredClone(golden), SNAPSHOT);
    const unusuals = Object.values(prices.bySlug)
      .flat()
      .filter((one) => one.quality === "unusual");
    expect(unusuals).toEqual([]);
  });

  it("refuses a document from a different snapshot than the catalogue", () => {
    // The two files are committed separately, so a half-updated pair is the one
    // way they can be wrong without either being malformed — and the figures
    // would be at the wrong Key Rate rather than visibly broken.
    expect(() => readVariantPrices(structuredClone(golden), "2020-01-01T00:00:00.000Z")).toThrow(VariantPricesError);
  });

  it("refuses a document that does not match its schema", () => {
    const broken = structuredClone(golden) as { schemaVersion: number };
    broken.schemaVersion = 99;
    expect(() => readVariantPrices(broken, SNAPSHOT)).toThrow(VariantPricesError);
  });

  it("refuses something that is not a document at all", () => {
    expect(() => readVariantPrices(null, SNAPSHOT)).toThrow(VariantPricesError);
    expect(() => readVariantPrices("{}", SNAPSHOT)).toThrow(VariantPricesError);
  });

  it("has nothing to look up in when no document loaded", () => {
    expect(variantPriceFor(null, "crocodile-smile", "unique", true)).toBeUndefined();
  });
});
