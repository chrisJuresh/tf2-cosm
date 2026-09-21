"use client";

/**
 * The catalogue as a grid: every Cosmetic a card, as many cards across as the
 * screen is wide, each with its picture, its name, its price in Trader Notation
 * and as a Metal Value, and what that comes to in dollars. A card opens over the
 * page, as a modal, to show where its one figure came from — see
 * `@/components/cosmetic-modal`.
 *
 * A grid rather than a list because of what the picture costs. A Worn Render
 * only says which hat this is at something like the size a hand holds it, and at
 * that size a row is a picture with two hundred pixels of figures beside it and
 * the rest of a desktop screen empty — five Cosmetics on a screenful out of
 * eighteen hundred. The same card in a grid is thirty. Nothing shrank and
 * nothing was dropped to get there; the width was simply being thrown away.
 *
 * How many across is a measurement, not a breakpoint: the grid takes the width
 * it is given and fits as many cards of at least `MIN_CARD_WIDTH` into it as
 * will go, which is two on a phone and ten or more on a wide monitor without a
 * single media query. Everything else is the same problem the row list had:
 * eighteen hundred cards with a picture each only scroll smoothly if the browser
 * is holding a screenful rather than all of them, so the grid is virtualised a
 * row of cards at a time. Opening a Cosmetic leaves the grid exactly as it was:
 * the modal is over the page rather than in it, so no row changes height and
 * nothing a viewer was looking at moves.
 *
 * The markup carries its list roles explicitly — absolutely positioned rows of
 * cards are not a `<ul>`, but they are still a list of eighteen hundred things
 * to anyone reading the page with a screen reader, and each card says which of
 * the eighteen hundred it is because only a screenful of them exists to count.
 *
 * The Dollar Basis the dollar figure is computed at is chosen above the grid and
 * handed down, and which Cosmetics these are, and in what order, is settled
 * before they get here — see `@/components/catalogue-browser`.
 */
import type { ClassName, Cosmetic, Metal } from "@tf2-cosm/data/catalogue";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, type MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { qualityRead } from "@/catalogue/describe";
import { CosmeticModal } from "@/components/cosmetic-modal";
import { WornRender } from "@/components/worn-render";
import type { OwnedCosmetic } from "@/inventory/owned";
import type { RenderManifest } from "@/renders/manifest";
import { DEFAULT_STYLE, DEFAULT_TEAM, displayedClass } from "@/renders/select";

import {
  approximately,
  type DollarBasis,
  dollarsFor,
  formatDollars,
  formatMetalValue,
  formatTraderNotation,
  UNPRICED_REASON_LABELS,
} from "@/prices/format";

/** What a figure reads as when there is nothing to put there. */
const NOTHING = "—";

/**
 * The narrowest a card may get before the grid drops a column, in pixels.
 *
 * A shade under the picture's own box, which is deliberate and is the one place
 * the picture gives anything up: at this width a phone of 375 pixels gets two
 * columns rather than one, and the picture on it comes out about a hundred and
 * fifty-five pixels across instead of a hundred and sixty. A column is worth
 * five pixels. Anything narrower is not — the picture is what says which hat
 * this is, and a card that shrank it to fit a third column would be a card you
 * cannot read.
 */
const MIN_CARD_WIDTH = 168;

/** The gap between cards, across and down, in pixels. */
const GAP = 8;

/**
 * A card is always exactly this tall, in pixels: the picture, two lines for the
 * name, and the three figures under it. Fixed, so a row of cards is one height
 * rather than the tallest name in it, and so the figures line up across the row.
 */
const CARD_HEIGHT = 256;

/**
 * How many across before the grid has been measured — the server's render, and
 * anywhere a width cannot be had. The measurement lands in a layout effect, so a
 * real browser never paints this; it is here so that what it paints instead of
 * nothing is a plausible grid rather than a single column.
 */
const UNMEASURED_COLUMNS = 4;

/**
 * How big the grid draws a Cosmetic, and which derivative it asks for. A closed
 * card shows the catalogue's own default look on RED: the Style and the Team are
 * what an open card lets a viewer change, and eighteen hundred cards each
 * remembering their own would be eighteen hundred pictures nobody asked to see.
 *
 * The derivative is the next size up from the box it is drawn in, so a
 * high-density screen has pixels to spend.
 */
const CARD_RENDER_SIZE = 256;

