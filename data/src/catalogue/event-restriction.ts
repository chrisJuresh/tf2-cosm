/**
 * Which event a Cosmetic is bound to, when it is bound to one at all.
 *
 * The game gates a few hundred items behind `holiday_restriction`: a player may
 * equip them, but the server only draws them while that event is running. They
 * are Cosmetics in every other respect — they drop, they trade, they have a
 * price — so they stay in the catalogue, and the distinction is a field rather
 * than an exclusion.
 *
 * The token is carried through as the game writes it rather than folded into a
 * boolean or mapped onto a closed vocabulary here. Today the file holds four
 * (`halloween_or_fullmoon` on all but three items, then `halloween`, `christmas`
 * and `birthday`), and Valve adding a fifth should widen the catalogue, not fail
 * the run. Turning the token into English is the reader's business.
 *
 * Most of the restriction comes in by prefab, so this reads the resolved item.
 */
import { type ItemDefinition, scalar } from "./item-definition.ts";

export function eventRestrictionOf(item: ItemDefinition): string | null {
  const token = scalar(item, "holiday_restriction")?.trim().toLowerCase();
  return token === undefined || token === "" ? null : token;
}
