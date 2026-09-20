/**
 * The heart of the catalogue data job: already-fetched source payloads in, a
 * catalogue out. Nothing here touches the network, the clock or the filesystem,
 * so it is the single seam the tests drive.
 */
import {
  type ClassName,
  classesFor,
  type CosmeticSlot,
  cosmeticSlotOf,
  type ExclusionReason,
  exclusionReason,
  stylesOf,
  wornModels,
} from "./cosmetic-rule.ts";
import { displayName, slugify } from "./identity.ts";
import { issuedInPlay } from "./issued-in-play.ts";
import {
  block,
  type ItemDefinition,
  type ItemsGameDocument,
  resolvePrefabs,
  scalar,
} from "./item-definition.ts";
import {
  assertValidCatalogue,
  type Catalogue,
  CATALOGUE_SCHEMA_VERSION,
  type Cosmetic,
  type CosmeticKind,
  type PriceHeader,
  type Style,
} from "./schema.ts";
import { dollarBasesOf, type MarketKeyPrice } from "../prices/dollar-basis.ts";
import { keyRateMetal, priceOf } from "../prices/price-spread.ts";
import { type PriceList, type Quality, variantsFor } from "../prices/price-source.ts";
import { referenceVariantLabel, type UnpricedReason } from "../prices/reference-variant.ts";
import { backpackIconOf, nativeQualityOf, type WebApiSchemaItem } from "../sources/steam-web-api.ts";

export interface CatalogueInputs {
  readonly itemsGame: ItemsGameDocument;
  /** Every page of ISteamEconomy/GetSchemaItems, concatenated. */
  readonly webApiItems: readonly WebApiSchemaItem[];
  /**
   * tf_english.txt tokens, lowercased. Only the local game install has them; they
   * name items the Web API leg did not return, and never override it.
   */
  readonly englishTokens?: Readonly<Record<string, string>> | undefined;
  /**
   * The price snapshot, from whichever `PriceSource` the run used (ADR-0002).
   * Leaving it out builds a catalogue with no prices in it at all — every
   * Cosmetic's `price` and the header's `prices` are null — which is what a run
   * without a price source key produces.
   */
  readonly prices?: PriceList | undefined;
  /**
   * The Steam Community Market's key price, one of the header's Dollar Bases.
   * Leaving it out records that basis as null rather than guessing a rate, which
   * is what a run the Market did not answer produces.
   */
  readonly marketKeyPrice?: MarketKeyPrice | undefined;
  readonly snapshotTakenAt: string;
  readonly sources: { readonly itemDefinitions: string; readonly englishNames: string };
}

export interface Exclusion {
  readonly defindex: number;
  readonly name: string;
  readonly reason: ExclusionReason;
}

export interface BuildResult {
  readonly catalogue: Catalogue;
  readonly exclusions: readonly Exclusion[];
  readonly warnings: readonly string[];
}

/** What two items sharing a display name disagree about, which makes them two items. */
export type CollisionDifference = "slot" | "classes" | "models";

export class DisplayNameCollisionError extends Error {
  constructor(name: string, readonly defindexes: readonly number[], readonly difference: CollisionDifference) {
    const differences: Record<CollisionDifference, string> = {
      slot: "the slot they occupy",
      classes: "the Classes that can wear them",
      models: "the models they are worn as",
    };
    super(
      `display name "${name}" is shared by items that are not the same Cosmetic ` +
        `(defindexes ${defindexes.join(", ")}; they differ in ${differences[difference]}). ` +
        `ADR-0003 merges defindexes that share a name, so this must be resolved by hand.`,
    );
    this.name = "DisplayNameCollisionError";
  }
}

export class SlugCollisionError extends Error {
  constructor(name: string, other: string, slug: string) {
    super(`"${name}" and "${other}" both slug to "${slug}"; one of them needs a distinct name`);
    this.name = "SlugCollisionError";
  }
}

interface Candidate {
  readonly defindex: number;
  readonly name: string;
  readonly slot: CosmeticSlot;
  readonly classes: readonly ClassName[];
  readonly paintable: boolean;
  readonly styles: readonly Style[];
  readonly backpackIcon: Cosmetic["backpackIcon"];
  readonly nativeQuality: Quality;
  /** Whether the game hands this defindex out in play, which decides a Blanket Price (ADR-0004). */
  readonly issuedInPlay: boolean;
  /** Every model this defindex is worn as; two defindexes of one Cosmetic share them. */
  readonly models: readonly string[];
}