/**
 * How many cards fit across the element, and a way to keep that current. Nothing
 * about it is a breakpoint: it is the width, divided.
 *
 * A width of zero is not a measurement — it is an element that has not been laid
 * out, a `display: none` ancestor, or jsdom, which lays nothing out at all — so
 * it leaves the last real answer standing rather than collapsing the grid to one
 * column and back.
 */
function useColumns(element: React.RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(UNMEASURED_COLUMNS);

  useLayoutEffect(() => {
    const node = element.current;
    if (node === null) return;

    const measure = () => {
      const width = node.clientWidth;
      if (width === 0) return;
      const fits = Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP));
      setColumns(Math.max(1, fits));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [element]);

  return columns;
}

export interface CosmeticGridProps {
  readonly cosmetics: readonly Cosmetic[];
  /** Which Worn Renders exist; empty when no run has produced any. */
  readonly manifest: RenderManifest;
  /**
   * The Class whose Class View is showing, or null for the whole catalogue. It
   * decides which Class every picture shows, which is what the view is for where
   * an All-Class Cosmetic is concerned; the Class filter itself is #13.
   */
  readonly classView: ClassName | null;
  /** The snapshot's Key Rate, or null when it carried no prices. */
  readonly keyRate: Metal | null;
  /** The active Dollar Basis, or null when no dollar figure can be computed. */
  readonly basis: DollarBasis | null;
  /**
   * What the viewer owns, by slug. A card of a Cosmetic in here shows what their
   * copy is worth rather than what the Cosmetic costs, which is the whole point
   * of reading a backpack.
   *
   * Left out means no backpack has been read, which is how every viewer arrives
   * and is the state most of the suite drives the grid in.
   */
  readonly owned?: ReadonlyMap<string, OwnedCosmetic> | undefined;
}

/** The three price figures a card shows, already written out. */
interface Figures {
  readonly notation: string;
  /** Why an Unpriced Cosmetic has no figures, under the word "Unpriced". */
  readonly reason: string | null;
  readonly metalValue: string;
  readonly dollars: string;
}

/**
 * What a card shows for a Cosmetic the viewer owns: their own copy's figure,
 * not the Cosmetic's.
 *
 * This is the whole point of reading a backpack. A Genuine copy is worth the
 * Genuine price and the catalogue's Reference Price is a different number about
 * a different copy, so where the two disagree the card follows the viewer's.
 *
 * `owned.copies` is most valuable first, so the figure is the best copy they
 * hold. An Unusual has no figure by design — a price source prices those by
 * effect (ADR-0005) — and says so under the Quality rather than falling through
 * to a number that would be wrong by two orders of magnitude.
 */
function ownedFigures(
  owned: OwnedCosmetic,
  keyRate: Metal | null,
  basis: DollarBasis | null,
): Figures {
  const best = owned.copies[0];
  const held = owned.count === 1 ? "" : ` ×${owned.count}`;
  if (best === undefined) return { notation: NOTHING, reason: null, metalValue: NOTHING, dollars: NOTHING };

  const said = `${qualityRead(best.quality)}${best.craftable ? "" : ", non-craftable"}${held}`;
  if (best.price === null) {
    // An untradable copy is not a copy the snapshot has no figure for: nobody
    // can be handed it, so nobody would give anything for it, and the card says
    // that with the figure rather than with a blank.
    if (best.noPrice === "untradable") {
      const nothing: Metal = { scrap: 0, refined: 0, notation: "" };
      return {
        notation: "Untradable",
        reason: said,
        metalValue: formatMetalValue(nothing),
        dollars: basis === null ? NOTHING : formatDollars(0),
      };
    }
    return {
      notation: best.noPrice === "priced-per-effect" ? "Priced by its effect" : "No price for that Quality",
      reason: best.effect === undefined ? said : `${said} · ${best.effect}`,
      metalValue: NOTHING,
      dollars: NOTHING,
    };
  }

  const metal: Metal = {
    scrap: best.price.scrap.mid,
    refined: best.price.scrap.mid / 9,
    notation: "",
  };
  const dollars = dollarsFor(metal, basis);
  const written = (figure: string) => (best.price?.blanket === true ? approximately(figure) : figure);
  return {
    notation: written(formatTraderNotation(metal, keyRate)),
    reason: said,
    metalValue: written(formatMetalValue(metal)),
    dollars: dollars === null ? NOTHING : written(formatDollars(dollars)),
  };
}

