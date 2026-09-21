"use client";

/**
 * The Steam profile box, and what the page says back about the backpack it read.
 *
 * A plain form with a real label and a real submit button, for the reason every
 * control in `@/components/browsing-controls` is: that is what makes it
 * keyboard-operable and properly announced without a line of code for either.
 * Submitting is explicit rather than debounced on every keystroke, because each
 * one is a request that leaves the machine and a half-typed profile name is a
 * lookup of somebody who does not exist.
 *
 * What it says back is announced as well as drawn. A viewer working the page
 * from the keyboard should hear what a sighted viewer sees the list do, and the
 * common answer here — "that backpack is private" — is the one that most needs
 * to reach somebody who cannot see the grid stay as it was.
 */
import type { Metal } from "@tf2-cosm/data/catalogue";

import type { InventoryActions, InventoryState } from "@/inventory/use-inventory";
import { type DollarBasis, dollarsFor, formatDollars, formatMetalValue, formatTraderNotation } from "@/prices/format";
import { useId, useState } from "react";

const CONTROL =
  "h-9 min-w-0 rounded-md border border-black/15 bg-white/70 px-2 text-sm" +
  " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current" +
  " dark:border-white/20 dark:bg-white/5";

export interface InventoryControlsProps {
  readonly state: InventoryState;
  readonly actions: InventoryActions;
  /** Null when the site was built with no inventory proxy configured. */
  readonly configured: boolean;
  readonly keyRate: Metal | null;
  readonly basis: DollarBasis | null;
  /** How many of the viewer's Cosmetics the other controls have left showing. */
  readonly shownOwned: number | null;
}

/**
 * What the Inventory came to, and what the figure had to leave out.
 *
 * The exclusions are said out loud rather than folded in. A viewer's Unusuals
 * are the most valuable things they own and a price source prices those by
 * effect, so a total that quietly dropped four of them would read as their
 * backpack's worth and be wrong by more than the rest of it put together.
 */
function Total({ state, keyRate, basis }: { state: InventoryState; keyRate: Metal | null; basis: DollarBasis | null }) {
  const { total, owned, priced } = state;
  if (total === null) return null;

  if (!priced) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        {owned.length.toLocaleString("en-US")} of your Cosmetics are in the catalogue. The prices for each Quality did
        not load, so there is nothing to total.
      </p>
    );
  }

  const metal: Metal = {
    scrap: total.scrap,
    refined: total.scrap / 9,
    notation: formatTraderNotation({ scrap: total.scrap, refined: total.scrap / 9, notation: "" }, keyRate),
  };
  const dollars = dollarsFor(metal, basis);
  const left = [
    total.pricedPerEffect > 0 ? `${total.pricedPerEffect} Unusual priced by its effect` : null,
    total.unpriced > 0 ? `${total.unpriced} with no price for that Quality` : null,
  ].filter((one): one is string => one !== null);

  return (
    <p className="text-sm">
      <span className="text-black/60 dark:text-white/60">
        {owned.length.toLocaleString("en-US")} Cosmetics ·{" "}
        {total.counted.toLocaleString("en-US")} copies priced at{" "}
      </span>
      <span className="font-medium tabular-nums">{metal.notation}</span>
      <span className="text-black/60 dark:text-white/60"> · {formatMetalValue(metal)}</span>
      {dollars === null ? null : <span className="text-black/60 dark:text-white/60"> · {formatDollars(dollars)}</span>}
      {left.length === 0 ? null : (
        <span className="text-black/55 dark:text-white/55"> · leaving out {left.join(" and ")}</span>
      )}
    </p>
  );
}

export function InventoryControls({ state, actions, configured, keyRate, basis, shownOwned }: InventoryControlsProps) {
  const id = useId();
  // Null until the viewer touches the box, which is not the same as empty: the
  // box shows what they last looked up, so coming back to the page shows whose
  // backpack this is, but emptying it has to leave it empty. Keying the
  // fallback off an empty string instead would snap the remembered profile
  // back the moment they selected it all and hit backspace.
  const [typed, setTyped] = useState<string | null>(null);

  const value = typed ?? state.profile ?? "";

  if (!configured) return null;

  return (
    <section aria-label="Your Steam inventory" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 pb-2">
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          actions.look(value);
        }}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={id} className="text-[0.6875rem] uppercase tracking-wide text-black/55 dark:text-white/55">
            Your Steam profile
          </label>
          <input
            id={id}
            type="text"
            value={value}
            placeholder="steamcommunity.com/id/yourname"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
            className={`${CONTROL} w-full sm:w-72`}
          />
        </div>
        <button
          type="submit"
          disabled={state.loading || value.trim() === ""}
          className={`${CONTROL} cursor-pointer px-3 font-medium disabled:cursor-default disabled:opacity-50`}
        >
          {state.loading ? "Reading…" : "Show what I own"}
        </button>
        {state.inventory === null ? null : (
          <button type="button" onClick={actions.clear} className={`${CONTROL} cursor-pointer px-3`}>
            Forget
          </button>
        )}
      </form>

      {/* One live region for every answer, so a screen reader hears the result
          of the lookup whichever of the three it turns out to be. */}
      <div role="status" className="min-w-0 flex-1">
        {state.error !== null ? (
          <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
        ) : state.loading ? (
          <p className="text-sm text-black/60 dark:text-white/60">Reading that backpack…</p>
        ) : state.inventory === null ? null : state.owned.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            That backpack has {state.inventory.counts.items.toLocaleString("en-US")} items in it and none of them is a
            Cosmetic.
          </p>
        ) : (
          <>
            <Total state={state} keyRate={keyRate} basis={basis} />
            {shownOwned === null || shownOwned === state.owned.length ? null : (
              <p className="text-[0.6875rem] text-black/55 dark:text-white/55">
                {shownOwned.toLocaleString("en-US")} of them shown; the rest are hidden by the controls above.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
