/**
 * The fallback chain, end to end: which Worn Render a row gets for a given
 * Cosmetic, Class, Team and Style, and what happens at each rung as the manifest
 * runs out of pictures.
 */
import { describe, expect, it } from "vitest";

import { fixtureManifest } from "./fixtures.ts";

import { joinRenderUrl, renderVersion } from "@/renders/base-url";
import { assertValidRenderManifest, EMPTY_MANIFEST } from "@/renders/manifest";
import { displayedClass, hasBluRender, hasItemRender, imageAt, pickRender } from "@/renders/select";

import { fixtureCosmetics } from "./fixtures.ts";

/** The list's size and the open row's size, as the components ask for them. */
const LIST_SIZE = 256;
const DETAIL_SIZE = 512;

function cosmetic(slug: string) {
  const found = fixtureCosmetics().find((one) => one.slug === slug);
  if (found === undefined) throw new Error(`no fixture Cosmetic ${slug}`);
  return found;
}

describe("the Class a row's picture shows", () => {
  it("shows an All-Class Cosmetic on the Class the viewer is looking at", () => {
    expect(displayedClass(cosmetic("ghastly-gibus"), "heavy")).toBe("heavy");
    expect(displayedClass(cosmetic("ghastly-gibus"), "spy")).toBe("spy");
  });

  it("shows a Multi-Class Cosmetic on the chosen Class when that Class can wear it", () => {
    expect(displayedClass(cosmetic("team-captain"), "demoman")).toBe("demoman");
  });

  it("falls back to the Cosmetic's own first Class when the chosen Class cannot wear it", () => {
    // A Class View never shows it, but a search across the whole catalogue with
    // a Class remembered from last time can.
    expect(displayedClass(cosmetic("team-captain"), "medic")).toBe("soldier");
  });

  it("shows a Class-Exclusive Cosmetic on its own Class with no Class chosen", () => {
    expect(displayedClass(cosmetic("bolt-boy"), null)).toBe("scout");
  });
});

describe("picking the render", () => {
  it("takes the exact render when the manifest has it", () => {
    const chosen = pickRender(
      fixtureManifest(),
      { slug: "tin-pot", gameClass: "soldier", team: "red", style: 1 },
      LIST_SIZE,
    );
    expect(chosen).toMatchObject({ team: "red", style: 1, fellBack: false });
    expect(chosen?.image.path).toBe("web/tin-pot/soldier-red-1@256.webp");
  });

  it("falls back to the default Style before it falls back to the other Team", () => {
    // Tin Pot has a Style 1 on RED and only a Style 0 on BLU. Asked for BLU
    // Style 1, the right answer is BLU Style 0: the other paint of the hat
    // beats the right paint of a different-looking hat.
    const chosen = pickRender(
      fixtureManifest(),
      { slug: "tin-pot", gameClass: "soldier", team: "blu", style: 1 },
      LIST_SIZE,
    );
    expect(chosen).toMatchObject({ team: "blu", style: 0, fellBack: true });
  });

  it("falls back to RED when the Cosmetic has no BLU render at all", () => {
    const chosen = pickRender(
      fixtureManifest(),
      { slug: "ghastly-gibus", gameClass: "heavy", team: "blu", style: 0 },
      LIST_SIZE,
    );
    expect(chosen).toMatchObject({ team: "red", style: 0, fellBack: true });
    expect(chosen?.image.path).toBe("web/ghastly-gibus/heavy-red-0@256.webp");
  });

  it("falls all the way through to RED's default Style", () => {
    // The Scotsman's Stove Pipe is rendered on RED Style 0 and nothing else.
    const chosen = pickRender(
      fixtureManifest(),
      { slug: "scotsmans-stove-pipe", gameClass: "demoman", team: "blu", style: 2 },
      LIST_SIZE,
    );
    expect(chosen).toMatchObject({ team: "red", style: 0, fellBack: true });
  });

  it("finds nothing for a Cosmetic the render job has never rendered", () => {
    expect(
      pickRender(fixtureManifest(), { slug: "dead-of-night", gameClass: "spy", team: "red", style: 0 }, LIST_SIZE),
    ).toBeNull();
  });

  it("finds nothing for a Class of an All-Class Cosmetic that has not been rendered yet", () => {
    // A run that did Heavy and Soldier and stopped leaves the other seven
    // Classes without a picture, and each of those rows wants its icon rather
    // than a Heavy wearing the hat.
    expect(
      pickRender(fixtureManifest(), { slug: "ghastly-gibus", gameClass: "medic", team: "red", style: 0 }, LIST_SIZE),
    ).toBeNull();
  });

  it("finds nothing in a manifest with nothing in it", () => {
    expect(
      pickRender(EMPTY_MANIFEST, { slug: "team-captain", gameClass: "soldier", team: "red", style: 0 }, LIST_SIZE),
    ).toBeNull();
  });
});

