/**
 * What the open Cosmetic shows: the context behind the one figure its card
 * gives.
 *
 * A card says a Cosmetic is worth "2 keys, 19.66 ref". That is a midpoint of a
 * Price Spread, for one Reference Variant, quoted on some day, by a source that
 * may not have looked since — every one of which changes what the figure is
 * worth knowing. This panel is those four facts plus who can wear the thing.
 *
 * It also shows the Cosmetic as big as the screen allows: the larger Worn
 * Render, with a Style switcher and a Team toggle where there is more than one
 * look to see. Those two are the only state the panel holds, and it holds them
 * rather than the grid because they are how this Cosmetic is being looked at
 * right now — closing it is done looking, and the next one opens on its own
 * default.
 *
 * It is drawn inside the modal (`@/components/cosmetic-modal`), which is what
 * gives it the room: the picture is the point of opening a Cosmetic, so it takes
 * the width it can get and the fields sit beside it rather than under it.
 */
"use client";

import type { ClassName, Cosmetic, Metal } from "@tf2-cosm/data/catalogue";
import { type ReactNode, useState } from "react";

import { classesRead, priceDateRead, referenceVariantRead, unpricedReasonRead } from "@/catalogue/describe";

import { formatTraderNotation } from "@/prices/format";
import { StyleSwitcher, TeamToggle } from "@/components/render-controls";
import { WornRender } from "@/components/worn-render";
import type { RenderManifest, Team } from "@/renders/manifest";
import { DEFAULT_STYLE, DEFAULT_TEAM, hasBluRender } from "@/renders/select";

/** How big the modal draws the Cosmetic, and which derivative it asks for. */
const DETAIL_SIZE = 512;

/** The Price Spread's three ends, in the order a trader reads them. */
const SPREAD_ENDS = [
  { key: "low", label: "Low" },
  { key: "mid", label: "Mid" },
  { key: "high", label: "High" },
] as const;

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.625rem] uppercase tracking-wide text-black/55 sm:text-[0.6875rem] dark:text-white/55">
        {term}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export interface CosmeticDetailProps {
  readonly cosmetic: Cosmetic;
  /** The snapshot's Key Rate, or null when it carried no prices. */
  readonly keyRate: Metal | null;
  /** Which Worn Renders exist; empty when no run has produced any. */
  readonly manifest: RenderManifest;
  /** The Class the picture shows — settled by the grid, so the card and the panel agree. */
  readonly gameClass: ClassName;
  /** What the panel is called on the page, which is how a test and a link find it. */
  readonly id: string;
}

export function CosmeticDetail({ cosmetic, keyRate, manifest, gameClass, id }: CosmeticDetailProps) {
  const { price } = cosmetic;
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [team, setTeam] = useState<Team>(DEFAULT_TEAM);
  // Asked of the Class on show: an All-Class Cosmetic can have a BLU render on
  // one Class and only RED on another, and the toggle answers for this picture.
  const teamed = hasBluRender(manifest, cosmetic.slug, gameClass);

  return (
    <div id={id} className="mt-3 flex flex-col gap-4 sm:flex-row sm:gap-6">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <WornRender
          cosmetic={cosmetic}
          manifest={manifest}
          gameClass={gameClass}
          team={teamed ? team : DEFAULT_TEAM}
          style={style}
          size={DETAIL_SIZE}
          icon="large"
          // As big as the modal can give it without the fields beside it
          // wrapping: the picture is what a viewer opened the Cosmetic for.
          className="h-56 w-56 object-contain sm:h-72 sm:w-72"
        />
        <StyleSwitcher styles={cosmetic.styles} chosen={style} onChoose={setStyle} />
        {teamed ? <TeamToggle chosen={team} onChoose={setTeam} /> : null}
      </div>
      <dl className="grid min-w-0 flex-1 content-start gap-x-6 gap-y-3 text-xs sm:text-sm">
        {/* The three states a price is in, said once: a snapshot built without a
            price source at all, a source that has no price for this Cosmetic, and
            a price. */}
        {price === null ? null : price.state === "unpriced" ? (
          <Field term="Price">Unpriced. {unpricedReasonRead(price.reason)}</Field>
        ) : (
          <>
            <Field term="Price Spread">
              <span className="tabular-nums">
                {SPREAD_ENDS.map((end, index) => (
                  <span key={end.key}>
                    {index === 0 ? null : " · "}
                    <span className="text-black/55 dark:text-white/55">{end.label}</span>{" "}
                    {formatTraderNotation(price.spread[end.key].metal, keyRate)}
                  </span>
                ))}
              </span>
            </Field>
            <Field term="Reference Variant">{referenceVariantRead(price.referenceVariant)}</Field>
            <Field term="Last updated">
              {/* The machine-readable timestamp stays on the page: the date alone
                  is what a viewer wants, but it is a rounding of the real one. */}
              <time dateTime={price.lastUpdatedAt}>{priceDateRead(price.lastUpdatedAt)}</time>
            </Field>
          </>
        )}
        <Field term="Classes">{classesRead(cosmetic)}</Field>
        {cosmetic.aliases.length === 0 ? null : (
          // ADR-0003: a Cosmetic is one name, and every other defindex Valve
          // carries under that name is folded into it. Saying which ones keeps
          // that merge visible rather than silent.
          <Field term="Aliases">{cosmetic.aliases.map((alias) => `defindex ${alias}`).join(", ")}</Field>
        )}
      </dl>
    </div>
  );
}
