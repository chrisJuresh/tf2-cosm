/**
 * The pictures, as a viewer meets them: the Worn Render on a card, the icon
 * where there is no render, the Class the picture shows following the Class
 * View, and the Style switcher, Team toggle and View toggle in the open
 * Cosmetic's modal.
 *
 * Driven by the fixture manifest, which the render job itself wrote — see
 * `tests/fixtures.ts`. Nothing here asserts how the fallback chain is walked;
 * that is `renders.test.ts`. These are what ends up on the page.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  fixtureBasis,
  fixtureCosmetics,
  fixtureKeyRate,
  fixtureManifest,
  fixtureSnapshotTakenAt,
} from "./fixtures.ts";

import { CatalogueBrowser, PICTURES_STORAGE_KEY } from "@/components/catalogue-browser";
import { CosmeticGrid } from "@/components/cosmetic-grid";
import { renderVersion } from "@/renders/base-url";

function renderList(overrides: Partial<Parameters<typeof CosmeticGrid>[0]> = {}) {
  return render(
    <CosmeticGrid
      cosmetics={fixtureCosmetics()}
      manifest={fixtureManifest()}
      classView={null}
      keyRate={fixtureKeyRate()}
      basis={fixtureBasis()}
      {...overrides}
    />,
  );
}

/**
 * The whole browser, controls and all — used where what is being asserted is a
 * viewer working a control rather than a row drawing itself.
 */
function renderBrowser() {
  render(
    <CatalogueBrowser
      cosmetics={fixtureCosmetics()}
      manifest={fixtureManifest()}
      keyRate={fixtureKeyRate()}
      basis={fixtureBasis()}
      snapshotTakenAt={fixtureSnapshotTakenAt()}
    />,
  );
  return userEvent.setup();
}

function cardFor(slug: string): HTMLElement {
  const card = document.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
  if (card === null) throw new Error(`no card for ${slug}`);
  return card;
}

/** The picture on a closed card. */
function pictureIn(slug: string): HTMLImageElement {
  return within(cardFor(slug)).getByRole("img");
}

/**
 * Which picture an `<img>` is showing, with the version the URL is stamped with
 * left off. Nearly everything below is about which image the chain chose, and
 * reads better for not repeating when it was rendered; that the stamp is there
 * at all is its own test.
 */
function pictureSrc(image: HTMLImageElement): string {
  return image.getAttribute("src")?.split("?")[0] ?? "";
}

function panelFor(slug: string): HTMLElement {
  const panel = document.getElementById(`cosmetic-detail-${slug}`);
  if (panel === null) throw new Error(`${slug} is not open`);
  return panel;
}

