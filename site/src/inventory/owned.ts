/**
 * What a viewer owns, matched to the catalogue and priced as what they own.
 *
 * Everything here is pure and takes only the catalogue's own vocabulary, on the
 * same terms as `@/browsing/controls`: the rules are driven directly by tests
 * and the components are a surface over them.
 *
 * ## Two things this file settles
 *
 * **What is a Cosmetic.** Nothing decides it here either. An Owned Copy carries
 * a defindex; the catalogue is the Cosmetic rule; a defindex that matches no
 * Cosmetic is not one. That is how a viewer's weapons, taunts, tools, crates and
 * Medals are left out — not by a second rule that could disagree with the first,
 * but by the first rule being the only one. Aliases count: ADR-0003 folds every
 * defindex under a name into one Cosmetic, so a copy of any of them is a copy of
 * that Cosmetic.
 *
 * **What a copy is worth.** Its own Variant Price, not the Cosmetic's Reference
 * Price. A Genuine copy is worth the Genuine figure, and an untradable copy is
 * worth nothing whatever Quality it is in. This is the whole point of the
 * Inventory view: a viewer looking at their own backpack has already done the
 * choosing the Reference Variant rule exists to do for them.
 */
import type { Cosmetic } from "@tf2-cosm/data/catalogue";

import type { OwnedCopy } from "@/inventory/copies";
import { type VariantPrice, type VariantPrices, variantPriceFor } from "@/prices/variant-prices";

/**
 * Why a copy has no figure. All three are ordinary states rather than failures,
 * and the page says which, because "no price", "priced by its effect" and
 * "worth nothing" are three different things to the viewer holding the copy.
 *
 * `untradable` is the odd one of the three: it is not a figure the snapshot
 * failed to find, it is the figure. A copy that cannot leave the backpack it is
 * in cannot be sold for anything, so it is worth nothing — which is why the page
 * shows it at $0 rather than blank, and why a total counts it at nothing rather
 * than at what a tradable copy of the same thing would fetch.
 */
export type NoPriceReason = "untradable" | "priced-per-effect" | "no-variant-price";

/** One copy a viewer holds, with what that copy is worth. */
export interface PricedCopy {
  readonly quality: string;
  readonly craftable: boolean;
  readonly tradable: boolean;
  readonly effect?: string | undefined;
  readonly count: number;
  /** The Variant Price for this copy's Quality, or null when there is none. */
  readonly price: VariantPrice | null;
  /** Why `price` is null. Null itself when there is a price. */
  readonly noPrice: NoPriceReason | null;
}

/** A Cosmetic a viewer owns, and every copy of it they hold. */
export interface OwnedCosmetic {
  readonly cosmetic: Cosmetic;
  readonly copies: readonly PricedCopy[];
  /** How many copies in all, over every Quality. */
  readonly count: number;
  /**
   * The Metal Value of everything here, in scrap — the copies with a figure,
   * each multiplied by how many are held. Zero when none of them has one.
   */
  readonly scrap: number;
}

/**
 * Every defindex that names a Cosmetic, including its aliases (ADR-0003).
 *
 * Built once for a whole Inventory rather than searched per copy: a backpack of
 * a thousand items against eighteen hundred Cosmetics is a million comparisons
 * done the obvious way, and this is two thousand.
 */
function byDefindex(cosmetics: readonly Cosmetic[]): Map<number, Cosmetic> {
  const index = new Map<number, Cosmetic>();
  for (const cosmetic of cosmetics) {
    index.set(cosmetic.defindex, cosmetic);
    for (const alias of cosmetic.aliases) index.set(alias, cosmetic);
  }
  return index;
}

/**
 * The copy, priced.
 *
 * An untradable copy is worth nothing, and that is settled before anything else
 * is asked about it. A price is what somebody would give for the thing, and
 * nobody gives anything for an item they cannot be handed; the Quality it
 * happens to be in does not change that, so an untradable Unusual is worth
 * nothing on the same terms as an untradable craft hat.
 *
 * An Unusual is never priced, and is told apart from a copy that simply has no
 * figure. A price source prices an Unusual by effect — one figure per
 * hat-and-effect pair — so there is no single Unusual figure for a Cosmetic and
 * the catalogue does not carry one (ADR-0005). Showing the Unique price there
 * would be wrong by two orders of magnitude.
 */
function priceCopy(copy: OwnedCopy, slug: string, prices: VariantPrices | null): PricedCopy {
  const base = {
    quality: copy.quality,
    craftable: copy.craftable,
    tradable: copy.tradable,
    effect: copy.effect,
    count: copy.count,
  };
  if (!copy.tradable) return { ...base, price: null, noPrice: "untradable" };
  if (copy.quality === "unusual") return { ...base, price: null, noPrice: "priced-per-effect" };
  const price = variantPriceFor(prices, slug, copy.quality, copy.craftable);
  return price === undefined
    ? { ...base, price: null, noPrice: "no-variant-price" }
    : { ...base, price, noPrice: null };
}

