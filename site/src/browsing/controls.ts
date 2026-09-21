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
import { CLASSES, type ClassName, type Cosmetic, type CosmeticSlot } from "@tf2-cosm/data/catalogue";

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

/**
 * The kinds a viewer can narrow to instead of naming a Class. They are the two
 * of the three the glossary names that more than one Cosmetic shares an answer
 * on: a Class-Exclusive Cosmetic belongs to a Class, and asking for every
 * Class-Exclusive Cosmetic at once is asking for a list of nine unrelated
 * wardrobes.
 */
export const CLASS_KINDS = ["all-class", "multi-class"] as const;

export type ClassKind = (typeof CLASS_KINDS)[number];

/**
 * What the Class picker narrows by: one Class, or one kind. They share a control
 * because they are two ways of cutting the same axis — a Class View already says
 * what an All-Class Cosmetic is doing in it, so picking both would say nothing
 * the Class View does not.
 */
export const CLASS_FILTERS = [...CLASSES, ...CLASS_KINDS] as const;

export type ClassFilter = ClassName | ClassKind;

/** What each kind is called where a viewer picks it, beside the nine Classes. */
export const CLASS_KIND_LABELS: Record<ClassKind, string> = {
  "all-class": "All-Class only",
  "multi-class": "Multi-Class only",
};

/** Every value the Class picker offers, labelled. */
export const CLASS_FILTER_LABELS: Record<ClassFilter, string> = {
  ...CLASS_LABELS,
  ...CLASS_KIND_LABELS,
};

/** Whether a filter names a Class, which is what makes it a Class View. */
export function isClassKind(filter: ClassFilter): filter is ClassKind {
  return (CLASS_KINDS as readonly string[]).includes(filter);
}

/**
 * The Class the viewer is looking at, or null when they are not looking at one.
 *
 * A Class View is more than a filter — it is the Class every row's picture shows
 * the Cosmetic worn by — and a kind chooses no Class to wear anything, so under
 * one every row falls back to the Cosmetic's own first Class.
 */
export function viewedClass(filter: ClassFilter | null): ClassName | null {
  if (filter === null || isClassKind(filter)) return null;
  return filter;
}

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
  /**
   * What the Class picker is narrowing by — a Class, whose Class View is then
   * showing, or a kind — or null for the whole catalogue.
   */
  readonly classFilter: ClassFilter | null;
  /**
   * Whether a Class View leaves out the All-Class Cosmetics. It says nothing
   * about Multi-Class Cosmetics, and it has nothing to focus outside a Class
   * View, so it does nothing there.
   */
  readonly hideAllClass: boolean;
  /** The equip slot to show, or null for both. */
  readonly slot: CosmeticSlot | null;
  readonly hideUnpriced: boolean;
  /**
   * Whether the catalogue is narrowed to what the viewer owns. On by default,
   * which costs a viewer with no Inventory nothing: it has nothing to narrow
   * until an Inventory has been read, so it does nothing before then — and once
   * one is read, what they own is what they came to look at.
   */
  readonly onlyOwned: boolean;
  /**
   * Whether the Event-Only Cosmetics are left out. On by default: they are a
   * seventh of the catalogue and, unless the event is running, not something a
   * player can wear, so they are clutter in front of the answer most of the
   * year — and the toggle says plainly they are there to be had.
   */
  readonly hideEventOnly: boolean;
  readonly sort: SortOrder;
  /** What the viewer has typed into the name search; blank means no search. */
  readonly search: string;
}

/**
 * Where a viewer arrives, and where clearing the browser's storage returns them:
 * the catalogue bar its Event-Only Cosmetics, most valuable first — and, the
 * moment an Inventory is read, only what that Inventory holds.
 */
export const DEFAULT_CONTROLS: BrowsingControls = {
  classFilter: null,
  hideAllClass: false,
  slot: null,
  hideUnpriced: false,
  onlyOwned: true,
  hideEventOnly: true,
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

/**
 * Whether the Class picker keeps this Cosmetic: a kind is the catalogue's own
 * `kind` read straight off it, a Class is the Class View rule above.
 */
function passesClassFilter(cosmetic: Cosmetic, filter: ClassFilter, hideAllClass: boolean): boolean {
  if (isClassKind(filter)) return cosmetic.kind === filter;
  return inClassView(cosmetic, filter, hideAllClass);
}

/** Whether the game only lets this Cosmetic be worn while an event is running. */
export function isEventOnly(cosmetic: Cosmetic): boolean {
  return cosmetic.eventRestriction !== null;
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

/**
 * The Cosmetics these controls show, in the order they show them.
 *
 * `owned` is the slugs of what the viewer's Inventory holds, or null when no
 * Inventory has been read. Null and `onlyOwned` together show the whole
 * catalogue rather than nothing: the toggle is a view of an Inventory, and with
 * no Inventory there is no view, not an empty one. An Inventory that is read and
 * genuinely holds no Cosmetics is an empty set and does show nothing, which is
 * the truth about that backpack.
 */
export function visibleCosmetics(
  cosmetics: readonly Cosmetic[],
  controls: BrowsingControls,
  owned: ReadonlySet<string> | null = null,
): Cosmetic[] {
  const { classFilter, hideAllClass, slot, hideUnpriced, onlyOwned, hideEventOnly, search } = controls;
  const term = search.trim().toLowerCase();

  const kept = cosmetics.filter((cosmetic) => {
    if (onlyOwned && owned !== null && !owned.has(cosmetic.slug)) return false;
    if (classFilter !== null && !passesClassFilter(cosmetic, classFilter, hideAllClass)) return false;
    if (slot !== null && cosmetic.slot !== slot) return false;
    if (hideUnpriced && isUnpriced(cosmetic)) return false;
    if (hideEventOnly && isEventOnly(cosmetic)) return false;
    if (term !== "" && !cosmetic.name.toLowerCase().includes(term)) return false;
    return true;
  });

  return kept.sort(compareBy(controls.sort));
}
