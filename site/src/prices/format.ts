/**
 * The one place the site turns a price into words or into money.
 *
 * Everything here is pure and takes only what the catalogue already carries, so
 * the tests drive it directly and the components never do arithmetic of their
 * own. The Metal arithmetic itself is the data job's (`@tf2-cosm/data`): a
 * Trader Notation formatted here and one recorded in the catalogue come out of
 * the same function at the same Key Rate, so the two can never disagree.
 *
 * A Dollar Basis is the key-to-dollar rate a dollar figure is computed from. The
 * catalogue's header carries all three, already anchored to the snapshot's own
 * Key Rate; the site picks one out and does no rate arithmetic of its own.
 */
import type { DollarBases, Metal, UnpricedReason } from "@tf2-cosm/data/catalogue";
import { formatRefined, scrapToRefined, traderNotation } from "@tf2-cosm/data/prices/metal";

/**
 * How a basis is named in a stored preference and in the DOM. These strings
 * outlive a snapshot — one is remembered in a browser and read back against a
 * later catalogue — so they name the basis's role, never its vendor.
 */
export type DollarBasisId = "steam-community-market" | "price-source" | "mann-co-store";

export interface DollarBasis {
  readonly id: DollarBasisId;
  /** What the viewer is told a dollar means here. */
  readonly label: string;
  /** The header's own account of where the rate came from, so a viewer can check it. */
  readonly source: string;
  /**
   * When this rate was itself quoted, which is not when the snapshot was taken:
   * a price source's estimate can be weeks old by the time a run picks it up.
   * Null for the Mann Co. Store, whose constant has no date.
   */
  readonly quotedAt: string | null;
  /** What a Key costs under this basis, which is how a viewer recognises it. */
  readonly usdPerKey: number;
  readonly usdPerRefined: number;
}

/**
 * The price source names itself in the header and nowhere in this code: ADR-0002
 * keeps the source swappable behind one seam, so a site that spelled the vendor
 * out would have to be edited the day it is swapped. The vendor is the first
 * word of the data job's own phrasing — "backpack.tf refined-to-dollar estimate
 * (IGetCurrencies v1)" is offered as "backpack.tf estimate".
 *
 * Reading a name out of a prose sentence is the weak part of this, so the shape
 * the data job writes is matched exactly and anything else falls back to naming
 * no vendor at all: a source phrased another way should read as "Price source
 * estimate", never as a word lifted out of the middle of a sentence. The honest
 * fix is a vendor field in the header, which is a catalogue schema version —
 * worth taking the day there is a second source to swap to.
 */
const VENDOR = /^(\S+) refined-to-dollar estimate/;

function priceSourceLabel(source: string): string {
  const vendor = VENDOR.exec(source)?.[1];
  return vendor === undefined ? "Price source estimate" : `${vendor} estimate`;
}

/**
 * Every Dollar Basis this snapshot can actually offer, in the order the switch
 * shows them, the default first.
 *
 * A basis whose rate never arrived is left out rather than guessed at: a dollar
 * figure nobody can stand behind is worse than no dollar figure. The Market
 * publishes two figures and the lowest listing is what a viewer would actually
 * pay, so it wins over the median. ADR-0002 uses the Market for the Key's dollar
 * price and nothing else, because classic Unique cosmetics are not marketable
 * there.
 */
export function dollarBases(bases: DollarBases | null): DollarBasis[] {
  if (bases === null) return [];
  const offered: DollarBasis[] = [];

  const market = bases.steamCommunityMarket;
  const marketRate = market === null ? null : (market.lowest ?? market.median);
  if (market !== null && marketRate !== null) {
    offered.push({
      id: "steam-community-market",
      label: "Steam Community Market",
      source: market.source,
      quotedAt: market.takenAt,
      ...marketRate,
    });
  }

  const priceSource = bases.priceSource;
  if (priceSource !== null) {
    offered.push({
      id: "price-source",
      label: priceSourceLabel(priceSource.source),
      source: priceSource.source,
      quotedAt: priceSource.lastUpdatedAt,
      ...priceSource.rate,
    });
  }

  offered.push({
    id: "mann-co-store",
    label: "Mann Co. Store",
    source: bases.mannCoStore.source,
    quotedAt: null,
    ...bases.mannCoStore.rate,
  });

  return offered;
}

/**
 * The basis a viewer asked for, or the default when this snapshot does not offer
 * it. A basis remembered in a browser outlives the snapshot that offered it, so
 * "not on offer" is ordinary rather than an error.
 */
export function chooseBasis(offered: readonly DollarBasis[], id: string | null): DollarBasis | null {
  return offered.find((basis) => basis.id === id) ?? offered[0] ?? null;
}

/**
 * Trader Notation — "2 keys, 1.33 ref". The Key Rate decides where the split
 * falls; a snapshot taken without one leaves every price in Refined alone,
 * which is still true, just longer.
 */
export function formatTraderNotation(metal: Metal, keyRate: Metal | null): string {
  if (keyRate === null) return formatMetalValue(metal);
  return traderNotation(metal.scrap, keyRate.scrap);
}

/**
 * A Blanket Price written as what it is. The source quotes one figure for a whole
 * class of items rather than for this one (ADR-0004), so the site says about,
 * rather than printing it with the confidence of a quote.
 */
export function approximately(figure: string): string {
  return `≈${figure}`;
}

/** The Metal Value: the same price written wholly in Refined, whatever it is worth in Keys. */
export function formatMetalValue(metal: Metal): string {
  return `${formatRefined(metal.scrap)} ref`;
}

/** The price in dollars under a Dollar Basis, or nothing when there is no basis. */
export function dollarsFor(metal: Metal, basis: DollarBasis | null): number | null {
  if (basis === null) return null;
  return scrapToRefined(metal.scrap) * basis.usdPerRefined;
}

/**
 * Why a Cosmetic is Unpriced, short enough to sit under the word "Unpriced" in
 * the price column.
 *
 * An Unpriced Cosmetic with an empty column beside it reads as a page that does
 * not know; saying which of the three reasons it is says that the snapshot
 * looked and this is what it found.
 */
export const UNPRICED_REASON_LABELS: Record<UnpricedReason, string> = {
  "missing-from-source": "not listed",
  "no-reference-variant": "no priced Quality",
  "unsupported-currency": "currency unknown",
};

const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Dollars as money: always two decimals, thousands grouped. */
export function formatDollars(dollars: number): string {
  return DOLLARS.format(dollars);
}
