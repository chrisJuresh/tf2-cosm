/**
 * Whether the game hands a Cosmetic out in ordinary play.
 *
 * The price list cannot tell a cheap craft hat from a promo that was only ever
 * given away: both come back priced at one Random Craft Hat, because that figure
 * is a blanket the source lays over every craft hat (ADR-0004). The game's own
 * definitions can, and this is the question they answer — not "is it cheap" but
 * "does a Unique copy of it exist at all".
 *
 * Two facts say yes, and neither is the item's declared Quality, which Valve
 * reports as Unique for every cosmetic there is:
 *
 * - `drop_type` of `drop`: the item server hands it out as a random drop.
 * - the item is in a loot list or a collection: a crate or a case can hand it out.
 *
 * An item with neither only ever enters the game in its Native Quality, so a
 * Unique price for it is a figure with nothing behind it.
 */
import { type ItemDefinition, lootListKey, scalar } from "./item-definition.ts";

export function issuedInPlay(item: ItemDefinition, lootListItems: ReadonlySet<string>): boolean {
  if (scalar(item, "drop_type") === "drop") return true;
  const name = scalar(item, "name");
  return name !== undefined && lootListItems.has(lootListKey(name));
}