function kindOf(classes: readonly ClassName[]): CosmeticKind {
  if (classes.length === 1) return "class-exclusive";
  return classes.length === 9 ? "all-class" : "multi-class";
}

function resolveToken(token: string | undefined, englishTokens: Readonly<Record<string, string>>): string | undefined {
  if (token === undefined) return undefined;
  if (!token.startsWith("#")) return token;
  return englishTokens[token.slice(1).toLowerCase()];
}

function styleNames(
  item: ItemDefinition,
  webApiItem: WebApiSchemaItem | undefined,
  englishTokens: Readonly<Record<string, string>>,
): Style[] {
  return stylesOf(item).map((style) => {
    const fromWebApi = webApiItem?.styles?.[style.index]?.name;
    const name = fromWebApi ?? resolveToken(style.nameToken, englishTokens) ?? style.nameToken;
    return { index: style.index, name: name ?? `Style ${style.index}` };
  });
}

/**
 * Two defindexes under one display name are the same Cosmetic (ADR-0003) as long
 * as they are worn identically — same slot, same Classes, same models. Anything
 * else is two different items that happen to share a name, and must not merge
 * silently.
 */
function collisionDifference(candidates: readonly Candidate[]): CollisionDifference | undefined {
  const [first, ...rest] = candidates;
  if (!first) return undefined;
  for (const other of rest) {
    if (other.slot !== first.slot) return "slot";
    if (other.classes.join(",") !== first.classes.join(",")) return "classes";
    if (other.models.join(",") !== first.models.join(",")) return "models";
  }
  return undefined;
}

/** What the run made of the price list, accumulated one Cosmetic at a time. */
class PriceTally {
  private priced = 0;
  private blanketPriced = 0;
  private unpriced = 0;
  private readonly byReferenceVariant = new Map<string, number>();
  private readonly unpricedByReason = new Map<UnpricedReason, number>();

  record(price: Cosmetic["price"]): void {
    if (price === null) return;
    if (price.state === "priced") {
      this.priced++;
      if (price.blanket) this.blanketPriced++;
      const label = referenceVariantLabel(price.referenceVariant.quality, price.referenceVariant.craftable);
      this.byReferenceVariant.set(label, (this.byReferenceVariant.get(label) ?? 0) + 1);
    } else {
      this.unpriced++;
      this.unpricedByReason.set(price.reason, (this.unpricedByReason.get(price.reason) ?? 0) + 1);
    }
  }

  /** The price snapshot's header, or null when the run had no price source. */
  header(prices: PriceList | undefined): PriceHeader | null {
    if (!prices) return null;
    return {
      source: prices.source,
      takenAt: prices.takenAt,
      keyRate: { ...keyRateMetal(prices.rates.keyRate), lastUpdatedAt: prices.rates.keyRate.lastUpdatedAt },
      counts: {
        priced: this.priced,
        unpriced: this.unpriced,
        byReferenceVariant: Object.fromEntries([...this.byReferenceVariant].sort()),
        blanketPriced: this.blanketPriced,
        unpricedByReason: Object.fromEntries([...this.unpricedByReason].sort()),
      },
    };
  }
}

