"use client";

/**
 * The catalogue, browsed: the controls and the grid they narrow, and the one
 * place the two meet.
 *
 * The whole catalogue arrives once as a prop and never changes. What a viewer
 * picks lives here — and only here — so the grid below stays a component that
 * draws the Cosmetics it is handed and knows nothing about why those are the
 * ones it got.
 *
 * The viewer's own Inventory lives here too, for the same reason and on the same
 * terms: it is another thing that narrows the list, and the grid is handed the
 * result rather than the reason.
 */
import type { Cosmetic, Metal } from "@tf2-cosm/data/catalogue";
import { type ReactNode, useMemo } from "react";

import { viewedClass, visibleCosmetics } from "@/browsing/controls";
import { useRememberedControls } from "@/browser/remembered-controls";
import { priceCeiling, priceScale } from "@/browsing/price-scale";
import { BrowsingControlsPanel } from "@/components/browsing-controls";
import { CosmeticGrid } from "@/components/cosmetic-grid";
import { InventoryControls } from "@/components/inventory-controls";
import { inventoryApiUrl } from "@/inventory/load";
import { useInventory } from "@/inventory/use-inventory";
import type { DollarBasis } from "@/prices/format";
import type { RenderManifest } from "@/renders/manifest";

export interface CatalogueBrowserProps {
  /** What heads the sidebar: the page's title and the Dollar Basis in force. */
  readonly masthead?: ReactNode;
  readonly cosmetics: readonly Cosmetic[];
  /** Which Worn Renders exist; empty when no run has produced any. */
  readonly manifest: RenderManifest;
  /** The snapshot's Key Rate, or null when it carried no prices. */
  readonly keyRate: Metal | null;
  /** The active Dollar Basis, or null when no dollar figure can be computed. */
  readonly basis: DollarBasis | null;
  /**
   * The catalogue's own snapshot time. The Variant Prices carry it too, and a
   * pair that disagrees is refused rather than priced at the wrong Key Rate.
   */
  readonly snapshotTakenAt: string;
}

export function CatalogueBrowser({ masthead, cosmetics, manifest, keyRate, basis, snapshotTakenAt }: CatalogueBrowserProps) {
  const [controls, change] = useRememberedControls();
  // The untradable toggle goes in here rather than into the filter below: it
  // takes copies out of the Inventory, and the owned set every other control
  // reads is what is left of it.
  const [inventory, inventoryActions] = useInventory(cosmetics, snapshotTakenAt, controls.hideUntradable);
  // Read once per render rather than per card: Next inlines it at build time, so
  // it cannot change while the page is open.
  const configured = inventoryApiUrl() !== null;

  // Eighteen hundred Cosmetics are filtered and sorted afresh on every keystroke
  // of the search, so the result is kept until one of its inputs moves.
  const visible = useMemo(
    () => visibleCosmetics(cosmetics, controls, inventory.ownedSlugs),
    [cosmetics, controls, inventory.ownedSlugs],
  );

  // What each notch of the price sliders is worth. The catalogue never changes
  // while the page is open, so the scale is built once and not once a keystroke.
  const scale = useMemo(() => priceScale(priceCeiling(cosmetics)), [cosmetics]);

  // What the viewer owns, by slug, so a card can show their own copy rather than
  // the Reference Price. Only built once there is an Inventory to build it from.
  const ownedBySlug = useMemo(
    () => new Map(inventory.owned.map((one) => [one.cosmetic.slug, one])),
    [inventory.owned],
  );

  // How many of their Cosmetics survived the other controls, so the Inventory
  // bar can say when a Class View or a search is hiding some of them.
  const shownOwned = inventory.ownedSlugs === null
    ? null
    : visible.filter((cosmetic) => ownedBySlug.has(cosmetic.slug)).length;

  return (
    // Side by side wherever there is room: the sidebar down the right, the grid
    // taking everything left over. The sidebar comes first in the source and is
    // drawn second, so a keyboard meets it before the eighteen hundred cards it
    // narrows. On a phone it is the bar above the grid it always was.
    <div className="flex w-full min-h-0 flex-1 flex-col px-3 pt-3 sm:px-4 lg:flex-row-reverse lg:gap-4 lg:pt-4">
      {/* `shrink-0`, because the grid beside it takes every pixel it is offered
          and a squeezed sidebar spills over the cards. As a column it scrolls
          on its own, so a short screen cannot cut the last toggle off with no
          way to reach it.

          In the sidebar it is one of the game's panels: a lifted board with an
          orange edge along its top, the way the backpack's own panels are
          framed. As a bar above the grid on a phone, it is a rule under the
          controls and nothing more, because a phone has no height to frame
          anything with. */}
      <div
        className={
          "mb-2 flex shrink-0 flex-col border-b border-line lg:mb-3" +
          " lg:w-72 lg:min-h-0 lg:gap-y-5 lg:overflow-y-auto lg:rounded-md lg:border lg:border-t-4 lg:border-line" +
          " lg:border-t-accent lg:bg-panel lg:p-4 lg:shadow-[0_8px_24px_-12px_#0000004d]"
        }
      >
        {masthead}
        <InventoryControls
          state={inventory}
          actions={inventoryActions}
          configured={configured}
          keyRate={keyRate}
          basis={basis}
          shownOwned={controls.onlyOwned ? shownOwned : null}
        />
        <BrowsingControlsPanel
          controls={controls}
          onChange={change}
          shown={visible.length}
          total={cosmetics.length}
          priceScale={scale}
          keyRate={keyRate}
          // The toggle has nothing to narrow until a backpack has been read, so
          // it is disabled rather than left to tick and change nothing — the
          // same rule the All-Class toggle follows outside a Class View.
          ownedOffered={configured && inventory.ownedSlugs !== null}
        />
      </div>
      {/* The Class View reaches the grid as well as the filter: it is what
          decides which Class each picture shows, so an All-Class Cosmetic in
          a Heavy's view is a Heavy wearing it. The Inventory reaches it for
          the other reason — a card of a Cosmetic the viewer owns shows what
          their copy is worth, not what the Cosmetic costs. */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CosmeticGrid
          cosmetics={visible}
          manifest={manifest}
          classView={viewedClass(controls.classFilter)}
          keyRate={keyRate}
          basis={basis}
          owned={ownedBySlug}
        />
      </main>
    </div>
  );
}
