/**
 * The catalogue's tokens, as a viewer reads them.
 */
import { describe, expect, it } from "vitest";

import { fixtureCosmetics } from "./fixtures.ts";

import { classesRead, priceDateRead, referenceVariantRead, unpricedReasonRead } from "@/catalogue/describe";

function fixture(slug: string) {
  const cosmetic = fixtureCosmetics().find((candidate) => candidate.slug === slug);
  if (cosmetic === undefined) throw new Error(`the fixture catalogue has no ${slug}`);
  return cosmetic;
}

describe("the Classes a Cosmetic can be worn by", () => {
  it("names the one Class of a Class-Exclusive Cosmetic", () => {
    expect(classesRead(fixture("bolt-boy"))).toBe("Scout");
  });

  it("names every Class of a Multi-Class Cosmetic", () => {
    expect(classesRead(fixture("team-captain"))).toBe("Soldier and Demoman");
  });

  it("says an All-Class Cosmetic is all of them rather than listing nine names", () => {
    expect(classesRead(fixture("ghastly-gibus"))).toBe("All nine Classes");
  });

  it("separates three or more Classes with commas and a final and", () => {
    const cosmetic = { ...fixture("team-captain"), classes: ["scout", "soldier", "pyro"] as const };
    expect(classesRead({ ...cosmetic, classes: [...cosmetic.classes] })).toBe("Scout, Soldier and Pyro");
  });
});

describe("the Reference Variant", () => {
  it("names the Quality and says the copy is craftable", () => {
    expect(referenceVariantRead({ quality: "unique", craftable: true })).toBe("Unique, craftable");
  });

  it("says so when the priced copy is the non-craftable one", () => {
    expect(referenceVariantRead({ quality: "unique", craftable: false })).toBe("Unique, non-craftable");
  });

  it("writes a Quality whose name is not just its token capitalised", () => {
    expect(referenceVariantRead({ quality: "collectors", craftable: true })).toBe("Collector's, craftable");
  });
});

describe("why a Cosmetic is Unpriced", () => {
  it("gives a reason a viewer can act on for every reason the job records", () => {
    expect(unpricedReasonRead("missing-from-source")).toBe("The price source lists no entry for it.");
    expect(unpricedReasonRead("no-reference-variant")).toContain("Reference Variant");
    expect(unpricedReasonRead("unsupported-currency")).toContain("Metal");
  });
});

describe("when the price was last updated", () => {
  it("is dated in UTC, so the same snapshot is not a day older in another timezone", () => {
    // 2026-09-07T23:30Z is still the 7th in London and already the 8th in Sydney.
    expect(priceDateRead("2026-09-07T23:30:00.000Z")).toBe("7 September 2026");
  });
});