/**
 * The Cosmetics a viewer owns, each with their own copies, in catalogue order.
 *
 * Order is the order the Cosmetics were handed in, so the sort a viewer picked
 * in the control bar still holds inside their Inventory: this narrows the list,
 * it does not reorder it.
 */
export function ownedCosmetics(
  cosmetics: readonly Cosmetic[],
  copies: readonly OwnedCopy[],
  prices: VariantPrices | null,
): OwnedCosmetic[] {
  const index = byDefindex(cosmetics);
  const bySlug = new Map<string, { cosmetic: Cosmetic; copies: PricedCopy[] }>();

  for (const copy of copies) {
    const cosmetic = index.get(copy.defindex);
    // Not a Cosmetic. A weapon, a taunt, a tool, a crate, a Medal — the
    // catalogue does not have it, so neither does this.
    if (cosmetic === undefined) continue;
    const entry = bySlug.get(cosmetic.slug) ?? { cosmetic, copies: [] };
    entry.copies.push(priceCopy(copy, cosmetic.slug, prices));
    bySlug.set(cosmetic.slug, entry);
  }

  const owned: OwnedCosmetic[] = [];
  for (const cosmetic of cosmetics) {
    const entry = bySlug.get(cosmetic.slug);
    if (entry === undefined) continue;
    // The most valuable copy first, so a viewer holding a Genuine and a Unique
    // sees the Genuine, and so the card's one figure is the best they have.
    const sorted = [...entry.copies].sort((left, right) => (right.price?.scrap.mid ?? -1) - (left.price?.scrap.mid ?? -1));
    owned.push({
      cosmetic,
      copies: sorted,
      count: sorted.reduce((total, one) => total + one.count, 0),
      scrap: sorted.reduce((total, one) => total + (one.price === null ? 0 : one.price.scrap.mid * one.count), 0),
    });
  }
  return owned;
}

/**
 * The same Inventory with the untradable copies taken out of it.
 *
 * A backpack is full of things its owner cannot do anything with — the
 * achievement hats, the copies still on their trade hold, everything bought on
 * the Store this week — and a viewer working out what they are holding usually
 * means what they are holding that they could part with. The toggle is what says
 * which of the two they meant; this is the whole of what it does.
 *
 * A Cosmetic the viewer owns no tradable copy of leaves the Inventory
 * altogether, which is the point: with the grid narrowed to what they own, it is
 * the Cosmetics they can trade that they wanted to see. The Metal Value never
 * moves, because what is dropped was worth nothing.
 */
export function withoutUntradable(owned: readonly OwnedCosmetic[]): OwnedCosmetic[] {
  const kept: OwnedCosmetic[] = [];
  for (const one of owned) {
    const copies = one.copies.filter((copy) => copy.noPrice !== "untradable");
    if (copies.length === 0) continue;
    kept.push({
      ...one,
      copies,
      count: copies.reduce((total, copy) => total + copy.count, 0),
    });
  }
  return kept;
}

/** The slugs of what a viewer owns, which is what narrows the grid to it. */
export function ownedSlugs(owned: readonly OwnedCosmetic[]): Set<string> {
  return new Set(owned.map((one) => one.cosmetic.slug));
}

/** What an Inventory comes to, and what the figure had to leave out. */
export interface InventoryTotal {
  /** The Metal Value of everything with a figure, in scrap. */
  readonly scrap: number;
  /** How many copies that figure counts. */
  readonly counted: number;
  /**
   * Copies worth nothing because they cannot be traded. They are not left out —
   * they are in the figure, at the nothing they are worth — and they are counted
   * on their own so the page can say how much of a backpack is untradable.
   */
  readonly untradable: number;
  /** Copies left out because a price source prices them by effect. */
  readonly pricedPerEffect: number;
  /** Copies left out because the source has no figure for their Quality. */
  readonly unpriced: number;
}

/**
 * What the whole Inventory comes to.
 *
 * It says what it left out and how much of it, because a total that quietly
 * drops a viewer's four Unusuals is worse than no total: they are the most
 * valuable things they own, and a figure that looks complete and is not would
 * be read as their backpack's worth.
 */
export function inventoryTotal(owned: readonly OwnedCosmetic[]): InventoryTotal {
  let scrap = 0;
  let counted = 0;
  let untradable = 0;
  let pricedPerEffect = 0;
  let unpriced = 0;
  for (const one of owned) {
    for (const copy of one.copies) {
      if (copy.price !== null) {
        scrap += copy.price.scrap.mid * copy.count;
        counted += copy.count;
      } else if (copy.noPrice === "untradable") {
        untradable += copy.count;
      } else if (copy.noPrice === "priced-per-effect") {
        pricedPerEffect += copy.count;
      } else {
        unpriced += copy.count;
      }
    }
  }
  return { scrap, counted, untradable, pricedPerEffect, unpriced };
}
