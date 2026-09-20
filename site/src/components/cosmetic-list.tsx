"use client";

/**
 * The catalogue as one list: every Cosmetic, its Backpack Icon, its price in
 * Trader Notation and as a Metal Value, and what that comes to in dollars. A row
 * expands in place to show where its one figure came from.
 *
 * Eighteen hundred rows with a picture each only scroll smoothly if the browser
 * is holding a screenful of them rather than all of them, so the rows are
 * virtualised: the list is as tall as the whole catalogue and only the rows in
 * view exist. That is also why the markup carries its table roles explicitly —
 * absolutely positioned rows are not a `<table>`, but they are still a table to
 * anyone reading the page with a screen reader.
 *
 * An expanded row is taller than a collapsed one and by an amount that depends
 * on how the panel wraps, so rows are measured rather than assumed: the fixed
 * height is only the estimate the list starts from.
 *
 * Filters, sort and search are #13; the Dollar Basis switch is #14; the Worn
 * Render in place of the icon, and the Style and Team controls inside the
 * expanded row, are #16.
 */
import type { Cosmetic, Metal } from "@tf2-cosm/data/catalogue";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { secureIconUrl } from "@/catalogue/icon";
import { CosmeticDetail } from "@/components/cosmetic-detail";

import {
  type DollarBasis,
  dollarsFor,
  formatDollars,
  formatMetalValue,
  formatTraderNotation,
} from "@/prices/format";

/** What a figure reads as when there is nothing to put there. */
const NOTHING = "—";

/** Tall enough for the icon; a collapsed row is always exactly this. */
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
 * The grid the header and every row's summary are laid on: four columns over two
 * rows on a phone, five columns over one from `sm` up.
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

/** The id the row's toggle points `aria-controls` at. */
function detailId(slug: string): string {
  return `cosmetic-detail-${slug}`;
}

/** The slug in the address bar, if there is one. Empty means no Cosmetic named. */
function slugInHash(): string {
  return decodeURIComponent(window.location.hash.replace(/^#/, ""));
}

/**
 * Put the expanded Cosmetic in the address bar, so the page can be linked to. It
 * replaces rather than pushes: expanding a row is reading, not navigating, and a
 * viewer who opened six rows wants Back to leave the site rather than to close
 * them one at a time.
 */
function writeHash(slug: string | null): void {
  const { pathname, search } = window.location;
  const url = slug === null ? `${pathname}${search}` : `${pathname}${search}#${encodeURIComponent(slug)}`;
  window.history.replaceState(null, "", url);
}

/** One figure in a row, placed by its column rather than by where it falls. */
function Cell({ column, children }: { column: number; children: ReactNode }) {
  return (
    <div role="cell" className={COLUMNS[column]?.className}>
      {children}
    </div>
  );
}

interface CosmeticRowProps {
  cosmetic: Cosmetic;
  figures: Figures;
  keyRate: Metal | null;
  rowIndex: number;
  expanded: boolean;
  onToggle: (slug: string) => void;
  onCollapse: (slug: string) => void;
  /** Hands the row's toggle to the list, which focuses it when a link opens the row. */
  registerToggle: (slug: string, toggle: HTMLButtonElement | null) => void;
  measure: (element: HTMLElement | null) => void;
  index: number;
  style: CSSProperties;
}

function CosmeticRow({
  cosmetic,
  figures,
  keyRate,
  rowIndex,
  expanded,
  onToggle,
  onCollapse,
  registerToggle,
  measure,
  index,
  style,
}: CosmeticRowProps) {
  const { slug } = cosmetic;
  const toggleRef = useCallback(
    (toggle: HTMLButtonElement | null) => registerToggle(slug, toggle),
    [registerToggle, slug],
  );

  // Escape closes the row from anywhere inside it, which is where the focus is
  // once a link has opened one.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !expanded) return;
    event.stopPropagation();
    onCollapse(slug);
  };

  return (
    <div
      role="row"
      aria-rowindex={rowIndex}
      data-slug={slug}
      data-index={index}
      ref={measure}
      style={style}
      className={`border-b border-black/5 text-xs sm:text-sm dark:border-white/10 ${
        expanded ? "bg-black/[0.03] dark:bg-white/[0.04]" : ""
      }`}
      onKeyDown={onKeyDown}
    >
      {/* Presentational, so the cells below are still the row's own cells to a
          screen reader rather than a nested group of their own. */}
      <div
        role="none"
        style={{ height: ROW_HEIGHT }}
        className={`${GRID} cursor-pointer`}
        onClick={() => onToggle(slug)}
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
        <Cell column={1}>
          {/* The whole row takes a click, but only a real button is reachable by
              keyboard and announces whether the row is open. */}
          <button
            type="button"
            ref={toggleRef}
            aria-expanded={expanded}
            aria-controls={expanded ? detailId(slug) : undefined}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(slug);
            }}
            className="w-full truncate text-left underline-offset-2 hover:underline focus-visible:underline"
          >
            {cosmetic.name}
          </button>
        </Cell>
        <Cell column={2}>{figures.notation}</Cell>
        <Cell column={3}>{figures.metalValue}</Cell>
        <Cell column={4}>{figures.dollars}</Cell>
      </div>
      {expanded ? (
        <div role="cell" aria-colspan={COLUMNS.length}>
          <CosmeticDetail cosmetic={cosmetic} keyRate={keyRate} id={detailId(slug)} />
        </div>
      ) : null}
    </div>
  );
}