/** A card's figures: the viewer's own copy where they have one, the Cosmetic's otherwise. */
function figuresForCard(
  cosmetic: Cosmetic,
  owned: OwnedCosmetic | undefined,
  keyRate: Metal | null,
  basis: DollarBasis | null,
): Figures {
  return owned === undefined ? figuresFor(cosmetic, keyRate, basis) : ownedFigures(owned, keyRate, basis);
}

function figuresFor(cosmetic: Cosmetic, keyRate: Metal | null, basis: DollarBasis | null): Figures {
  const { price } = cosmetic;
  if (price === null) return { notation: NOTHING, reason: null, metalValue: NOTHING, dollars: NOTHING };
  if (price.state === "unpriced") {
    return {
      notation: "Unpriced",
      reason: UNPRICED_REASON_LABELS[price.reason],
      metalValue: NOTHING,
      dollars: NOTHING,
    };
  }
  const metal = price.spread.mid.metal;
  const dollars = dollarsFor(metal, basis);
  // A Blanket Price is the source's figure for every cheap hat rather than for
  // this one, so all three figures say about (ADR-0004).
  const written = (figure: string) => (price.blanket ? approximately(figure) : figure);
  return {
    notation: written(formatTraderNotation(metal, keyRate)),
    reason: null,
    metalValue: written(formatMetalValue(metal)),
    dollars: dollars === null ? NOTHING : written(formatDollars(dollars)),
  };
}

