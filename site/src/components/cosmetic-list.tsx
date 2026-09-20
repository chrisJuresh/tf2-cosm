"use client";

/**
 * The catalogue as one list: every Cosmetic, its Backpack Icon, its price in
 * Trader Notation and as a Metal Value, and what that comes to in dollars.
 *
 * Eighteen hundred rows with a picture each only scroll smoothly if the browser
 * is holding a screenful of them rather than all of them, so the rows are
 * virtualised: the list is as tall as the whole catalogue and only the rows in
 * view exist. That is also why the markup carries its table roles explicitly —
 * absolutely positioned rows are not a `<table>`, but they are still a table to
 * anyone reading the page with a screen reader.
 *
 * Filters, sort and search are #13; the Dollar Basis switch is #14; the Worn
 * Render in place of the icon is #16.
 */
import type { Cosmetic, Metal } from "@tf2-cosm/data/catalogue";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, useRef } from "react";

import { secureIconUrl } from "@/catalogue/icon";

import {
  type DollarBasis,
  dollarsFor,
  formatDollars,
  formatMetalValue,
  formatTraderNotation,
} from "@/prices/format";

/** What a figure reads as when there is nothing to put there. */
const NOTHING = "—";

/** Tall enough for the icon; the rows are a fixed height so scrolling never jumps. */
const ROW_HEIGHT = 56;

const COLUMNS = ["Icon", "Cosmetic", "Trader Notation", "Metal Value", "Dollars"] as const;

/**
 * The column widths, shared by the header and every row. A phone has no room for
 * five columns, so it drops the Metal Value — which below a Key is word for word
 * what the Trader Notation already says — and the grid loses that track with it.
 */
const GRID =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_4.25rem] items-center gap-2 px-2" +
  " sm:grid-cols-[3rem_minmax(0,1fr)_9rem_6rem_5rem] sm:gap-3 sm:px-3";

/** The Metal Value column: off on a phone, on from `sm` up. */
const WIDE_ONLY = "hidden sm:block";

export interface CosmeticListProps {
  readonly cosmetics: readonly Cosmetic[];
  /** The snapshot's Key Rate, or null when it carried no prices. */
  readonly keyRate: Metal | null;
  /** The active Dollar Basis, or null when no dollar figure can be computed. */
  readonly basis: DollarBasis | null;
}

/** The three price figures a row shows, already written out. */
interface Figures {
  readonly notation: string;
  readonly metalValue: string;
  readonly dollars: string;
}

function figuresFor(cosmetic: Cosmetic, keyRate: Metal | null, basis: DollarBasis | null): Figures {
  const { price } = cosmetic;
  if (price === null) return { notation: NOTHING, metalValue: NOTHING, dollars: NOTHING };
  if (price.state === "unpriced") return { notation: "Unpriced", metalValue: NOTHING, dollars: NOTHING };
  const metal = price.spread.mid.metal;
  const dollars = dollarsFor(metal, basis);
  return {
    notation: formatTraderNotation(metal, keyRate),
    metalValue: formatMetalValue(metal),
    dollars: dollars === null ? NOTHING : formatDollars(dollars),
  };
}

function CosmeticRow({
  cosmetic,
  figures,
  rowIndex,
  style,
}: {
  cosmetic: Cosmetic;
  figures: Figures;
  rowIndex: number;
  style: CSSProperties;
}) {
  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      data-slug={cosmetic.slug}
      style={style}
      className={`${GRID} border-b border-black/5 text-xs sm:text-sm dark:border-white/10`}
    >
      <div role="cell" className="flex items-center justify-center">
        {cosmetic.backpackIcon === null ? null : (
          <img
            src={secureIconUrl(cosmetic.backpackIcon.small)}
            alt={cosmetic.name}
            loading="lazy"
            decoding="async"
            width={40}
            height={40}
            className="max-h-8 max-w-8 object-contain sm:max-h-10 sm:max-w-10"
          />
        )}
      </div>
      <div role="cell" className="truncate font-medium">
        {cosmetic.name}
      </div>
      <div role="cell" className="text-right tabular-nums">
        {figures.notation}
      </div>
      <div role="cell" className={`${WIDE_ONLY} text-right tabular-nums text-black/60 dark:text-white/60`}>
        {figures.metalValue}
      </div>
      <div role="cell" className="text-right tabular-nums">
        {figures.dollars}
      </div>
    </div>
  );
}

export function CosmeticList({ cosmetics, keyRate, basis }: CosmeticListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualiser = useVirtualizer({
    count: cosmetics.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div role="table" aria-label="Cosmetics" aria-rowcount={cosmetics.length} className="flex min-h-0 flex-1 flex-col">
      <div role="rowgroup" className="border-b border-black/10 dark:border-white/15">
        <div role="row" className={`${GRID} h-10 text-xs uppercase tracking-wide text-black/60 dark:text-white/60`}>
          {COLUMNS.map((column, index) => (
            <div
              key={column}
              role="columnheader"
              className={`${index === 3 ? WIDE_ONLY : ""} ${index >= 2 ? "text-right" : "truncate"}`}
            >
              {/* The icon column is headed for a screen reader only: a column of
                  pictures needs no label over it. The cell itself stays in the
                  grid, or every column after it would shift a track left. */}
              <span className={index === 0 ? "sr-only" : undefined}>{column}</span>
            </div>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div role="rowgroup" style={{ height: virtualiser.getTotalSize(), position: "relative" }}>
          {virtualiser.getVirtualItems().map((item) => {
            const cosmetic = cosmetics[item.index];
            if (cosmetic === undefined) return null;
            return (
              <CosmeticRow
                key={cosmetic.slug}
                cosmetic={cosmetic}
                figures={figuresFor(cosmetic, keyRate, basis)}
                // The header is row one, so the first Cosmetic is row two.
                rowIndex={item.index + 2}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
