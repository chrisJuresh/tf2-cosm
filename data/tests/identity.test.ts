import { describe, expect, it } from "vitest";

import { displayName, slugify } from "../src/catalogue/identity.ts";

describe("displayName", () => {
  it("strips a leading The, whatever its case", () => {
    expect(displayName("The Team Captain")).toBe("Team Captain");
    expect(displayName("the Tin Pot")).toBe("Tin Pot");
  });

  it("leaves a name that only starts with those letters alone", () => {
    expect(displayName("Thermal Tracker")).toBe("Thermal Tracker");
  });

  it("is idempotent", () => {
    expect(displayName(displayName("The Triad Trinket"))).toBe("Triad Trinket");
  });
});

describe("slugify", () => {
  it("is lowercase, ASCII and hyphen-separated", () => {
    expect(slugify("Team Captain")).toBe("team-captain");
    expect(slugify("Dr. Whoa")).toBe("dr-whoa");
    expect(slugify("Cheater's Lament")).toBe("cheater-s-lament");
  });

  it("folds accents and spells out an ampersand", () => {
    expect(slugify("Sécurité Blanket")).toBe("securite-blanket");
    expect(slugify("Cap & Gown")).toBe("cap-and-gown");
  });

  it("refuses a name with nothing to slug", () => {
    expect(() => slugify("!!!")).toThrow();
  });
});
