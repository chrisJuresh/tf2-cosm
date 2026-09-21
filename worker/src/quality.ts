/**
 * Steam's internal Quality names, turned into the catalogue's.
 *
 * The two vocabularies are nearly but not quite the same, and the places they
 * differ are the ones that matter most. Steam's inventory calls a Genuine copy
 * `rarity1` and an Unusual `rarity4` — the schema index of each Quality wearing
 * the name of some earlier idea — while the catalogue calls them `genuine` and
 * `unusual`, after the words traders and the game itself use. Casing differs as
 * well: `Unique` against `unique`.
 *
 * The translation happens here, at the edge, so that nothing past this Worker
 * ever sees `rarity4`. A site that had to know Steam's names for things would be
 * holding two vocabularies for one idea, and a Variant Price keyed by one of
 * them would silently fail to find a copy keyed by the other.
 *
 * The right-hand side is the catalogue's own list, and `tests/quality.test.ts`
 * holds this table against it, so a Quality renamed there cannot drift out of
 * step with this file without a test saying so.
 */

/**
 * Keyed by the `internal_name` of an item's Quality tag, lowercased — Steam is
 * not consistent about the case and there is nothing to gain by matching it.
 *
 * Every Quality in the schema is here, including the ones no Cosmetic is ever
 * issued in, because what this table is for is recognising whatever turns up in
 * somebody's backpack rather than predicting it.
 */
const BY_STEAM_NAME: Readonly<Record<string, string>> = {
  normal: "normal",
  rarity1: "genuine",
  genuine: "genuine",
  rarity2: "rarity2",
  vintage: "vintage",
  rarity3: "rarity3",
  rarity4: "unusual",
  unusual: "unusual",
  unique: "unique",
  community: "community",
  developer: "valve",
  valve: "valve",
  selfmade: "self-made",
  customized: "customized",
  strange: "strange",
  completed: "completed",
  haunted: "haunted",
  collectors: "collectors",
  paintkitweapon: "decorated",
  decorated: "decorated",
};

/**
 * The catalogue's name for a Quality Steam reported, or undefined for one it has
 * no name for.
 *
 * Undefined is deliberate rather than a fallback to Unique. A Quality this table
 * does not know is a Quality the catalogue cannot price either, and a copy shown
 * at the Unique price because its real Quality went unrecognised would be a
 * wrong figure presented as a right one. The caller counts it as unreadable and
 * says so.
 */
export function qualityFromSteam(internalName: string | undefined): string | undefined {
  if (internalName === undefined) return undefined;
  return BY_STEAM_NAME[internalName.toLowerCase()];
}

/** The table itself, for the test that holds it against the catalogue's vocabulary. */
export const STEAM_QUALITY_NAMES = BY_STEAM_NAME;
