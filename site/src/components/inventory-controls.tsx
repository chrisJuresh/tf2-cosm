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
      <p className="text-sm text-ink-muted">
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

  // The untradable copies are said separately from those, because they are not
  // left out of the figure — they are in it, at the nothing they are worth — and
  // when the toggle is on they are not in the backpack the rest of the line is
  // about at all.
  const untradable =
    state.hiddenUntradable > 0
      ? `${state.hiddenUntradable.toLocaleString("en-US")} untradable ${state.hiddenUntradable === 1 ? "copy" : "copies"} hidden`
      : total.untradable > 0
        ? `${total.untradable.toLocaleString("en-US")} untradable at $0`
        : null;

  return (
    <p className="text-sm">
      <span className="text-ink-muted">
        {owned.length.toLocaleString("en-US")} Cosmetics ·{" "}
        {total.counted.toLocaleString("en-US")} copies priced at{" "}
      </span>
      <span className="font-bold text-unique tabular-nums">{metal.notation}</span>
      <span className="text-ink-muted"> · {formatMetalValue(metal)}</span>
      {dollars === null ? null : <span className="text-ink-muted"> · {formatDollars(dollars)}</span>}
      {untradable === null ? null : <span className="text-ink-muted"> · {untradable}</span>}
      {left.length === 0 ? null : (
        <span className="text-ink-muted"> · leaving out {left.join(" and ")}</span>
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
    <section
      aria-label="Your Steam inventory"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 pb-2 lg:flex-col lg:items-stretch lg:border-t lg:border-line lg:pt-4 lg:pb-0"
    >
      {/* In the sidebar the box takes the column's whole width and the buttons
          wrap under it, since a profile URL is wider than the column is. */}
      <form
        className="flex items-end gap-2 lg:flex-wrap"
        onSubmit={(event) => {
          event.preventDefault();
          actions.look(value);
        }}
      >
        <div className="flex min-w-0 flex-col gap-1 lg:w-full">
          <label htmlFor={id} className="tf-caption">
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
            className="tf-field w-full sm:w-72 lg:w-full"
          />
        </div>
        <button
          type="submit"
          disabled={state.loading || value.trim() === ""}
          className="tf-button"
        >
          {state.loading ? "Reading…" : "Show what I own"}
        </button>
        {state.inventory === null ? null : (
          <button type="button" onClick={actions.clear} className="tf-button tf-button-quiet">
            Forget
          </button>
        )}
      </form>

      {/* One live region for every answer, so a screen reader hears the result
          of the lookup whichever of the three it turns out to be. */}
      <div role="status" className="min-w-0 flex-1">
        {state.error !== null ? (
          <p className="text-sm text-danger">{state.error}</p>
        ) : state.loading ? (
          <p className="text-sm text-ink-muted">Reading that backpack…</p>
        ) : state.inventory === null ? null : state.owned.length === 0 ? (
          // Nothing left can mean two different things, and a viewer who has
          // just ticked a toggle should not be told their backpack has no
          // Cosmetics in it when what it has is no tradable ones.
          state.hiddenUntradable > 0 ? (
            <p className="text-sm text-ink-muted">
              Every Cosmetic in that backpack is untradable, and Hide untradable is hiding all{" "}
              {state.hiddenUntradable.toLocaleString("en-US")} copies.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              That backpack has {state.inventory.counts.items.toLocaleString("en-US")} items in it and none of them is a
              Cosmetic.
            </p>
          )
        ) : (
          <>
            <Total state={state} keyRate={keyRate} basis={basis} />
            {shownOwned === null || shownOwned === state.owned.length ? null : (
              <p className="text-[0.6875rem] text-ink-muted">
                {shownOwned.toLocaleString("en-US")} of them shown; the rest are hidden by the browsing controls.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