export function buildCatalogue(inputs: CatalogueInputs): BuildResult {
  const englishTokens = inputs.englishTokens ?? {};
  const webApiByDefindex = new Map(inputs.webApiItems.map((item) => [item.defindex, item]));
  const exclusions: Exclusion[] = [];
  const warnings: string[] = [];
  const candidates: Candidate[] = [];
  let withoutWebApiEntry = 0;

  for (const [key, raw] of Object.entries(inputs.itemsGame.items)) {
    const defindex = Number.parseInt(key, 10);
    if (!Number.isInteger(defindex) || defindex <= 0) continue; // the "default" pseudo-item
    const item = resolvePrefabs(raw, inputs.itemsGame.prefabs);
    const slot = cosmeticSlotOf(item);
    const reason = exclusionReason(item);
    const webApiItem = webApiByDefindex.get(defindex);
    const fallbackName =
      resolveToken(scalar(item, "item_name"), englishTokens) ?? scalar(item, "name") ?? `item ${defindex}`;
    const name = displayName(webApiItem?.item_name ?? fallbackName);

    if (reason !== undefined || slot === undefined) {
      // "not-wearable" covers thousands of weapons and tools; only near-misses are worth reporting.
      if (reason !== "not-wearable") exclusions.push({ defindex, name, reason: reason ?? "not-wearable" });
      continue;
    }
    if (webApiItem === undefined) {
      withoutWebApiEntry++;
      warnings.push(`defindex ${defindex} ("${name}") is missing from the Web API schema: no Backpack Icon`);
    }
    const classes = classesFor(item);
    candidates.push({
      defindex,
      name,
      slot,
      classes,
      paintable: scalar(block(item, "capabilities"), "paintable") === "1",
      styles: styleNames(item, webApiItem, englishTokens),
      backpackIcon: backpackIconOf(webApiItem),
      nativeQuality: nativeQualityOf(webApiItem),
      issuedInPlay: issuedInPlay(item, inputs.itemsGame.lootListItems),
      models: wornModels(item, classes),
    });
  }

  const byName = new Map<string, Candidate[]>();
  for (const candidate of candidates.sort((left, right) => left.defindex - right.defindex)) {
    const group = byName.get(candidate.name);
    if (group) group.push(candidate);
    else byName.set(candidate.name, [candidate]);
  }

  let aliasesMerged = 0;
  const cosmetics: Cosmetic[] = [];
  const slugs = new Map<string, string>();
  const tally = new PriceTally();

  for (const [name, group] of byName) {
    const difference = collisionDifference(group);
    if (difference !== undefined) {
      throw new DisplayNameCollisionError(name, group.map((one) => one.defindex), difference);
    }
    // The group is in defindex order and every member has a model, so the lowest
    // defindex is the primary the icon and the renders come from (ADR-0003).
    const [primary, ...rest] = group as [Candidate, ...Candidate[]];
    const aliases = rest.map((one) => one.defindex);
    aliasesMerged += aliases.length;

    const slug = slugify(name);
    const taken = slugs.get(slug);
    if (taken !== undefined) throw new SlugCollisionError(name, taken, slug);
    slugs.set(slug, name);

    // Every defindex under one name is the same Cosmetic, so any of them finding
    // the price entry prices the whole group. The source's own defindex list is
    // the join; the name is what is left when it claims none.
    const price = inputs.prices
      ? priceOf(
          variantsFor(inputs.prices, [primary.defindex, ...aliases], name),
          {
            nativeQuality: primary.nativeQuality,
            // Any defindex under the name being issued in play makes the
            // Cosmetic one: they are the same item worn the same way (ADR-0003).
            issuedInPlay: group.some((one) => one.issuedInPlay),
          },
          inputs.prices.rates,
        )
      : null;
    tally.record(price);

    cosmetics.push({
      slug,
      name,
      defindex: primary.defindex,
      aliases: aliases.sort((left, right) => left - right),
      slot: primary.slot,
      classes: [...primary.classes],
      kind: kindOf(primary.classes),
      paintable: primary.paintable,
      styles: [...primary.styles],
      backpackIcon: primary.backpackIcon ?? group.find((one) => one.backpackIcon)?.backpackIcon ?? null,
      price,
    });
  }

  cosmetics.sort((left, right) => (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0));

  const catalogue = assertValidCatalogue({
    schemaVersion: CATALOGUE_SCHEMA_VERSION,
    header: {
      snapshotTakenAt: inputs.snapshotTakenAt,
      sources: inputs.sources,
      counts: {
        cosmetics: cosmetics.length,
        classExclusive: cosmetics.filter((one) => one.kind === "class-exclusive").length,
        multiClass: cosmetics.filter((one) => one.kind === "multi-class").length,
        allClass: cosmetics.filter((one) => one.kind === "all-class").length,
        aliasesMerged,
        withoutWebApiEntry,
        withoutBackpackIcon: cosmetics.filter((one) => one.backpackIcon === null).length,
      },
      prices: tally.header(inputs.prices),
      // Every dollar rate is anchored to the snapshot's own Key Rate, so without
      // a price source there is no Key Rate and no basis to record.
      dollarBases: inputs.prices
        ? dollarBasesOf({
            keyRate: inputs.prices.rates.keyRate,
            marketKeyPrice: inputs.marketKeyPrice,
            sourceUsdPerRefined: inputs.prices.rates.dollarEstimate,
          })
        : null,
    },
    cosmetics,
  } satisfies Catalogue);

  exclusions.sort((left, right) => left.defindex - right.defindex);
  return { catalogue, exclusions, warnings };
}