/** The picture in the open Cosmetic's modal, which is the larger one. */
function pictureInPanel(slug: string): HTMLImageElement {
  return within(panelFor(slug)).getByRole("img");
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// The browser remembers the controls, so a Class chosen in one test would still
// be chosen in the next.
afterEach(() => {
  localStorage.clear();
});

describe("the picture a card shows", () => {
  it("shows the Worn Render where the manifest has one, at the grid's size", () => {
    renderList();
    expect(pictureSrc(pictureIn("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0@256.webp");
  });

  it("stamps the picture with when it was rendered, so a re-render is a new URL", () => {
    // Without it, a re-rendered image keeps the path it had and a CDN goes on
    // serving last week's bytes until each object expires on its own schedule —
    // which is how one Cosmetic showed two different framings at two sizes.
    renderList();
    const made = fixtureManifest().renders["team-captain"]!.soldier!.red!["0"]!.rendered_at;
    expect(pictureIn("team-captain").getAttribute("src")).toBe(
      `/renders/web/team-captain/soldier-red-0@256.webp?v=${renderVersion(made)}`,
    );
  });

  it("names the Cosmetic and the Class wearing it, so the picture reads aloud", () => {
    renderList();
    expect(pictureIn("team-captain")).toHaveAccessibleName("Team Captain worn by the Soldier");
  });

  it("loads every picture lazily, because the grid is eighteen hundred of them", () => {
    renderList();
    expect(pictureIn("team-captain")).toHaveAttribute("loading", "lazy");
    expect(pictureIn("dead-of-night")).toHaveAttribute("loading", "lazy");
  });

  it("falls back to the Backpack Icon for a Cosmetic the render job has never rendered", () => {
    renderList();
    const icon = pictureIn("dead-of-night");
    expect(icon.getAttribute("src")).toContain("dead_of_night");
    expect(icon).toHaveAccessibleName("Dead of Night");
  });

  it("falls back to the Backpack Icon for a Cosmetic whose render failed", () => {
    // The fixture manifest records the Bolt Boy as model-missing. A failure and
    // a Cosmetic nobody has tried are the same picture to a viewer.
    renderList();
    expect(pictureIn("bolt-boy").getAttribute("src")).toContain("boltboy");
  });

  it("shows the master when the derive step has not made a web size yet", () => {
    renderList();
    expect(pictureSrc(pictureIn("baronial-badge"))).toBe("/renders/masters/baronial-badge/engineer-red-0.png");
  });

  it("falls back to the icon when a render that ought to exist will not load", () => {
    // The manifest says an image was written; it does not say it is being
    // served. A bucket mid-sync or a cleared local folder must not leave a hole.
    renderList();
    fireEvent.error(pictureIn("team-captain"));
    expect(pictureIn("team-captain").getAttribute("src")).toContain("soldier_officer");
  });

  it("gives up rather than taking turns when the icon will not load either", () => {
    // Remembering only the last failure would make the render eligible again the
    // moment the icon failed, and the two would alternate for ever.
    renderList();
    fireEvent.error(pictureIn("team-captain"));
    fireEvent.error(pictureIn("team-captain"));
    expect(within(cardFor("team-captain")).queryByRole("img")).toBeNull();
  });

  it("leaves a blank rather than a broken image when there is neither a render nor an icon", () => {
    const cosmetics = fixtureCosmetics().map((cosmetic) =>
      cosmetic.slug === "dead-of-night" ? { ...cosmetic, backpackIcon: null } : cosmetic,
    );
    renderList({ cosmetics });
    expect(within(cardFor("dead-of-night")).queryByRole("img")).toBeNull();
  });

  it("points every picture on screen at the manifest or at Valve, and at nothing else", () => {
    // Every card the virtualiser has mounted: none may end up asking for a path
    // the manifest does not carry. jsdom mounts a screenful, so this is the
    // cards a viewer can see rather than all eighteen hundred — the sweep over a real
    // built page, with no failed request, is #17.
    renderList();
    const paths = new Set<string>();
    for (const entries of Object.values(fixtureManifest().renders)) {
      for (const byTeam of Object.values(entries)) {
        for (const byStyle of Object.values(byTeam)) {
          for (const entry of Object.values(byStyle)) {
            for (const picture of [entry.worn, entry.alone]) {
              if (picture === null) continue;
              paths.add(`/renders/${picture.master.path}`);
              for (const image of Object.values(picture.derivatives)) paths.add(`/renders/${image.path}`);
            }
          }
        }
      }
    }
    const icons = new Set(
      fixtureCosmetics().flatMap((cosmetic) =>
        cosmetic.backpackIcon === null ? [] : [cosmetic.backpackIcon.small, cosmetic.backpackIcon.large],
      ),
    );
    for (const picture of screen.getAllByRole("img")) {
      const src = pictureSrc(picture as HTMLImageElement);
      expect(paths.has(src) || icons.has(src.replace("https://", "http://")) || icons.has(src)).toBe(true);
    }
  });
});

describe("the Class the picture shows", () => {
  it("changes the render an All-Class Cosmetic shows when the viewer switches Class", async () => {
    const user = renderBrowser();
    const picker = screen.getByRole("combobox", { name: "Class" });

    await user.selectOptions(picker, "scout");
    expect(pictureSrc(pictureIn("ghastly-gibus"))).toBe("/renders/web/ghastly-gibus/scout-red-0@256.webp");

    await user.selectOptions(picker, "heavy");
    expect(pictureSrc(pictureIn("ghastly-gibus"))).toBe("/renders/web/ghastly-gibus/heavy-red-0@256.webp");
    expect(pictureIn("ghastly-gibus")).toHaveAccessibleName("Ghastly Gibus worn by the Heavy");
  });

  it("shows an All-Class Cosmetic on its own first Class with no Class chosen", () => {
    renderList();
    expect(pictureSrc(pictureIn("ghastly-gibus"))).toBe("/renders/web/ghastly-gibus/scout-red-0@256.webp");
  });

  it("shows a Multi-Class Cosmetic on the chosen Class when that Class can wear it", () => {
    renderList({ classView: "demoman" });
    expect(pictureSrc(pictureIn("team-captain"))).toBe("/renders/web/team-captain/demoman-red-0@256.webp");
  });

  it("falls back to the Backpack Icon for a Class of an All-Class Cosmetic nobody has rendered", () => {
    // The fixture has the Gibus on Scout, Soldier and Heavy only. A Medic
    // looking at it gets the icon, not a Heavy wearing it.
    renderList({ classView: "medic" });
    // The large one: a row draws its picture at the size the open row does.
    expect(pictureIn("ghastly-gibus").getAttribute("src")).toContain("/gibus_large.");
  });
});

describe("the open card", () => {
  it("shows the larger derivative", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Team Captain" }));
    expect(pictureSrc(pictureInPanel("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0@512.webp");
  });

  it("offers a Style switcher for a Cosmetic with Styles, and changes the picture with it", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Tin Pot" }));
    const styles = within(panelFor("tin-pot")).getByRole("group", { name: "Style" });
    expect(within(styles).getAllByRole("button").map((button) => button.textContent)).toEqual(["Closed", "Open"]);

    await user.click(within(styles).getByRole("button", { name: "Open" }));
    expect(pictureSrc(pictureInPanel("tin-pot"))).toBe("/renders/web/tin-pot/soldier-red-1@512.webp");
    expect(within(styles).getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers no Style switcher for a Cosmetic with one look", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Team Captain" }));
    expect(within(panelFor("team-captain")).queryByRole("group", { name: "Style" })).toBeNull();
  });

  it("offers a Team toggle where a BLU render exists, and changes the picture with it", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Team Captain" }));
    const teams = within(panelFor("team-captain")).getByRole("group", { name: "Team" });
    expect(within(teams).getAllByRole("button").map((button) => button.textContent)).toEqual(["RED", "BLU"]);

    await user.click(within(teams).getByRole("button", { name: "BLU" }));
    expect(pictureSrc(pictureInPanel("team-captain"))).toBe("/renders/web/team-captain/soldier-blu-0@512.webp");
  });

  it("offers no Team toggle for a Cosmetic rendered on RED alone", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Ghastly Gibus" }));
    expect(within(panelFor("ghastly-gibus")).queryByRole("group", { name: "Team" })).toBeNull();
  });

  it("offers no Team toggle when the BLU entry is the RED image under another name", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Crocodile Smile" }));
    expect(within(panelFor("crocodile-smile")).queryByRole("group", { name: "Team" })).toBeNull();
  });

  it("falls back a Style at a time: BLU Style 1 does not exist, so BLU Style 0 shows", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Tin Pot" }));
    const panel = panelFor("tin-pot");
    await user.click(within(panel).getByRole("button", { name: "Open" }));
    await user.click(within(panel).getByRole("button", { name: "BLU" }));
    expect(pictureSrc(pictureInPanel("tin-pot"))).toBe("/renders/web/tin-pot/soldier-blu-0@512.webp");
  });

  it("opens the next Cosmetic on its own default rather than the last one's Style", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Tin Pot" }));
    await user.click(within(panelFor("tin-pot")).getByRole("button", { name: "Open" }));

    // Closed and opened again: the Style a viewer was looking at last time is
    // not what they asked for this time.
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Tin Pot" }));
    expect(pictureSrc(pictureInPanel("tin-pot"))).toBe("/renders/web/tin-pot/soldier-red-0@512.webp");
  });

  it("offers a View toggle where the Cosmetic was rendered on its own, and takes the Class out", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Team Captain" }));
    const view = within(panelFor("team-captain")).getByRole("group", { name: "View" });
    expect(within(view).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "On the Class",
      "On its own",
    ]);

    await user.click(within(view).getByRole("button", { name: "On its own" }));
    expect(pictureSrc(pictureInPanel("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0-alone@512.webp");
    // The Class is out of the picture, so it is out of what the picture is called.
    expect(pictureInPanel("team-captain")).toHaveAccessibleName("Team Captain, on its own");
  });

  it("goes back to the Class with the same toggle", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Team Captain" }));
    const view = within(panelFor("team-captain")).getByRole("group", { name: "View" });

    await user.click(within(view).getByRole("button", { name: "On its own" }));
    await user.click(within(view).getByRole("button", { name: "On the Class" }));

    expect(pictureSrc(pictureInPanel("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0@512.webp");
    expect(within(view).getByRole("button", { name: "On the Class" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the Team and the Style the viewer is on when the Class steps out", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Tin Pot" }));
    const panel = panelFor("tin-pot");

    await user.click(within(panel).getByRole("button", { name: "Open" }));
    await user.click(within(panel).getByRole("button", { name: "On its own" }));

    expect(pictureSrc(pictureInPanel("tin-pot"))).toBe("/renders/web/tin-pot/soldier-red-1-alone@512.webp");
  });

  it("offers no View toggle for a Cosmetic nobody has rendered on its own", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Ghastly Gibus" }));
    expect(within(panelFor("ghastly-gibus")).queryByRole("group", { name: "View" })).toBeNull();
  });

  it("opens the next Cosmetic on the Class, however the last one was left", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Team Captain" }));
    await user.click(within(panelFor("team-captain")).getByRole("button", { name: "On its own" }));

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Team Captain" }));

    expect(pictureSrc(pictureInPanel("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0@512.webp");
  });

  it("shows the Backpack Icon in the panel too when there is no render at all", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: "Dead of Night" }));
    // The large icon, since the panel draws the Cosmetic bigger than a row does.
    expect(pictureInPanel("dead-of-night").getAttribute("src")).toContain("dead_of_night_large");
  });
});

