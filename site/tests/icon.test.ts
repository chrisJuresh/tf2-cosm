import { describe, expect, it } from "vitest";

import { loadCatalogue } from "@/catalogue/load";
import { secureIconUrl } from "@/catalogue/icon";

describe("a Backpack Icon URL", () => {
  it("is upgraded to https, which is the only way a https page will load it", () => {
    expect(secureIconUrl("http://media.steampowered.com/apps/440/icons/boltboy.png")).toBe(
      "https://media.steampowered.com/apps/440/icons/boltboy.png",
    );
  });

  it("is left alone when it already is https", () => {
    const url = "https://steamcdn-a.akamaihd.net/apps/440/icons/boltboy.png";
    expect(secureIconUrl(url)).toBe(url);
  });

  it("covers every icon in the committed catalogue", () => {
    const insecure = loadCatalogue()
      .cosmetics.map((cosmetic) => cosmetic.backpackIcon)
      .filter((icon) => icon !== null)
      .flatMap((icon) => [icon.small, icon.large])
      .map(secureIconUrl)
      .filter((url) => !url.startsWith("https://"));
    expect(insecure).toEqual([]);
  });
});
