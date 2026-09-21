"use client";

/**
 * The catalogue as a viewer meets it: a header saying what the numbers below it
 * mean, the Dollar Basis switch, the grid, and the credits the snapshot's own
 * dates sit among.
 *
 * The active basis lives here because it is the one thing the header, the footer
 * and every card have to agree on — the header states which basis is in force
 * and what a Key costs under it, the footer says when that rate was quoted, and
 * each card's dollar figure is that same rate applied to that card's Metal
 * Value. Nothing is computed twice: the basis is picked once and handed down.
 *
 * The header is one line and the controls under it are one line, because
 * everything either of them takes is a row of Cosmetics the grid below does not
 * get. The two dates go to the footer for the same reason, and because that is
 * where the rest of where-this-came-from already lives — they are provenance,
 * not a figure anybody reads off the page.
 *
 * Which Cosmetics the grid shows, and in what order, is the browser below the
 * header — see `@/components/catalogue-browser`.
 */
import type { Catalogue } from "@tf2-cosm/data/catalogue";

import type { RenderManifest } from "@/renders/manifest";

import { useRememberedChoice } from "@/browser/remembered";
import { CatalogueBrowser } from "@/components/catalogue-browser";
import { DollarBasisSwitch } from "@/components/dollar-basis-switch";
import { SiteFooter } from "@/components/site-footer";
import { chooseBasis, dollarBases, formatDollars, formatMetalValue } from "@/prices/format";

/** Where this browser remembers the viewer's Dollar Basis, and only this browser. */
const DOLLAR_BASIS_KEY = "tf2-cosm.dollar-basis";

/**
 * The snapshot's age is the one thing on the page that is about the page rather
 * than about an item, so it is spelled out in UTC: a trader comparing this page
 * with backpack.tf wants to know how many hours behind it is, not what o'clock
 * it was where the job ran.
 */
const SNAPSHOT_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** A moment in the snapshot, written for a reader and marked up for a machine. */
function Moment({ iso }: { iso: string }) {
  return <time dateTime={iso}>{`${SNAPSHOT_TIME.format(new Date(iso))} UTC`}</time>;
}

export interface CatalogueViewProps {
  readonly catalogue: Catalogue;
  /** Which Worn Renders exist; empty when no run has produced any. */
  readonly manifest: RenderManifest;
}

export function CatalogueView({ catalogue, manifest }: CatalogueViewProps) {
  const { header } = catalogue;
  const offered = dollarBases(header.dollarBases);
  const [remembered, remember] = useRememberedChoice(DOLLAR_BASIS_KEY);
  const basis = chooseBasis(offered, remembered);
  const keyRate = header.prices?.keyRate ?? null;

  return (
    <>
      {/* `shrink-0`, because the grid below takes every pixel it is offered: a
          flex column would otherwise squeeze the header to less than its own
          text is tall and let that text spill over the first row of cards. */}
      <header className="flex w-full shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 pt-3 pb-2 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h1 className="text-base font-semibold sm:text-lg">TF2 Cosmetics Catalogue</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {header.counts.cosmetics.toLocaleString("en-US")} Cosmetics
            {keyRate === null ? null : <> · a Key is {formatMetalValue(keyRate)}</>}
            {/* On a phone this says exactly what the switch below it says, and
                a phone has two lines to spare for a whole row of Cosmetics. */}
            {basis === null ? null : (
              <span className="hidden sm:inline">
                {" "}
                · {formatDollars(basis.usdPerKey)} a Key at the {basis.label}
              </span>
            )}
          </p>
        </div>
        {basis === null ? null : (
          <DollarBasisSwitch offered={offered} active={basis} onChoose={(chosen) => remember(chosen.id)} />
        )}
      </header>
      <main className="flex w-full min-h-0 flex-1 flex-col px-3 sm:px-4">
        <CatalogueBrowser cosmetics={catalogue.cosmetics} manifest={manifest} keyRate={keyRate} basis={basis} />
      </main>
      <SiteFooter
        provenance={
          <>
            Snapshot taken <Moment iso={header.snapshotTakenAt} />
            {/* When the snapshot was taken is not when the rate it quotes was: a
                price source's estimate can be weeks old by the time a run picks
                it up, and a viewer told only the snapshot's age would read the
                rate as fresher than it is. */}
            {basis?.quotedAt == null ? null : (
              <>
                {" "}
                · {basis.label} rate quoted <Moment iso={basis.quotedAt} />
              </>
            )}
          </>
        }
      />
    </>
  );
}
