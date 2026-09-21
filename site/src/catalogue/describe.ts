/**
 * The catalogue's own vocabulary, written out for a viewer.
 *
 * The catalogue stores a Class, a Quality and an Unpriced reason as the slug-like
 * token the data job agreed on, which is right for a file and wrong on a page.
 * Turning one into English is not arithmetic and not layout, so it lives here as
 * a pure function the tests drive directly, the same way the price module owns
 * turning a Metal figure into words.
 */
import type { Cosmetic, Price } from "@tf2-cosm/data/catalogue";

type GameClass = Cosmetic["classes"][number];
type PricedVariant = Extract<Price, { state: "priced" }>["referenceVariant"];
type UnpricedReason = Extract<Price, { state: "unpriced" }>["reason"];

/**
 * The Qualities whose English name is not simply their token capitalised.
 *
 * Only one of the Qualities the Reference Variant rule can choose needs an
 * entry: the rule tries Unique, then the item's Native Quality, then Genuine,
 * Vintage, Haunted, Strange and Collector's, and every one of those but the last
 * is its own token capitalised. Keyed on the Quality union, so a token that is
 * not a Quality at all cannot be quietly added here.
 */
const QUALITY_NAMES: Partial<Record<PricedVariant["quality"], string>> = {
  collectors: "Collector's",
};

function titleCase(token: string): string {
  return token
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** A Class as it is spelled in the game: "Scout", "Demoman". */
export function classRead(gameClass: GameClass): string {
  return titleCase(gameClass);
}

/**
 * Which Classes can wear the Cosmetic. An All-Class Cosmetic names no Class at
 * all: listing nine of them is longer and says less than saying it is all of
 * them, and the kind is what the glossary calls the distinction.
 */
export function classesRead(cosmetic: Cosmetic): string {
  if (cosmetic.kind === "all-class") return "All nine Classes";
  const names = cosmetic.classes.map(classRead);
  if (names.length === 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/**
 * A Quality's English name: "Unique", "Collector's", "Self-Made".
 *
 * This takes an open string rather than the Quality union, because the Qualities
 * that reach it from a viewer's own backpack are whatever Steam found in it, and
 * the Worker's vocabulary is checked against the catalogue's by its own test
 * rather than by this function's type. A token nobody has an entry for comes out
 * capitalised, which is at least a name.
 */
export function qualityRead(quality: string): string {
  return QUALITY_NAMES[quality as PricedVariant["quality"]] ?? titleCase(quality);
}

/** The Reference Variant the price is for: "Unique, craftable". */
export function referenceVariantRead(variant: PricedVariant): string {
  return `${qualityRead(variant.quality)}, ${variant.craftable ? "craftable" : "non-craftable"}`;
}

/**
 * The events the game gates a Cosmetic behind, in English. The catalogue stores
 * the game's own token and deliberately does not close the list (a new event
 * should widen the catalogue, not fail the run), so an unknown one is shown
 * rather than swallowed: the token is at least a name, and a Cosmetic that is
 * visibly gated by something unnamed beats one that looks gated by nothing.
 */
const EVENT_NAMES: Record<string, string> = {
  halloween: "Halloween",
  halloween_or_fullmoon: "Halloween or a full moon",
  christmas: "Smissmas",
  birthday: "the game's birthday",
};

/** When an Event-Only Cosmetic can be worn: "Halloween or a full moon". */
export function eventRestrictionRead(token: string): string {
  return EVENT_NAMES[token] ?? token.replaceAll("_", " ");
}

/** Why a Cosmetic has no price, in the viewer's terms rather than the job's. */
export function unpricedReasonRead(reason: UnpricedReason): string {
  switch (reason) {
    case "missing-from-source":
      return "The price source lists no entry for it.";
    case "no-reference-variant":
      return "The price source prices no Quality the Reference Variant rule accepts.";
    case "unsupported-currency":
      return "The price source quotes it in a currency this snapshot cannot convert to Metal.";
  }
}

/**
 * When the price was last repriced, as a date. Fixed to UTC, the timezone the
 * catalogue records its timestamps in: read in a local timezone an evening
 * snapshot would be dated the day before or after depending on who is looking,
 * and freshness is the whole point of showing it.
 */
const PRICE_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function priceDateRead(iso: string): string {
  return PRICE_DATE.format(new Date(iso));
}
