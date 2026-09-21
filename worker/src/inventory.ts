/**
 * Steam's inventory payload, turned into Owned Copies.
 *
 * Steam answers with two lists that have to be joined: `assets` is one entry per
 * item a person holds, and `descriptions` is one entry per *kind* of item, keyed
 * by `classid` and `instanceid`. Ten identical hats are ten assets against one
 * description.
 *
 * What comes out is neither of those. An Owned Copy is a defindex, a Quality, a
 * craftability and a count — what the catalogue needs to price it — and nothing
 * else. Everything Steam sends that the site has no use for is dropped here, at
 * the edge: icon URLs, market names, asset ids, the owner's own id on every
 * inspect link. A proxy that forwards a whole inventory payload is passing on
 * more about a person than it was asked for.
 *
 * Nothing here decides what is or is not a Cosmetic. The catalogue is the
 * Cosmetic rule and the site holds the catalogue, so an item that is not in it —
 * a weapon, a taunt, a tool, a crate, a Medal — simply fails to match and is
 * never shown. Deciding it twice, in two places, from two different sources, is
 * how the two answers come to disagree.
 */
import { qualityFromSteam } from "./quality.ts";

/** Steam's own shapes, as much of them as is read. */
interface SteamAsset {
  readonly classid?: string;
  readonly instanceid?: string;
  readonly amount?: string;
}

interface SteamTag {
  readonly category?: string;
  readonly internal_name?: string;
  readonly localized_tag_name?: string;
}

interface SteamDescription {
  readonly classid?: string;
  readonly instanceid?: string;
  readonly tradable?: number;
  readonly tags?: readonly SteamTag[];
  readonly actions?: readonly { readonly link?: string }[];
  readonly descriptions?: readonly { readonly value?: string }[];
}

export interface SteamInventory {
  readonly assets?: readonly SteamAsset[];
  readonly descriptions?: readonly SteamDescription[];
  readonly more_items?: number;
  readonly last_assetid?: string;
  readonly total_inventory_count?: number;
}

/**
 * One kind of copy in somebody's backpack, and how many of it they have.
 *
 * Quality and craftability together are what a Variant Price is keyed by, so
 * these four fields are exactly what it takes to price what somebody owns. An
 * Unusual carries its effect as well, because an Unusual is priced by its effect
 * and a viewer shown "Unusual" with no figure deserves to be told which one.
 */
export interface OwnedCopy {
  readonly defindex: number;
  readonly quality: string;
  readonly craftable: boolean;
  readonly tradable: boolean;
  /** The Unusual effect's name, on an Unusual copy and on nothing else. */
  readonly effect?: string;
  readonly count: number;
}

export interface ReadInventory {
  readonly copies: readonly OwnedCopy[];
  /** How many assets Steam sent, against how many of them could be read. */
  readonly items: number;
  readonly unreadable: number;
}

/**
 * The item's defindex, which the community inventory endpoint writes in exactly
 * one place: the wiki link Steam hangs off every item, `itemredirect.php?id=`.
 *
 * The trade-offer and `IEconItems` payloads carry an `app_data.def_index` and
 * this one does not, which is the whole reason for reading a URL to find a
 * number. It is the weak joint of this file, so a link that does not have the
 * shape is skipped and counted rather than guessed at, and the count is
 * reported: a Steam change that took the link away would show up as an
 * inventory that suddenly reads as empty, which is a thing somebody can see.
 */
function defindexOf(description: SteamDescription): number | undefined {
  for (const action of description.actions ?? []) {
    const match = /itemredirect\.php\?id=(\d+)/.exec(action.link ?? "");
    if (match?.[1] === undefined) continue;
    const defindex = Number.parseInt(match[1], 10);
    if (Number.isInteger(defindex) && defindex > 0) return defindex;
  }
  return undefined;
}

function tag(description: SteamDescription, category: string): SteamTag | undefined {
  return description.tags?.find((one) => one.category === category);
}