describe("picking which of the two pictures to show", () => {
  const asked = { slug: "team-captain", gameClass: "soldier", team: "red", style: 0 } as const;

  it("shows the Cosmetic on the Class unless the viewer asks for the other one", () => {
    const chosen = pickRender(fixtureManifest(), asked, DETAIL_SIZE);

    expect(chosen?.variant).toBe("worn");
    expect(chosen?.image.path).not.toContain("-alone");
  });

  it("shows the Cosmetic on its own when that is what was asked for", () => {
    const chosen = pickRender(fixtureManifest(), { ...asked, variant: "alone" }, DETAIL_SIZE);

    expect(chosen?.variant).toBe("alone");
    expect(chosen?.image.path).toContain("-alone");
  });

  it("falls back down the chain within the variant asked for, not out of it", () => {
    // Style 1 of the Tin Pot has an Item Render; BLU has no Style 1 at all, so
    // this is the Style falling back to RED, still with the Class out of it.
    const chosen = pickRender(
      fixtureManifest(),
      { slug: "tin-pot", gameClass: "soldier", team: "blu", style: 1, variant: "alone" },
      DETAIL_SIZE,
    );

    expect(chosen?.team).toBe("red");
    expect(chosen?.variant).toBe("alone");
    expect(chosen?.fellBack).toBe(true);
  });

  it("gives nothing rather than the Class back when no Item Render was ever made", () => {
    // The Backpack Icon is the honest answer: the picture asked for is one where
    // the Class is not in it, and the Worn Render is not that picture.
    const chosen = pickRender(
      fixtureManifest(),
      { slug: "ghastly-gibus", gameClass: "scout", team: "red", style: 0, variant: "alone" },
      LIST_SIZE,
    );

    expect(chosen).toBeNull();
  });
});

describe("whether the open Cosmetic offers a View toggle", () => {
  it("offers one when this Class has been rendered with the Cosmetic on its own", () => {
    expect(hasItemRender(fixtureManifest(), "team-captain", "soldier")).toBe(true);
  });

  it("offers none when only the Worn Render has been made", () => {
    expect(hasItemRender(fixtureManifest(), "ghastly-gibus", "scout")).toBe(false);
  });

  it("offers none for a Cosmetic with no renders at all", () => {
    expect(hasItemRender(fixtureManifest(), "dead-of-night", "spy")).toBe(false);
  });

  it("answers for the Class on show, not for the Cosmetic across every Class", () => {
    // The fixture has the Team Captain on its own for the Soldier and the
    // Demoman; a Class it was never rendered on has nothing to switch to.
    expect(hasItemRender(fixtureManifest(), "team-captain", "demoman")).toBe(true);
    expect(hasItemRender(fixtureManifest(), "tin-pot", "demoman")).toBe(false);
  });
});

describe("the size the page asks for", () => {
  it("takes the list's size in the list and the larger one in the open row", () => {
    const asked = { slug: "team-captain", gameClass: "soldier", team: "red", style: 0 } as const;
    expect(pickRender(fixtureManifest(), asked, LIST_SIZE)?.image).toMatchObject({
      path: "web/team-captain/soldier-red-0@256.webp",
      width: 256,
    });
    expect(pickRender(fixtureManifest(), asked, DETAIL_SIZE)?.image).toMatchObject({
      path: "web/team-captain/soldier-red-0@512.webp",
      width: 512,
    });
  });

  it("takes the master when the derive step has produced no web size yet", () => {
    // A render recorded between the render step and `render.derive` has an empty
    // derivatives map. It is the right picture at the wrong size, which beats a
    // hole in the page.
    const picture = fixtureManifest().renders["baronial-badge"]?.engineer?.red?.["0"]?.worn;
    expect(picture?.derivatives).toEqual({});
    expect(imageAt(picture!, LIST_SIZE)).toMatchObject({
      path: "masters/baronial-badge/engineer-red-0.png",
    });
  });

  it("takes the nearest size it has when the one asked for was never made", () => {
    const picture = fixtureManifest().renders["team-captain"]?.soldier?.red?.["0"]?.worn;
    expect(imageAt(picture!, 300)).toMatchObject({ width: 256 });
    expect(imageAt(picture!, 400)).toMatchObject({ width: 512 });
  });
});

