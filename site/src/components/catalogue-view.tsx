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
 * The header heads the sidebar rather than spanning the page, because every
 * line it takes across the top is a row of Cosmetics the grid does not get, and
 * on a wide screen there is width to spare and height there is not. The two
 * dates go to the footer for the same reason, and because that is where the rest
 * of where-this-came-from already lives — they are provenance, not a figure
 * anybody reads off the page.
 *
 * Which Cosmetics the grid shows, and in what order, is the browser the header
 * is handed to — see `@/components/catalogue-browser`.
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

  // Still the page's banner, though it heads the sidebar: the sidebar is a plain
  // column rather than an `aside`, and a header inside an `aside` or a `main`
  // stops being one.
  const masthead = (
    <header className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1.5 pb-2 lg:flex-col lg:items-stretch lg:gap-y-3 lg:pb-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 lg:flex-col lg:gap-y-2">
        {/* The game's own wordmark order: TF2 on its orange plate, then what
            this is. One heading whatever it looks like, so it is still read
            as "TF2 Cosmetics Catalogue". */}
        <h1 className="font-display text-lg leading-none tracking-wide uppercase sm:text-2xl lg:text-[1.75rem] lg:leading-[1.05]">
          <span
            className={
              "inline-block -skew-x-6 rounded-sm bg-accent px-1.5 pt-1 pb-0.5 text-accent-ink" +
              " shadow-[inset_0_-3px_0_#0000002e]"
            }
          >
            TF2
          </span>{" "}
          <span className="[text-shadow:0_2px_0_light-dark(#0000001a,#00000080)]">Cosmetics Catalogue</span>
        </h1>
        <p className="text-sm text-ink-muted">
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
  );

  return (
    <>
      <CatalogueBrowser
        masthead={masthead}
        cosmetics={catalogue.cosmetics}
        manifest={manifest}
        keyRate={keyRate}
        basis={basis}
        snapshotTakenAt={header.snapshotTakenAt}
      />
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
