/**
 * What the viewer is looking at: the Class View, the filters, the sort and the
 * search, and the one function that turns the whole catalogue into the rows a
 * row list should draw.
 *
 * Everything here is pure and takes only the catalogue's own vocabulary, so the
 * rules are driven directly by tests and the components are a surface over them
 * rather than the place they live. A control that does not change which
 * Cosmetics are shown, or the order they come in, does not belong in this file.
 */
import type { ClassName, Cosmetic, CosmeticSlot } from "@tf2-cosm/data/catalogue";

/** What each Class is called where a viewer picks it. */
export const CLASS_LABELS: Record<ClassName, string> = {
  scout: "Scout",
  soldier: "Soldier",
  pyro: "Pyro",
  demoman: "Demoman",
  heavy: "Heavy",
  engineer: "Engineer",
  medic: "Medic",
  sniper: "Sniper",
  spy: "Spy",
};

/** What each equip slot is called where a viewer picks it. */
export const SLOT_LABELS: Record<CosmeticSlot, string> = {
  head: "Head",
  misc: "Misc",
};

export const SORT_ORDERS = ["metal-value-high", "metal-value-low", "name"] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

/** What each order is called where a viewer picks it. */
export const SORT_ORDER_LABELS: Record<SortOrder, string> = {
  "metal-value-high": "Metal Value, high to low",
  "metal-value-low": "Metal Value, low to high",
  name: "Name, A to Z",
};

export interface BrowsingControls {
  /** The Class whose Class View is showing, or null for the whole catalogue. */
  readonly classView: ClassName | null;
  /**
   * Whether a Class View leaves out the All-Class Cosmetics. It says nothing
   * about Multi-Class Cosmetics, and it has nothing to focus with no Class
   * chosen, so it does nothing there.
   */
  readonly hideAllClass: boolean;
  /** The equip slot to show, or null for both. */
  readonly slot: CosmeticSlot | null;
  readonly hideUnpriced: boolean;
  readonly sort: SortOrder;
  /** What the viewer has typed into the name search; blank means no search. */
  readonly search: string;
}

/**
 * Where a viewer arrives, and where clearing the browser's storage returns them:
 * the whole catalogue, most valuable first.
 */
export const DEFAULT_CONTROLS: BrowsingControls = {
  classView: null,
  hideAllClass: false,
  slot: null,
  hideUnpriced: false,
  sort: "metal-value-high",
  search: "",
};

/**
 * The Class View rule: a Class's own Class-Exclusive Cosmetics, the Multi-Class
 * Cosmetics it can wear, and every All-Class Cosmetic unless those are hidden.
 *
 * The three cases are written out rather than folded into one `classes.includes`
 * because they are three different rules that happen to agree on two of them —
 * the All-Class case is the only one a toggle can turn off, and a Multi-Class
 * Cosmetic stays in a Class View however that toggle is set.
 */
export function inClassView(cosmetic: Cosmetic, classView: ClassName, hideAllClass: boolean): boolean {
  if (cosmetic.kind === "all-class") return !hideAllClass;
  return cosmetic.classes.includes(classView);
}

/** Whether the price source had no price for this Cosmetic's Reference Variant. */
function isUnpriced(cosmetic: Cosmetic): boolean {
  return cosmetic.price?.state === "unpriced";
}

/**
 * The Metal Value the value sorts run on, in scrap, or null when there is no
 * figure to sort by — an Unpriced Cosmetic, or a snapshot taken without a price
 * source at all.
 */
function metalValueOf(cosmetic: Cosmetic): number | null {
  const { price } = cosmetic;
  if (price === null || price.state === "unpriced") return null;
  return price.spread.mid.metal.scrap;
}

const BY_NAME = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/**
 * A value sort, in either direction, with everything that has no value after
 * everything that has one — a Cosmetic with no figure is not worth nothing, it
 * is unknown, and floating it to the top of "lowest first" would read as the
 * cheapest thing in the game. Ties fall back to the name so the order is total
 * and two runs of the same controls cannot disagree.
 */
function byMetalValue(a: Cosmetic, b: Cosmetic, highestFirst: boolean): number {
  const left = metalValueOf(a);
  const right = metalValueOf(b);
  if (left === null || right === null) {
    if (left === right) return BY_NAME.compare(a.name, b.name);
    return left === null ? 1 : -1;
  }
  if (left !== right) return highestFirst ? right - left : left - right;
  return BY_NAME.compare(a.name, b.name);
}

function compareBy(sort: SortOrder): (a: Cosmetic, b: Cosmetic) => number {
  switch (sort) {
    case "metal-value-high":
      return (a, b) => byMetalValue(a, b, true);
    case "metal-value-low":
      return (a, b) => byMetalValue(a, b, false);
    case "name":
      return (a, b) => BY_NAME.compare(a.name, b.name);
  }
}

/** The Cosmetics these controls show, in the order they show them. */
export function visibleCosmetics(
  cosmetics: readonly Cosmetic[],
  controls: BrowsingControls,
): Cosmetic[] {
  const { classView, hideAllClass, slot, hideUnpriced, search } = controls;
  const term = search.trim().toLowerCase();

  const kept = cosmetics.filter((cosmetic) => {
    if (classView !== null && !inClassView(cosmetic, classView, hideAllClass)) return false;
    if (slot !== null && cosmetic.slot !== slot) return false;
    if (hideUnpriced && isUnpriced(cosmetic)) return false;
    if (term !== "" && !cosmetic.name.toLowerCase().includes(term)) return false;
    return true;
  });

  return kept.sort(compareBy(controls.sort));
}