/** The slug in the address bar, if there is one. Empty means no Cosmetic named. */
function slugInHash(): string {
  return decodeURIComponent(window.location.hash.replace(/^#/, ""));
}

/**
 * Put the open Cosmetic in the address bar, so the page can be linked to. It
 * replaces rather than pushes: opening a Cosmetic is reading, not navigating,
 * and a viewer who opened six wants Back to leave the site rather than to close
 * them one at a time.
 */
function writeHash(slug: string | null): void {
  const { pathname, search } = window.location;
  const url = slug === null ? `${pathname}${search}` : `${pathname}${search}#${encodeURIComponent(slug)}`;
  window.history.replaceState(null, "", url);
}

/**
 * Is the viewer's selection inside this element?
 *
 * Dragging across a Cosmetic's name is someone copying it, not a click on the
 * card — but the browser fires a click at the end of the drag all the same, and
 * opening the Cosmetic on it would throw a modal over what they were reading the
 * moment they let go.
 */
function selectionInside(element: Element): boolean {
  const selection = window.getSelection();
  if (selection === null || selection.isCollapsed) return false;
  return element.contains(selection.anchorNode) || element.contains(selection.focusNode);
}

/**
 * One figure, with the name of the figure alongside it for a screen reader.
 *
 * A row list could label its figures once, in a column heading over all
 * eighteen hundred of them. A grid has nowhere to put that heading, and three
 * bare numbers on a card read aloud as three bare numbers — so each card carries
 * its own labels, and only the figure is drawn.
 */
function Figure({ term, value, className }: { term: string; value: string; className?: string }) {
  return (
    <>
      <dt className="sr-only">{term}</dt>
      <dd className={`tabular-nums ${className ?? ""}`}>{value}</dd>
    </>
  );
}

interface CosmeticCardProps {
  cosmetic: Cosmetic;
  figures: Figures;
  /** What the viewer owns of this Cosmetic, where they own any. */
  owned: OwnedCosmetic | undefined;
  manifest: RenderManifest;
  /** The Class this card's picture shows, settled once by the grid. */
  gameClass: ClassName;
  /** Which of the whole catalogue this card is, since only a screenful exists. */
  position: number;
  total: number;
  onOpen: (slug: string) => void;
  /** Hands the card's control to the grid, which focuses it when the modal closes. */
  registerToggle: (slug: string, toggle: HTMLButtonElement | null) => void;
}

function CosmeticCard({
  cosmetic,
  figures,
  owned,
  manifest,
  gameClass,
  position,
  total,
  onOpen,
  registerToggle,
}: CosmeticCardProps) {
  const { slug } = cosmetic;
  const toggleRef = useCallback(
    (node: HTMLButtonElement | null) => registerToggle(slug, node),
    [registerToggle, slug],
  );

  /** A click anywhere on the card opens the Cosmetic — unless it ended a drag. */
  const onCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (selectionInside(event.currentTarget)) return;
    onOpen(slug);
  };

  return (
    <div
      role="listitem"
      data-slug={slug}
      aria-posinset={position}
      aria-setsize={total}
      style={{ height: CARD_HEIGHT }}
      // The whole card is the click target: a viewer aims at the picture, not at
      // the name under it. The control itself is only the name, so that the
      // picture and the figures are not read out as part of what it is called —
      // and so that the name is text a viewer can drag over and copy, which it
      // would not be under a click target stretched over the card.
      onClick={onCardClick}
      className={
        "flex cursor-pointer flex-col overflow-hidden rounded-lg border border-black/10 p-2 text-sm" +
        " hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.05]"
      }
    >
      {/* A corner mark rather than a line of its own: a card is a fixed height
          and every pixel the mark took would come off the picture. It carries
          its own words for a screen reader, because "×2" over a picture is not
          a sentence. */}
      <div className="relative flex h-40 items-center justify-center">
        {owned === undefined ? null : (
          <span
            className={
              "absolute top-0 right-0 rounded-full bg-black/75 px-1.5 py-0.5 text-[0.625rem]" +
              " font-medium text-white dark:bg-white/85 dark:text-black"
            }
          >
            <span aria-hidden="true">{owned.count === 1 ? "Owned" : `Owned ×${owned.count}`}</span>
            <span className="sr-only">
              You own {owned.count === 1 ? "one copy" : `${owned.count} copies`} of this
            </span>
          </span>
        )}
        <WornRender
          cosmetic={cosmetic}
          manifest={manifest}
          gameClass={gameClass}
          team={DEFAULT_TEAM}
          style={DEFAULT_STYLE}
          size={CARD_RENDER_SIZE}
          // Drawn at 160 pixels, so the fallback is the 512 icon: the 64 one
          // would be upscaled in the only place it shows.
          icon="large"
          className="max-h-40 max-w-full object-contain"
        />
      </div>
      {/* Two lines whether the name needs them or not, so the figures line up
          across a row of cards rather than floating up under the short names.
          Not a heading: eighteen hundred of them would be a heading outline
          nobody could navigate, and the card is a list item already. */}
      <div className="mt-1.5 h-9 leading-tight font-medium">
        <button
          type="button"
          ref={toggleRef}
          // What the control does is open a modal, which is what a screen
          // reader should hear before it is pressed rather than after.
          aria-haspopup="dialog"
          onClick={(event) => {
            // The card around it takes the click too, and would open twice.
            event.stopPropagation();
            if (selectionInside(event.currentTarget)) return;
            onOpen(slug);
          }}
          // `select-text` because a browser makes a button's own text
          // unselectable, and the name is the one thing on the card a viewer
          // wants to drag over and copy. Only a real button is reachable by
          // keyboard, which is what the name being the control buys.
          className={
            "line-clamp-2 select-text text-left" +
            " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          }
        >
          {cosmetic.name}
        </button>
      </div>
      <dl className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
        <Figure term="Trader Notation" value={figures.notation} className="col-span-2 truncate" />
        {figures.reason === null ? null : (
          <>
            <dt className="sr-only">Why</dt>
            <dd className="col-span-2 truncate text-[0.6875rem] leading-tight text-black/55 dark:text-white/55">
              {figures.reason}
            </dd>
          </>
        )}
        <Figure term="Metal Value" value={figures.metalValue} className="text-xs text-black/60 dark:text-white/60" />
        <Figure term="Dollars" value={figures.dollars} className="justify-self-end text-xs" />
      </dl>
    </div>
  );
}

/** No backpack read: what every viewer arrives with, and a stable identity for it. */
const NOTHING_OWNED: ReadonlyMap<string, OwnedCosmetic> = new Map();

export function CosmeticGrid({
  cosmetics,
  manifest,
  classView,
  keyRate,
  basis,
  owned = NOTHING_OWNED,
}: CosmeticGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const toggles = useRef(new Map<string, HTMLButtonElement>());
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  /** A card a link asked for, waiting to be scrolled to once its row is known. */
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  const columns = useColumns(scrollRef);
  const rowCount = Math.ceil(cosmetics.length / columns);

  const indexBySlug = useMemo(() => {
    const index = new Map<string, number>();
    cosmetics.forEach((cosmetic, position) => index.set(cosmetic.slug, position));
    return index;
  }, [cosmetics]);

  /** The Cosmetic the modal is showing, or undefined when none is open. */
  const open = openSlug === null ? undefined : cosmetics.find((cosmetic) => cosmetic.slug === openSlug);

  const virtualiser = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: 3,
  });

  // A row of four cards and a row of ten are different rows, and the heights
  // measured for the old ones say nothing about the new.
  const { measure } = virtualiser;
  useEffect(() => measure(), [columns, measure]);

  const registerToggle = useCallback((slug: string, toggle: HTMLButtonElement | null) => {
    if (toggle === null) toggles.current.delete(slug);
    else toggles.current.set(slug, toggle);
  }, []);

  // Closing puts the focus back on the card that opened the Cosmetic, wherever
  // the modal happened to leave it: a viewer who arrived by keyboard carries on
  // from the card they were on rather than from the top of the page.
  const close = useCallback(() => {
    const slug = openSlug;
    setOpenSlug(null);
    writeHash(null);
    if (slug !== null) toggles.current.get(slug)?.focus();
  }, [openSlug]);

  // Only ever one slug, so the modal is only ever one Cosmetic.
  const openCosmetic = useCallback((slug: string) => {
    setOpenSlug(slug);
    writeHash(slug);
  }, []);

  // A link to a Cosmetic opens it: on arrival, and again whenever the hash
  // changes underneath us, which is what an in-page link to another card does.
  // An address with no Cosmetic on it closes whatever was open, so the page and
  // the address cannot say two different things.
  useEffect(() => {
    const follow = () => {
      const slug = slugInHash();
      if (slug === "") {
        setOpenSlug(null);
        return;
      }
      if (!indexBySlug.has(slug)) return;
      setOpenSlug(slug);
      setPendingScroll(slug);
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [indexBySlug]);

  // Bring the linked card into view behind the modal. The focus belongs to the
  // modal, which takes it on the way in; the scroll is so that closing the modal
  // lands the viewer on the Cosmetic they linked to rather than at the top of
  // the grid, and so that the card whose control takes the focus back exists.
  useEffect(() => {
    if (pendingScroll === null) return;
    const index = indexBySlug.get(pendingScroll);
    if (index !== undefined) virtualiser.scrollToIndex(Math.floor(index / columns), { align: "start" });
    setPendingScroll(null);
  }, [pendingScroll, indexBySlug, columns, virtualiser]);

  const row: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: GAP,
    // The gap below the last row of a card, which a grid's own `gap` does not
    // draw. The row is measured, so what it is tall is what the virtualiser puts
    // between this row and the next.
    paddingBottom: GAP,
  };

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-3">
      {/* A grid narrowed to nothing has to say so: an empty scroller reads as a
          page that has broken rather than as a filter that matched nothing. */}
      {cosmetics.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-black/60 dark:text-white/60">
          No Cosmetic matches these controls.
        </p>
      ) : null}
      <div
        role="list"
        aria-label="Cosmetics"
        style={{ height: virtualiser.getTotalSize(), position: "relative" }}
      >
        {virtualiser.getVirtualItems().map((item) => {
          const first = item.index * columns;
          const shown = cosmetics.slice(first, first + columns);
          return (
            // Presentational, so the cards below are the list's own items rather
            // than something nested inside one.
            <div
              key={item.key}
              role="none"
              data-index={item.index}
              ref={virtualiser.measureElement}
              style={{ ...row, transform: `translateY(${item.start}px)` }}
            >
              {shown.map((cosmetic, offset) => (
                <CosmeticCard
                  key={cosmetic.slug}
                  cosmetic={cosmetic}
                  // A Cosmetic the viewer owns is shown at their own copy's
                  // figure. Where the two disagree the card follows theirs,
                  // because that is the copy in their hands.
                  figures={figuresForCard(cosmetic, owned.get(cosmetic.slug), keyRate, basis)}
                  owned={owned.get(cosmetic.slug)}
                  manifest={manifest}
                  gameClass={displayedClass(cosmetic, classView)}
                  position={first + offset + 1}
                  total={cosmetics.length}
                  onOpen={openCosmetic}
                  registerToggle={registerToggle}
                />
              ))}
            </div>
          );
        })}
      </div>
      {open === undefined ? null : (
        <CosmeticModal
          cosmetic={open}
          keyRate={keyRate}
          manifest={manifest}
          gameClass={displayedClass(open, classView)}
          onClose={close}
        />
      )}
    </div>
  );
}
