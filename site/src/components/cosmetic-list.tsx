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
 * The Dollar Basis the dollar column is computed at is chosen above the list and
 * handed down, and which Cosmetics these are, and in what order, is settled
 * before they get here — see `@/components/catalogue-browser`. The Worn Render
 * in place of the icon, and the Style and Team controls inside the expanded row,
 * are #16.
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
  approximately,
  type DollarBasis,
  dollarsFor,
  formatDollars,
  formatMetalValue,
  formatTraderNotation,
  unpricedReasonLabel,
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
  /** Why an Unpriced Cosmetic has no figures, under the word "Unpriced". */
  readonly reason: string | null;
  readonly metalValue: string;
  readonly dollars: string;
}

function figuresFor(cosmetic: Cosmetic, keyRate: Metal | null, basis: DollarBasis | null): Figures {
  const { price } = cosmetic;
  if (price === null) return { notation: NOTHING, reason: null, metalValue: NOTHING, dollars: NOTHING };
  if (price.state === "unpriced") {
    return {
      notation: "Unpriced",
      reason: unpricedReasonLabel(price.reason),
      metalValue: NOTHING,
      dollars: NOTHING,
    };
  }
  const metal = price.spread.mid.metal;
  const dollars = dollarsFor(metal, basis);
  // A Blanket Price is the source's figure for every cheap hat rather than for
  // this one, so all three columns say about (ADR-0004).
  const written = (figure: string) => (price.blanket ? approximately(figure) : figure);
  return {
    notation: written(formatTraderNotation(metal, keyRate)),
    reason: null,
    metalValue: written(formatMetalValue(metal)),
    dollars: dollars === null ? NOTHING : written(formatDollars(dollars)),
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
  /** The summary row's own index; an open row's panel is the row after it. */
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
  const toggle = useRef<HTMLButtonElement | null>(null);
  const toggleRef = useCallback(
    (node: HTMLButtonElement | null) => {
      toggle.current = node;
      registerToggle(slug, node);
    },
    [registerToggle, slug],
  );

  // Escape closes the row from anywhere inside it, which is where the focus is
  // whenever a row is open: opening one always puts the focus on its toggle.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !expanded) return;
    event.stopPropagation();
    onCollapse(slug);
  };

  /**
   * A click on the row is a click on its toggle. Taking the focus is the point:
   * a click landing on a plain cell would otherwise leave the focus on the body,
   * and the viewer who just opened a row would have nothing to press Escape on.
   */
  const onRowClick = () => {
    toggle.current?.focus();
    onToggle(slug);
  };

  return (
    // Presentational, so the two rows below are the rowgroup's own rows rather
    // than something nested inside a row.
    <div role="none" data-index={index} ref={measure} style={style} onKeyDown={onKeyDown}>
      <div
        role="row"
        aria-rowindex={rowIndex}
        data-slug={slug}
        style={{ height: ROW_HEIGHT }}
        className={`${GRID} cursor-pointer border-b border-black/5 text-xs sm:text-sm dark:border-white/10 ${
          expanded ? "border-transparent bg-black/[0.03] dark:border-transparent dark:bg-white/[0.04]" : ""
        }`}
        onClick={onRowClick}
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
        <Cell column={2}>
          {figures.notation}
          {figures.reason === null ? null : (
            <div className="text-[0.6875rem] leading-tight text-black/55 dark:text-white/55">{figures.reason}</div>
          )}
        </Cell>
        <Cell column={3}>{figures.metalValue}</Cell>
        <Cell column={4}>{figures.dollars}</Cell>
      </div>
      {expanded ? (
        // A row of its own, one cell wide across every column, which is what a
        // table does with a detail panel. Folding it into the summary row
        // instead would leave that row with six cells under five headings.
        <div
          role="row"
          aria-rowindex={rowIndex + 1}
          className="border-b border-black/5 text-xs sm:text-sm dark:border-white/10"
        >
          <div role="cell" aria-colindex={1} aria-colspan={COLUMNS.length} className="bg-black/[0.03] dark:bg-white/[0.04]">
            <CosmeticDetail cosmetic={cosmetic} keyRate={keyRate} id={detailId(slug)} />
          </div>
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

  /** Where the open row sits in the list, which every row below it counts from. */
  const expandedIndex = expandedSlug === null ? null : (indexBySlug.get(expandedSlug) ?? null);

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
  // An address with no Cosmetic on it closes whatever was open, so the page and
  // the address cannot say two different things.
  useEffect(() => {
    const follow = () => {
      const slug = slugInHash();
      if (slug === "") {
        setExpandedSlug(null);
        return;
      }
      if (!indexBySlug.has(slug)) return;
      setExpandedSlug(slug);
      setPendingFocus(slug);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
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
      // The header is a row too, and so is an open row's panel, so the count a
      // screen reader announces each row out of has to include both.
      aria-rowcount={cosmetics.length + 1 + (expandedIndex === null ? 0 : 1)}
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
        {/* A list narrowed to nothing has to say so: an empty scroller reads as a
            page that has broken rather than as a filter that matched nothing. */}
        {cosmetics.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-black/60 dark:text-white/60">
            No Cosmetic matches these controls.
          </p>
        ) : null}
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
                // The header is row one, so the first Cosmetic is row two — and
                // every Cosmetic below an open one is a further row down,
                // because that row's panel is a row in its own right.
                rowIndex={item.index + 2 + (expandedIndex !== null && item.index > expandedIndex ? 1 : 0)}
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
