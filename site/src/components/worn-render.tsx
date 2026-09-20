"use client";

/**
 * The picture of a Cosmetic: its Worn Render where one exists, and its Backpack
 * Icon where one does not (ADR-0001).
 *
 * Which render that is comes from `@/renders/select`, a pure walk down the
 * fallback chain; this component is the surface over it, plus the one thing the
 * chain cannot cover. A manifest entry says an image was written, not that it is
 * being served: a bucket that has not finished syncing, a local run whose folder
 * was cleared, a derivative deleted by hand. So a render that fails to load
 * falls back to the icon here too, and the row is never left with a hole.
 */
import type { ClassName, Cosmetic } from "@tf2-cosm/data/catalogue";
import { useState } from "react";

import { secureIconUrl } from "@/catalogue/icon";
import { classRead } from "@/catalogue/describe";
import { renderUrl } from "@/renders/base-url";
import type { RenderManifest, Team } from "@/renders/manifest";
import { pickRender } from "@/renders/select";

export interface WornRenderProps {
  readonly cosmetic: Cosmetic;
  readonly manifest: RenderManifest;
  /** The Class the picture shows — see `displayedClass`. */
  readonly gameClass: ClassName;
  readonly team: Team;
  readonly style: number;
  /** Which web derivative of the render to ask for, by its size in pixels. */
  readonly size: number;
  /**
   * Which of the two Backpack Icons Valve publishes to fall back to. It is not
   * derived from `size`, because the two pictures are chosen on different
   * grounds: a derivative is picked for the screen it will be drawn on, and an
   * icon is one of two fixed files.
   */
  readonly icon: "small" | "large";
  readonly className?: string | undefined;
}

/** What the picture is, and what it is called, once the chain has been walked. */
interface Picture {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

function wornRender(props: WornRenderProps): Picture | null {
  const { cosmetic, manifest, gameClass, team, style, size } = props;
  const chosen = pickRender(manifest, { slug: cosmetic.slug, gameClass, team, style }, size);
  if (chosen === null) return null;
  return {
    src: renderUrl(chosen.image.path),
    alt: `${cosmetic.name} worn by the ${classRead(chosen.gameClass)}`,
    width: chosen.image.width,
    height: chosen.image.height,
  };
}

function backpackIcon(cosmetic: Cosmetic, which: "small" | "large"): Picture | null {
  const { backpackIcon: icon } = cosmetic;
  if (icon === null) return null;
  // Valve publishes the icon at two sizes and nothing between them.
  const size = which === "large" ? 512 : 64;
  return { src: secureIconUrl(icon[which]), alt: cosmetic.name, width: size, height: size };
}

export function WornRender(props: WornRenderProps) {
  const { cosmetic, icon: which, className } = props;
  /**
   * Every src that has already failed to load. A set rather than the last one:
   * with only the last one remembered, an icon that fails after a render did
   * would make the render eligible again, and the two would take turns failing
   * forever instead of the row settling on nothing.
   */
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());

  const render = wornRender(props);
  const icon = backpackIcon(cosmetic, which);
  const picture = render === null || broken.has(render.src) ? icon : render;
  if (picture === null || broken.has(picture.src)) return null;

  return (
    <img
      src={picture.src}
      alt={picture.alt}
      // Eighteen hundred rows of pictures: the browser loads the screenful a
      // viewer can see and fetches the rest as they scroll to them.
      loading="lazy"
      decoding="async"
      width={picture.width}
      height={picture.height}
      onError={() => setBroken((failed) => new Set(failed).add(picture.src))}
      className={className}
    />
  );
}
