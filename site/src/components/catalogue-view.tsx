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
 * The Class View and the browsing controls are #13; the expandable row is #15.
 */
import type { Catalogue } from "@tf2-cosm/data/catalogue";

import { useRememberedChoice } from "@/browser/remembered";
import { CosmeticList } from "@/components/cosmetic-list";
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

export function CatalogueView({ catalogue }: { catalogue: Catalogue }) {
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
          <p className="text-xs text-black/50 dark:text-white/50">
            Snapshot taken{" "}
            <time dateTime={header.snapshotTakenAt}>
              {`${SNAPSHOT_TIME.format(new Date(header.snapshotTakenAt))} UTC`}
            </time>
          </p>
        </div>
        {basis === null ? null : <DollarBasisSwitch offered={offered} active={basis} onChoose={(chosen) => remember(chosen.id)} />}
      </header>
      <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-4 sm:px-6">
        <CosmeticList cosmetics={catalogue.cosmetics} keyRate={keyRate} basis={basis} />
      </main>
    </>
  );
}
