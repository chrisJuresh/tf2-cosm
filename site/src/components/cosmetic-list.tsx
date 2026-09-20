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
import { type CSSProperties, type ReactNode, useRef } from "react";

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

interface Column {
  /** What the column is called, in the header. */
  readonly label: string;
  /** Where the cell sits and how it reads, in the header and in every row alike. */
  readonly className: string;
  /** True for the picture column, whose heading is for a screen reader only. */
  readonly unlabelled?: true;
}

/**
 * The five columns, in order, each placed by its own classes rather than by where
 * it happens to fall — so the header and the row cannot drift apart, and a column
 * can move without every column after it shifting a track.
 *
 * A phone has room for four columns across, not five, so it keeps the Metal Value
 * on a second line under the Cosmetic's name instead of dropping it: below a Key
 * the Metal Value is word for word the Trader Notation, but above one it is the
 * figure that makes two Cosmetics comparable, and a phone viewer wants it too.
 */
const COLUMNS: readonly Column[] = [
  { label: "Icon", className: "col-start-1 row-start-1 row-span-2 sm:row-span-1 justify-self-center", unlabelled: true },
  { label: "Cosmetic", className: "col-start-2 row-start-1 truncate font-medium self-end sm:self-center" },
  {
    label: "Trader Notation",
    className: "col-start-3 row-start-1 row-span-2 self-center text-right tabular-nums sm:row-span-1",
  },
  {
    label: "Metal Value",
    className:
      "col-start-2 row-start-2 text-left text-[0.6875rem] self-start tabular-nums text-black/55 dark:text-white/55" +
      " sm:col-start-4 sm:row-start-1 sm:self-center sm:text-right sm:text-sm sm:text-black/60 sm:dark:text-white/60",
  },
  {
    label: "Dollars",
    className: "col-start-4 row-start-1 row-span-2 self-center text-right tabular-nums sm:col-start-5 sm:row-span-1",
  },
];

/**
 * The grid the header and every row are laid on: four columns over two rows on a
 * phone, five columns over one from `sm` up.
 */
const GRID =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_4.25rem] grid-rows-[1fr_1fr] content-center gap-x-2 px-2" +
  " sm:grid-cols-[3rem_minmax(0,1fr)_9rem_6rem_5rem] sm:grid-rows-1 sm:items-center sm:gap-x-3 sm:px-3";

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

/** One figure in a row, placed by its column rather than by where it falls. */
function Cell({ column, children }: { column: number; children: ReactNode }) {
  return (
    <div role="cell" className={COLUMNS[column]?.className}>
      {children}
    </div>
  );
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
      <Cell column={0}>
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
      </Cell>
      <Cell column={1}>{cosmetic.name}</Cell>
      <Cell column={2}>{figures.notation}</Cell>
      <Cell column={3}>{figures.metalValue}</Cell>
      <Cell column={4}>{figures.dollars}</Cell>
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
    <div
      role="table"
      aria-label="Cosmetics"
      // The header is a row too, so the count a screen reader announces each row
      // out of has to include it.
      aria-rowcount={cosmetics.length + 1}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div role="rowgroup" className="border-b border-black/10 dark:border-white/15">
        <div
          role="row"
          aria-rowindex={1}
          className={`${GRID} h-10 text-xs uppercase tracking-wide text-black/60 dark:text-white/60`}
        >
          {COLUMNS.map((column) => (
            <div key={column.label} role="columnheader" className={column.className}>
              {/* The icon column is headed for a screen reader only: a column of
                  pictures needs no label over it. */}
              <span className={column.unlabelled === true ? "sr-only" : undefined}>{column.label}</span>
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
