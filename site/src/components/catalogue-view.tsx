"use client";

/**
 * The catalogue as a viewer meets it: a header saying what the numbers below it
 * mean and how fresh they are, the Dollar Basis switch, and the list.
 *
 * The active basis lives here because it is the one thing the header and every
 * row have to agree on — the header states which basis is in force and what a
 * Key costs under it, and each row's dollar figure is that same rate applied to
 * that row's Metal Value. Nothing is computed twice: the basis is picked once
 * and handed down.
 *
 * Which Cosmetics the list shows, and in what order, is the browser below the
 * header — see `@/components/catalogue-browser`.
 */
import type { Catalogue } from "@tf2-cosm/data/catalogue";

import type { RenderManifest } from "@/renders/manifest";

import { useRememberedChoice } from "@/browser/remembered";
import { CatalogueBrowser } from "@/components/catalogue-browser";
import { DollarBasisSwitch } from "@/components/dollar-basis-switch";
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
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">TF2 Cosmetics Catalogue</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {header.counts.cosmetics.toLocaleString("en-US")} Cosmetics
            {keyRate === null ? null : <> · a Key is {formatMetalValue(keyRate)}</>}
            {basis === null ? null : (
              <>
                {" "}
                · {formatDollars(basis.usdPerKey)} a Key at the {basis.label}
              </>
            )}
          </p>
          <p className="text-xs text-black/55 dark:text-white/55">
            Snapshot taken <Moment iso={header.snapshotTakenAt} />
            {/* When the snapshot was taken is not when the rate it quotes was:
                a price source's estimate can be weeks old by the time a run
                picks it up, and a viewer told only the snapshot's age would
                read the rate as fresher than it is. */}
            {basis?.quotedAt == null ? null : (
              <>
                {" "}
                · {basis.label} rate quoted <Moment iso={basis.quotedAt} />
              </>
            )}
          </p>
        </div>
        {basis === null ? null : <DollarBasisSwitch offered={offered} active={basis} onChoose={(chosen) => remember(chosen.id)} />}
      </header>
      <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-4 sm:px-6">
        <CatalogueBrowser cosmetics={catalogue.cosmetics} manifest={manifest} keyRate={keyRate} basis={basis} />
      </main>
    </>
  );
}
