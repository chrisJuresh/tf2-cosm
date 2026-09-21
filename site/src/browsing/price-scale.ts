/**
 * The notches a price slider has, and what each one is worth.
 *
 * A price filter cannot be linear. The catalogue runs from a scrap to hundreds
 * of Keys, and nearly every Cosmetic in it sits in the bottom thousandth of that
 * range — a linear slider would spend forty-seven of its forty-eight notches on
 * the dozen Cosmetics nobody is filtering for, and the first notch would jump
 * straight past everything the viewer can afford. So the notches are geometric:
 * each is a fixed multiple of the one before, which is how a trader thinks about
 * prices anyway — the gap between 1 and 2 ref is the same kind of gap as the one
 * between 10 and 20.
 *
 * The scale is a table rather than a formula, built once from the dearest
 * Cosmetic the snapshot priced. A table is what makes the slider's two
 * directions the same scale: the notch a bound is drawn at and the bound a notch
 * means are one array read either way round, and they cannot drift apart. It is
 * pure and takes only scrap counts, so it is driven straight by its tests.
 */
import type { Cosmetic } from "@tf2-cosm/data/catalogue";

import { metalValueOf } from "@/browsing/controls";

/**
 * How many notches each slider has. Enough that a drag lands near what the
 * viewer meant — about a fifth of a step in price each — and few enough that the
 * arrow keys cross the catalogue in a couple of seconds.
 */
export const PRICE_STEPS = 48;

/**
 * The floor the table is built against, so a snapshot with no prices in it at
 * all still gives a scale with distinct notches rather than a row of zeroes.
 */
const LEAST_CEILING = PRICE_STEPS;

/** The dearest Metal Value in the catalogue, in scrap — the top of the scale. */
export function priceCeiling(cosmetics: readonly Cosmetic[]): number {
  let ceiling = 0;
  for (const cosmetic of cosmetics) {
    const value = metalValueOf(cosmetic);
    if (value !== null && value > ceiling) ceiling = value;
  }
  return Math.max(ceiling, LEAST_CEILING);
}

/**
 * What each notch is worth, in scrap: `PRICE_STEPS + 1` values, the first 0 and
 * the last the ceiling, geometric in between.
 *
 * Two things are forced on top of the geometry. Each notch is at least a scrap
 * dearer than the one below it, because the bottom of a geometric run rounds to
 * the same whole scrap several times over and a notch that changes nothing is a
 * notch that reads as a broken slider. And the last is the ceiling exactly, so
 * that a slider pushed to the top means the dearest Cosmetic and not a rounding
 * of it.
 */
export function priceScale(ceiling: number): readonly number[] {
  const top = Math.max(Math.round(ceiling), LEAST_CEILING);
  const scale: number[] = [0];
  for (let step = 1; step <= PRICE_STEPS; step += 1) {
    const geometric = Math.round(top ** ((step - 1) / (PRICE_STEPS - 1)));
    const previous = scale[step - 1] ?? 0;
    scale.push(Math.min(Math.max(geometric, previous + 1), top));
  }
  scale[PRICE_STEPS] = top;
  return scale;
}

/**
 * The notch to draw a bound at: the nearest one, in the price's own geometric
 * terms rather than in scrap, so a bound halfway between two notches sits
 * halfway along rather than an inch from the dearer of the two.
 *
 * A bound only ever comes from this table, so this is exact for every bound the
 * page itself set. It matters for the one that did not: a bound remembered from
 * a visit whose snapshot had a different dearest Cosmetic, which lands between
 * this snapshot's notches.
 */
export function stepForScrap(scale: readonly number[], scrap: number): number {
  let nearest = 0;
  let distance = Infinity;
  for (let step = 0; step < scale.length; step += 1) {
    // Compared as ratios, with a scrap's headroom so the zero notch is a
    // candidate rather than a division by nothing.
    const value = (scale[step] ?? 0) + 1;
    const ratio = Math.abs(Math.log(value / (scrap + 1)));
    if (ratio < distance) {
      distance = ratio;
      nearest = step;
    }
  }
  return nearest;
}