export function CosmeticList({ cosmetics, keyRate, basis }: CosmeticListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const toggles = useRef(new Map<string, HTMLButtonElement>());
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  /** A row a link asked for, waiting for its toggle to exist so it can take focus. */
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const indexBySlug = useMemo(() => {
    const index = new Map<string, number>();
    cosmetics.forEach((cosmetic, position) => index.set(cosmetic.slug, position));
    return index;
  }, [cosmetics]);

  const virtualiser = useVirtualizer({
    count: cosmetics.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const registerToggle = useCallback((slug: string, toggle: HTMLButtonElement | null) => {
    if (toggle === null) toggles.current.delete(slug);
    else toggles.current.set(slug, toggle);
  }, []);

  const collapse = useCallback(
    (slug: string) => {
      if (expandedSlug !== slug) return;
      setExpandedSlug(null);
      writeHash(null);
      toggles.current.get(slug)?.focus();
    },
    [expandedSlug],
  );

  // Only ever one slug, so opening a row closes whichever one was open.
  const toggle = useCallback(
    (slug: string) => {
      const next = expandedSlug === slug ? null : slug;
      setExpandedSlug(next);
      writeHash(next);
    },
    [expandedSlug],
  );

  // A link to a Cosmetic opens it: on arrival, and again whenever the hash
  // changes underneath us, which is what an in-page link to another row does.
  useEffect(() => {
    const open = () => {
      const slug = slugInHash();
      if (!indexBySlug.has(slug)) return;
      setExpandedSlug(slug);
      setPendingFocus(slug);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [indexBySlug]);

  // Bring the linked row into view. Only the scroll: the row it scrolls to may
  // not be mounted yet, so taking focus is the effect below's job.
  useEffect(() => {
    if (pendingFocus === null) return;
    const index = indexBySlug.get(pendingFocus);
    if (index === undefined) setPendingFocus(null);
    else virtualiser.scrollToIndex(index, { align: "start" });
  }, [pendingFocus, indexBySlug, virtualiser]);

  // Deliberately every render: scrolling to a row renders it, and this is the
  // first pass after that render where its toggle exists to be focused.
  useEffect(() => {
    if (pendingFocus === null) return;
    const toggleForRow = toggles.current.get(pendingFocus);
    if (toggleForRow === undefined) return;
    toggleForRow.focus();
    setPendingFocus(null);
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
                keyRate={keyRate}
                // The header is row one, so the first Cosmetic is row two.
                rowIndex={item.index + 2}
                expanded={cosmetic.slug === expandedSlug}
                onToggle={toggle}
                onCollapse={collapse}
                registerToggle={registerToggle}
                measure={virtualiser.measureElement}
                index={item.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
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
