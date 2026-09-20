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

type PricedVariant = Extract<Price, { state: "priced" }>["referenceVariant"];
type UnpricedReason = Extract<Price, { state: "unpriced" }>["reason"];

/**
 * The Qualities whose English name is not simply their token capitalised. Only
 * the Reference Variant rule's own shortlist needs an entry; anything else falls
 * through to the general rule, which is right for Unique, Genuine and the rest.
 */
const QUALITY_NAMES: Partial<Record<string, string>> = {
  collectors: "Collector's",
  "self-made": "Self-Made",
};

function titleCase(token: string): string {
  return token
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** A Class as it is spelled in the game: "Scout", "Demoman". */
export function className(gameClass: string): string {
  return titleCase(gameClass);
}

/**
 * Which Classes can wear the Cosmetic. An All-Class Cosmetic names no Class at
 * all: listing nine of them is longer and says less than saying it is all of
 * them, and the kind is what the glossary calls the distinction.
 */
export function classesRead(cosmetic: Cosmetic): string {
  if (cosmetic.kind === "all-class") return "All nine Classes";
  const names = cosmetic.classes.map(className);
  if (names.length === 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/** The Reference Variant the price is for: "Unique, craftable". */
export function referenceVariantRead(variant: PricedVariant): string {
  const quality = QUALITY_NAMES[variant.quality] ?? titleCase(variant.quality);
  return `${quality}, ${variant.craftable ? "craftable" : "non-craftable"}`;
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
