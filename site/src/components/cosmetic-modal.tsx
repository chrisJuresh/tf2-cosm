"use client";

/**
 * One Cosmetic, over the page: the card a viewer clicked, opened as a modal.
 *
 * A panel inside the grid had the grid's width to live in and the grid's row
 * height to disturb — a picture no bigger than the card's own, the fields
 * wrapped into a strip, and every card below it pushed down. Over the page the
 * picture gets the room it is worth, since the Worn Render is the thing a viewer
 * opened the Cosmetic to see, and the grid behind it does not move at all.
 *
 * The empty space around the card is a control, not a margin: clicking it closes
 * the Cosmetic, which is the gesture anyone expects of a modal and the one the
 * viewer's hand is already near. Escape closes it too, and either way the focus
 * goes back to the card that opened it.
 *
 * `<dialog>` would give the focus trap and the backdrop for free in a browser,
 * but jsdom implements neither `showModal` nor the top layer, so the suite could
 * not drive what a viewer does. This is that behaviour written out: the modal is
 * a portal into `<body>`, and the focus, the scroll lock, the Tab trap and the
 * two ways out are the effects and handlers below.
 */
import type { ClassName, Cosmetic, Metal } from "@tf2-cosm/data/catalogue";
import { type KeyboardEvent, type MouseEvent, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { CosmeticDetail } from "@/components/cosmetic-detail";
import type { RenderManifest } from "@/renders/manifest";

/** What a screen reader hears the modal called, and where the heading lives. */
function titleId(slug: string): string {
  return `cosmetic-modal-title-${slug}`;
}

/** Everything inside the card that a Tab can reach, in the order Tab reaches it. */
const FOCUSABLE = "a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])";

export interface CosmeticModalProps {
  readonly cosmetic: Cosmetic;
  /** The snapshot's Key Rate, or null when it carried no prices. */
  readonly keyRate: Metal | null;
  /** Which Worn Renders exist; empty when no run has produced any. */
  readonly manifest: RenderManifest;
  /** The Class the picture shows — settled by the grid, so the card and the modal agree. */
  readonly gameClass: ClassName;
  /** Closing: the grid takes the slug out of the address and refocuses the card. */
  readonly onClose: () => void;
}

export function CosmeticModal({ cosmetic, keyRate, manifest, gameClass, onClose }: CosmeticModalProps) {
  const card = useRef<HTMLDivElement>(null);

  // The modal takes the focus on the way in. Without it the focus would still be
  // on the card behind the backdrop, where Tab would walk the grid a viewer
  // cannot see.
  useEffect(() => {
    card.current?.focus();
  }, [cosmetic.slug]);

  // The page behind does not scroll while the modal is over it: a wheel over the
  // backdrop scrolling eighteen hundred cards out from under the Cosmetic being
  // read is the one thing a modal is meant to stop.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  /**
   * Escape closes, and Tab stays inside. The trap is a wrap rather than a guard
   * on every element: the first Tab off the end goes back to the beginning, and
   * a Shift+Tab off the front goes to the end.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || card.current === null) return;
    const reachable = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = reachable[0];
    const last = reachable.at(-1);
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (active === first || active === card.current)) {
      event.preventDefault();
      last.focus();
    }
  };

  /** A click on the space around the card, rather than on anything in it. */
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  // The portal has nowhere to go without a document, and the server has none.
  // Nothing is ever open on the server anyway — a Cosmetic opens on a click, or
  // on a hash the page reads once it is running — so this costs no markup.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      // Padding rather than a margin, so the space that closes the Cosmetic is
      // part of the backdrop and takes the click.
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
      onClick={onBackdropClick}
    >
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId(cosmetic.slug)}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={
          "max-h-full w-full max-w-3xl overflow-y-auto rounded-xl border border-black/10 bg-white p-4 shadow-2xl" +
          " focus:outline-none sm:p-5 dark:border-white/15 dark:bg-neutral-900"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId(cosmetic.slug)} className="text-base font-semibold sm:text-lg">
            {cosmetic.name}
          </h2>
          {/* Named rather than an unlabelled ×, and first in the tab order after
              the card itself, so the way out is the way in reversed. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={
              "-mt-1 -mr-1 shrink-0 rounded px-2 py-1 text-lg leading-none text-black/55 hover:bg-black/5" +
              " focus-visible:outline-2 focus-visible:outline-offset-1 dark:text-white/55 dark:hover:bg-white/10"
            }
          >
            ×
          </button>
        </div>
        <CosmeticDetail
          cosmetic={cosmetic}
          keyRate={keyRate}
          manifest={manifest}
          gameClass={gameClass}
          id={`cosmetic-detail-${cosmetic.slug}`}
        />
      </div>
    </div>,
    document.body,
  );
}
