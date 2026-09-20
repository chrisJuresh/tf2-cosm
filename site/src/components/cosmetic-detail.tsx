/**
 * What an expanded row shows: the context behind the one figure the collapsed
 * row gives.
 *
 * A row says a Cosmetic is worth "2 keys, 19.66 ref". That is a midpoint of a
 * Price Spread, for one Reference Variant, quoted on some day, by a source that
 * may not have looked since — every one of which changes what the figure is
 * worth knowing. This panel is those four facts plus who can wear the thing.
 *
 * It renders nothing interactive. The Style switcher and the RED/BLU toggle are
 * #16; the panel is laid out to take another field or two without moving.
 */
import type { Cosmetic, Metal } from "@tf2-cosm/data/catalogue";
import type { ReactNode } from "react";

import { classesRead, priceDateRead, referenceVariantRead, unpricedReasonRead } from "@/catalogue/describe";

import { formatTraderNotation } from "@/prices/format";

/** The Price Spread's three ends, in the order a trader reads them. */
const SPREAD_ENDS = [
  { key: "low", label: "Low" },
  { key: "mid", label: "Mid" },
  { key: "high", label: "High" },
] as const;

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.625rem] uppercase tracking-wide text-black/50 sm:text-[0.6875rem] dark:text-white/50">
        {term}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export interface CosmeticDetailProps {
  readonly cosmetic: Cosmetic;
  /** The snapshot's Key Rate, or null when it carried no prices. */
  readonly keyRate: Metal | null;
  /** What the row's toggle points `aria-controls` at. */
  readonly id: string;
}

export function CosmeticDetail({ cosmetic, keyRate, id }: CosmeticDetailProps) {
  const { price } = cosmetic;
  return (
    <dl
      id={id}
      className="grid gap-x-6 gap-y-3 px-2 pb-3 text-xs sm:grid-cols-2 sm:px-3 sm:pb-4 sm:text-sm lg:grid-cols-3"
    >
      {price === null || price.state === "unpriced" ? null : (
        <>
          <Field term="Price Spread">
            <span className="tabular-nums">
              {SPREAD_ENDS.map((end, index) => (
                <span key={end.key}>
                  {index === 0 ? null : " · "}
                  <span className="text-black/50 dark:text-white/50">{end.label}</span>{" "}
                  {formatTraderNotation(price.spread[end.key].metal, keyRate)}
                </span>
              ))}
            </span>
          </Field>
          <Field term="Reference Variant">{referenceVariantRead(price.referenceVariant)}</Field>
          <Field term="Last updated">
            {/* The machine-readable timestamp stays on the page: the date alone
                is what a viewer wants, but it is a rounding of the real one. */}
            <time dateTime={price.lastUpdatedAt}>{priceDateRead(price.lastUpdatedAt)}</time>
          </Field>
        </>
      )}
      {price !== null && price.state === "unpriced" ? (
        <Field term="Price">Unpriced. {unpricedReasonRead(price.reason)}</Field>
      ) : null}
      <Field term="Classes">{classesRead(cosmetic)}</Field>
      {cosmetic.aliases.length === 0 ? null : (
        // ADR-0003: a Cosmetic is one name, and every other defindex Valve
        // carries under that name is folded into it. Saying which ones keeps
        // that merge visible rather than silent.
        <Field term="Aliases">{cosmetic.aliases.map((alias) => `defindex ${alias}`).join(", ")}</Field>
      )}
    </dl>
  );
}