describe("the sidebar's Pictures switch", () => {
  /** The switch in the sidebar, as opposed to the View toggle an open Cosmetic has. */
  function pictures(): HTMLElement {
    return within(screen.getByRole("region", { name: "Browsing controls" })).getByRole("group", {
      name: "Pictures",
    });
  }

  it("starts on the Class, and offers the same two pictures the open Cosmetic does", () => {
    renderBrowser();
    expect(within(pictures()).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "On the Class",
      "On its own",
    ]);
    expect(within(pictures()).getByRole("button", { name: "On the Class" })).toHaveAttribute("aria-pressed", "true");
    expect(pictureSrc(pictureIn("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0@256.webp");
  });

  it("takes the Class out of every card at once", async () => {
    const user = renderBrowser();
    await user.click(within(pictures()).getByRole("button", { name: "On its own" }));

    expect(pictureSrc(pictureIn("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0-alone@256.webp");
    expect(pictureSrc(pictureIn("tin-pot"))).toBe("/renders/web/tin-pot/soldier-red-0-alone@256.webp");
    expect(pictureIn("team-captain")).toHaveAccessibleName("Team Captain, on its own");
  });

  it("shows the Backpack Icon for a Cosmetic nobody has rendered on its own, not the Class wearing it", async () => {
    // The Gibus has Worn Renders and no Item Render. The icon is the Cosmetic on
    // its own; the Worn Render is the Class the viewer just took out.
    const user = renderBrowser();
    await user.click(within(pictures()).getByRole("button", { name: "On its own" }));
    expect(pictureIn("ghastly-gibus").getAttribute("src")).not.toContain("/renders/");
  });

  it("opens a Cosmetic on the picture the grid is showing, and its own toggle still works", async () => {
    const user = renderBrowser();
    await user.click(within(pictures()).getByRole("button", { name: "On its own" }));
    await user.click(screen.getByRole("button", { name: "Team Captain" }));
    expect(pictureSrc(pictureInPanel("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0-alone@512.webp");

    await user.click(within(panelFor("team-captain")).getByRole("button", { name: "On the Class" }));
    expect(pictureSrc(pictureInPanel("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0@512.webp");
    // The modal's choice is about the one Cosmetic, and leaves the grid alone.
    expect(pictureSrc(pictureIn("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0-alone@256.webp");
  });

  it("opens a Cosmetic with no Item Render on the Class, since that is the picture there is", async () => {
    const user = renderBrowser();
    await user.click(within(pictures()).getByRole("button", { name: "On its own" }));
    await user.click(screen.getByRole("button", { name: "Ghastly Gibus" }));
    const shown = pictureSrc(pictureInPanel("ghastly-gibus"));
    expect(shown).toMatch(/^\/renders\/web\/ghastly-gibus\/[a-z]+-red-0@512\.webp$/);
  });

  it("is where the viewer left it next visit", async () => {
    const user = renderBrowser();
    await user.click(within(pictures()).getByRole("button", { name: "On its own" }));
    cleanup();

    renderBrowser();
    await waitFor(() =>
      expect(within(pictures()).getByRole("button", { name: "On its own" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(pictureSrc(pictureIn("team-captain"))).toBe("/renders/web/team-captain/soldier-red-0-alone@256.webp");
  });

  it("falls back to the Class for a remembered picture this build does not offer", async () => {
    localStorage.setItem(PICTURES_STORAGE_KEY, "sideways");
    renderBrowser();
    await waitFor(() =>
      expect(within(pictures()).getByRole("button", { name: "On the Class" })).toHaveAttribute("aria-pressed", "true"),
    );
  });
});