describe("whether the open row offers a Team toggle", () => {
  it("offers one when the Class on show has a BLU render of its own", () => {
    expect(hasBluRender(fixtureManifest(), "tin-pot", "soldier")).toBe(true);
  });

  it("offers none when the Cosmetic was only ever rendered on RED", () => {
    expect(hasBluRender(fixtureManifest(), "ghastly-gibus", "heavy")).toBe(false);
  });

  it("offers none when the BLU entry is the RED image under another name", () => {
    // `team_fallback` is the render job saying the model has no BLU skin, so the
    // toggle would flip between two copies of one picture.
    expect(hasBluRender(fixtureManifest(), "crocodile-smile", "sniper")).toBe(false);
  });

  it("offers none for a Cosmetic with no renders at all", () => {
    expect(hasBluRender(fixtureManifest(), "dead-of-night", "spy")).toBe(false);
  });
});

describe("where the images are served from", () => {
  it("joins a base and a manifest path however either is punctuated", () => {
    expect(joinRenderUrl("/renders", "web/tin-pot/soldier-red-0@256.webp")).toBe(
      "/renders/web/tin-pot/soldier-red-0@256.webp",
    );
    expect(joinRenderUrl("https://images.example.com/renders/", "/web/a.webp")).toBe(
      "https://images.example.com/renders/web/a.webp",
    );
  });

  it("stamps a URL with the render's version, so a re-render is not the URL a CDN is holding", () => {
    expect(joinRenderUrl("/renders", "web/a.webp", "1758369600")).toBe("/renders/web/a.webp?v=1758369600");
  });

  it("leaves a URL unstamped when there is no version, rather than inventing one", () => {
    expect(joinRenderUrl("/renders", "web/a.webp")).toBe("/renders/web/a.webp");
    expect(joinRenderUrl("/renders", "web/a.webp", null)).toBe("/renders/web/a.webp");
  });

  it("turns the moment a render was made into a version, and two moments into two versions", () => {
    const made = renderVersion("2026-09-20T12:00:00+00:00");
    expect(made).toBe(String(Date.parse("2026-09-20T12:00:00+00:00") / 1000));
    expect(renderVersion("2026-09-21T12:00:00+00:00")).not.toBe(made);
  });

  it("reads the same moment written two ways as one version, because it is one render", () => {
    expect(renderVersion("2026-09-20T12:00:00+00:00")).toBe(renderVersion("2026-09-20T13:00:00+01:00"));
  });

  it("has no version for a timestamp it cannot read, rather than a URL that is nonsense", () => {
    expect(renderVersion("whenever")).toBeNull();
  });
});

describe("the manifest contract", () => {
  it("accepts an empty manifest, which is what the render job writes before it has run", () => {
    expect(assertValidRenderManifest({ version: 3, renders: {}, failures: [] })).toEqual(EMPTY_MANIFEST);
  });

  it("refuses a manifest of another version rather than reading it as this one", () => {
    expect(() => assertValidRenderManifest({ version: 2, renders: {}, failures: [] })).toThrow();
  });

  it("refuses an entry whose image has no path, so a hole cannot reach the page", () => {
    const broken = fixtureManifest();
    broken.renders["tin-pot"]!.soldier!.red!["0"]!.worn!.master.path = "";
    expect(() => assertValidRenderManifest(broken)).toThrow();
  });

  it("reads an entry that holds the Cosmetic alone and no Worn Render", () => {
    // A picture of each kind is optional, and the pair is what an entry is: the site must
    // not refuse a manifest from a run that rendered only one of them.
    const manifest = fixtureManifest();
    const entry = manifest.renders["team-captain"]!.soldier!.red!["0"]!;
    entry.worn = null;
    expect(() => assertValidRenderManifest(manifest)).not.toThrow();
  });
});