/**
 * Whether the copy can be crafted with, which is half of what a Variant Price is
 * keyed by and which Steam states in no field at all.
 *
 * It is a sentence in the item's description text — "( Not Usable in Crafting )",
 * or the longer "( Not Tradable, Marketable, Usable in Crafting, or Gift
 * Wrappable )" — and reading English is exactly as unpleasant as it sounds. Two
 * things make it safe enough: the inventory is always asked for with `l=english`
 * so the language cannot move under us, and the flag is only ever *removed* by a
 * false negative. A copy misread as craftable is priced as the craftable one,
 * which is the common case and the Reference Variant anyway; a copy misread as
 * non-craftable would be priced as the rarer thing on no evidence.
 */
function craftableFrom(description: SteamDescription): boolean {
  for (const line of description.descriptions ?? []) {
    const text = line.value?.trim() ?? "";
    if (text.startsWith("(") && text.includes("Usable in Crafting")) return false;
  }
  return true;
}

/**
 * The Unusual effect's name, from the line Steam marks it with.
 *
 * Undefined is a real answer and not only a parse that failed: a handful of
 * items are Unusual and carry no effect at all, the Horseless Headless
 * Horsemann's Headtaker among them, where the Quality is a historical label
 * rather than a hat on fire. The caller shows the Quality either way.
 */
function effectFrom(description: SteamDescription): string | undefined {
  for (const line of description.descriptions ?? []) {
    const match = /Unusual Effect:\s*(.+)$/.exec(line.value?.trim() ?? "");
    const name = match?.[1]?.trim();
    if (name !== undefined && name !== "") return name;
  }
  return undefined;
}

/** How Steam keys a description, and how an asset points at one. */
function classKey(classid: string | undefined, instanceid: string | undefined): string {
  return `${classid ?? ""}/${instanceid ?? "0"}`;
}

/** How one Owned Copy differs from another. Two copies alike are one entry with a count. */
function copyKey(copy: Omit<OwnedCopy, "count">): string {
  return `${copy.defindex}/${copy.quality}/${copy.craftable}/${copy.tradable}/${copy.effect ?? ""}`;
}

/**
 * Every Owned Copy in one or more pages of a Steam inventory.
 *
 * Pages are folded together rather than read one at a time, because a person's
 * two hundredth item is the same kind as their third and the counts have to add
 * up across the boundary.
 *
 * Order is fixed — defindex, then Quality, then craftability — so that two reads
 * of one backpack come out the same way and the site is never re-rendering rows
 * that did not move.
 */
export function readInventory(pages: readonly SteamInventory[]): ReadInventory {
  const byClass = new Map<string, SteamDescription>();
  for (const page of pages) {
    for (const description of page.descriptions ?? []) {
      byClass.set(classKey(description.classid, description.instanceid), description);
    }
  }

  const counted = new Map<string, OwnedCopy>();
  let items = 0;
  let unreadable = 0;

  for (const page of pages) {
    for (const asset of page.assets ?? []) {
      // `amount` is Steam's stack size. It is 1 for everything wearable, but a
      // stackable item would otherwise be counted once however many are held.
      const amount = Number.parseInt(asset.amount ?? "1", 10);
      const count = Number.isInteger(amount) && amount > 0 ? amount : 1;
      items += count;

      const description = byClass.get(classKey(asset.classid, asset.instanceid));
      const defindex = description === undefined ? undefined : defindexOf(description);
      const quality = qualityFromSteam(tag(description ?? {}, "Quality")?.internal_name);
      if (description === undefined || defindex === undefined || quality === undefined) {
        unreadable += count;
        continue;
      }

      const effect = quality === "unusual" ? effectFrom(description) : undefined;
      const copy: Omit<OwnedCopy, "count"> = {
        defindex,
        quality,
        craftable: craftableFrom(description),
        tradable: description.tradable === 1,
        ...(effect === undefined ? {} : { effect }),
      };
      const key = copyKey(copy);
      const already = counted.get(key);
      counted.set(key, { ...copy, count: (already?.count ?? 0) + count });
    }
  }

  const copies = [...counted.values()].sort(
    (left, right) =>
      left.defindex - right.defindex ||
      left.quality.localeCompare(right.quality) ||
      Number(right.craftable) - Number(left.craftable) ||
      (left.effect ?? "").localeCompare(right.effect ?? ""),
  );
  return { copies, items, unreadable };
}
