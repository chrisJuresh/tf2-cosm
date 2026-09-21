/**
 * Which picture a row shows, and where it comes from.
 *
 * A render is identified by five things — the Cosmetic, the Class wearing it,
 * the Team, the Style, and whether the Class is in the picture at all — and the
 * manifest holds only the ones that were actually rendered. So every lookup here
 * is a walk down a fallback chain rather than a hit: the asked-for render, then
 * that Class's default Style, then the same on RED, then RED's default Style,
 * and finally nothing at all, which is the caller's cue to show the Backpack
 * Icon (ADR-0001).
 *
 * The variant is the one thing the chain does not fall back on. Style and Team
 * are the same Cosmetic in another look or another colour, and showing one for
 * the other is showing a viewer nearly what they asked for; the Worn Render in
 * place of the Item Render is the Class they just took out of the picture. So a
 * variant with nothing under it walks to the icon instead, and the control that
 * asks for it is only offered where there is one — see `hasItemRender`.
 *
 * Everything in this file is pure and takes only the manifest and the
 * catalogue's own vocabulary, so the fallback chain is driven directly by tests
 * rather than inferred from what a component happened to render.
 */
import type { ClassName, Cosmetic } from "@tf2-cosm/data/catalogue";

import type { RenderImage, RenderManifest, RenderPicture, Team, Variant } from "@/renders/manifest";

/** The Team every Cosmetic is rendered for, and the one everything falls back to. */
export const DEFAULT_TEAM: Team = "red";

/** The Style every Cosmetic has; the index the game gives its default look. */
export const DEFAULT_STYLE = 0;

/** The picture a Cosmetic is shown in until a viewer asks for the other one. */
export const DEFAULT_VARIANT: Variant = "worn";

/** What a chosen render is: the image, and which of the four it actually turned out to be. */
export interface ChosenRender {
  readonly image: RenderImage;
  readonly gameClass: ClassName;
  readonly team: Team;
  readonly style: number;
  readonly variant: Variant;
  /** True when this is not the render that was asked for, but one further down the chain. */
  readonly fellBack: boolean;
}

/**
 * The Class a row's picture shows.
 *
 * In a Class View every Cosmetic that Class can wear is shown worn by it, which
 * is the whole point of the view — including an All-Class Cosmetic, whose nine
 * renders exist precisely so it can be. A Cosmetic the chosen Class cannot wear,
 * and the whole catalogue with no Class chosen, fall to the Cosmetic's own first
 * Class, which for a Class-Exclusive Cosmetic is its only one.
 */
export function displayedClass(cosmetic: Cosmetic, classView: ClassName | null): ClassName {
  if (classView !== null && cosmetic.classes.includes(classView)) return classView;
  // The catalogue guarantees at least one Class, so the fallback is unreachable;
  // it is here because the type cannot say so.
  return cosmetic.classes[0] ?? "scout";
}

/**
 * The picture of one variant recorded at one rung of the chain, if there is one.
 *
 * An entry is a job and a job makes two pictures, either of which a run may not have reached,
 * so an entry can exist holding only the other one. A rung that has only the other one is a
 * rung with nothing on it: the walk goes past it rather than stopping there with nothing to
 * show.
 */
function pictureAt(
  manifest: RenderManifest,
  slug: string,
  gameClass: ClassName,
  team: Team,
  style: number,
  variant: Variant,
): RenderPicture | undefined {
  return manifest.renders[slug]?.[gameClass]?.[team]?.[String(style)]?.[variant] ?? undefined;
}

/**
 * The best image the manifest has for one Cosmetic on one Class, or null when it
 * has none and the Backpack Icon is what the row gets.
 *
 * Style before Team, because a Cosmetic's Styles are looks a viewer chose to see
 * and its Teams are two paints of the same look: shown the wrong Style, a viewer
 * is looking at a different hat; shown RED where they asked for BLU, they are
 * looking at the right hat in the other colour.
 */
export function pickRender(
  manifest: RenderManifest,
  asked: { slug: string; gameClass: ClassName; team: Team; style: number; variant?: Variant },
  size: number,
): ChosenRender | null {
  const variant = asked.variant ?? DEFAULT_VARIANT;
  const styles = asked.style === DEFAULT_STYLE ? [asked.style] : [asked.style, DEFAULT_STYLE];
  const teams: Team[] = asked.team === DEFAULT_TEAM ? [asked.team] : [asked.team, DEFAULT_TEAM];
  for (const team of teams) {
    for (const style of styles) {
      const picture = pictureAt(manifest, asked.slug, asked.gameClass, team, style, variant);
      if (picture === undefined) continue;
      return {
        image: imageAt(picture, size),
        gameClass: asked.gameClass,
        team,
        style,
        variant,
        fellBack: team !== asked.team || style !== asked.style,
      };
    }
  }
  return null;
}

/**
 * The derivative closest to the size the page wants, falling back to the master.
 *
 * Closest and not smallest: a derivative that is missing means the derive step
 * did not run or did not finish for this render, and the master is a real image
 * of the right thing at the wrong size, which a browser scales. A hole is not.
 */
export function imageAt(picture: RenderPicture, size: number): RenderImage {
  const sizes = Object.keys(picture.derivatives)
    .map(Number)
    .sort((a, b) => Math.abs(a - size) - Math.abs(b - size));
  const closest = sizes[0];
  if (closest === undefined) return picture.master;
  return picture.derivatives[String(closest)] ?? picture.master;
}

/**
 * Whether a BLU render exists for this Cosmetic on this Class, which is exactly
 * when the open row offers a Team toggle. Asked of the Class on show, because a
 * toggle that switches to a Team this Class has no render for would be a control
 * that quietly does nothing.
 *
 * A BLU entry the render job marked `team_fallback` is the RED image recorded
 * under BLU, for a Cosmetic whose model has no BLU skin at all. It is the right
 * picture to show, and it is not a second Team worth offering: the toggle would
 * flip between two copies of one image.
 */
/**
 * Whether this Cosmetic has been rendered on its own for this Class, which is exactly when the
 * open Cosmetic offers the control that takes the Class out of the picture.
 *
 * Asked of the Class on show and of no particular Team or Style, because the chain covers
 * those: one Item Render anywhere under this Class is a picture the toggle can reach.
 */
export function hasItemRender(manifest: RenderManifest, slug: string, gameClass: ClassName): boolean {
  const byTeam = manifest.renders[slug]?.[gameClass];
  if (byTeam === undefined) return false;
  return Object.values(byTeam).some((byStyle) =>
    Object.values(byStyle).some((entry) => entry.alone !== null),
  );
}

export function hasBluRender(manifest: RenderManifest, slug: string, gameClass: ClassName): boolean {
  const blu = manifest.renders[slug]?.[gameClass]?.blu;
  if (blu === undefined) return false;
  return Object.values(blu).some((entry) => !entry.team_fallback);
}
