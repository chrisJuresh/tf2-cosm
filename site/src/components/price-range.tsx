"use client";

/**
 * The price filter: two sliders, a floor and a ceiling, and a line saying what
 * they currently mean in the same words the cards use.
 *
 * Two separate sliders rather than one two-thumbed track. A two-thumbed range is
 * one control in a picture and two overlapping `input`s in a browser, held apart
 * by pointer-events tricks that a keyboard and a screen reader see straight
 * through — and what they see through to is exactly these two sliders, only
 * stacked on top of each other and impossible to hit. Drawn side by side they
 * are the same two controls, each with its own name, its own arrow keys and its
 * own thumb nobody has to fight for.
 *
 * Neither can cross the other: pushing the floor past the ceiling carries the
 * ceiling with it, and the same the other way, so there is no arrangement of the
 * two that means nothing.
 *
 * What a notch is worth is `@/browsing/price-scale`, and what a bound does is
 * `@/browsing/controls`. This file only wires a slider to a number.
 */
import type { Metal } from "@tf2-cosm/data/catalogue";

import { PRICE_STEPS, stepForScrap } from "@/browsing/price-scale";
import { formatScrap } from "@/prices/format";

export interface PriceRangeProps {
  /** What each notch is worth, in scrap — `priceScale` of the catalogue. */
  readonly scale: readonly number[];
  readonly minScrap: number | null;
  readonly maxScrap: number | null;
  /** The snapshot's Key Rate, so the readout is in Keys where a card would be. */
  readonly keyRate: Metal | null;
  readonly onChange: (bounds: { minScrap?: number | null; maxScrap?: number | null }) => void;
}

const SLIDER =
  "h-5 w-full min-w-0 cursor-pointer accent-current" +
  " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

/** The notch a bound sits at, with the untouched ends at the ends of the track. */
function notchFor(scale: readonly number[], scrap: number | null, whenUnbounded: number): number {
  return scrap === null ? whenUnbounded : stepForScrap(scale, scrap);
}

/**
 * The floor a notch means, and the ceiling one means. Each slider has exactly
 * one end that means no bound — the bottom of the floor's track, the top of the
 * ceiling's — and it is no bound rather than this snapshot's cheapest and
 * dearest Cosmetic: a viewer who has not touched a slider is not asking a price
 * question, and a ceiling pinned to today's dearest Cosmetic would quietly
 * become a filter the day a dearer one is priced.
 *
 * The other end of each track is an ordinary bound. A floor at the top of its
 * track is the dearest Cosmetic there is, which is a thing to ask for.
 */
function floorAt(scale: readonly number[], step: number): number | null {
  return step <= 0 ? null : (scale[step] ?? null);
}

function ceilingAt(scale: readonly number[], step: number): number | null {
  return step >= PRICE_STEPS ? null : (scale[step] ?? null);
}

/** One end of the range: its name, and the track that sets it. */
function Slider({
  id,
  label,
  value,
  onPick,
}: {
  id: string;
  label: string;
  value: number;
  onPick: (step: number) => void;
}) {
  return (
    // Side by side while the controls are a bar, because a line of the bar is a
    // row of Cosmetics; stacked, and wide enough to aim with, in the panel.
    <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
      <label
        htmlFor={id}
        className="sr-only shrink-0 text-[0.6875rem] text-black/55 lg:not-sr-only lg:w-14 dark:text-white/55"
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={PRICE_STEPS}
        step={1}
        value={value}
        onChange={(event) => onPick(Number(event.target.value))}
        className={SLIDER}
      />
    </div>
  );
}

export function PriceRange({ scale, minScrap, maxScrap, keyRate, onChange }: PriceRangeProps) {
  const minStep = notchFor(scale, minScrap, 0);
  const maxStep = notchFor(scale, maxScrap, PRICE_STEPS);

  const readout =
    minScrap === null && maxScrap === null
      ? "Any price"
      : `${minScrap === null ? "Any" : formatScrap(minScrap, keyRate)} to ${
          maxScrap === null ? "any" : formatScrap(maxScrap, keyRate)
        }`;

  return (
    // A group rather than two loose sliders, so a screen reader announces
    // "Price, Minimum" and a viewer who tabs into the second one still knows
    // what it is the maximum of.
    <div role="group" aria-label="Price" className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.6875rem] uppercase tracking-wide text-black/55 dark:text-white/55">Price</span>
        {/* Not a live region: the count below the controls already announces
            what the grid did, and a second one firing on every notch of a drag
            would talk over it. */}
        <span className="truncate text-xs tabular-nums text-black/70 dark:text-white/70">{readout}</span>
      </div>

      <div className="flex min-w-0 gap-2 lg:flex-col lg:gap-1">
        <Slider
          id="price-min"
          label="Minimum"
          value={minStep}
          // Pushing the floor past the ceiling carries the ceiling with it, so
          // the two can never say "dearer than X and cheaper than less than X".
          onPick={(step) =>
            onChange({
              minScrap: floorAt(scale, step),
              ...(step > maxStep ? { maxScrap: ceilingAt(scale, step) } : {}),
            })
          }
        />
        <Slider
          id="price-max"
          label="Maximum"
          value={maxStep}
          onPick={(step) =>
            onChange({
              maxScrap: ceilingAt(scale, step),
              ...(step < minStep ? { minScrap: floorAt(scale, step) } : {}),
            })
          }
        />
      </div>
    </div>
  );
}
