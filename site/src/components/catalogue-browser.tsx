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
import { useMemo } from "react";

import { visibleCosmetics } from "@/browsing/controls";
import { useRememberedControls } from "@/browser/remembered-controls";
import { BrowsingControlsBar } from "@/components/browsing-controls";
import { CosmeticGrid } from "@/components/cosmetic-grid";
import { InventoryControls } from "@/components/inventory-controls";
import { inventoryApiUrl } from "@/inventory/load";
import { useInventory } from "@/inventory/use-inventory";
import type { DollarBasis } from "@/prices/format";
import type { RenderManifest } from "@/renders/manifest";

export interface CatalogueBrowserProps {
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

export function CatalogueBrowser({ cosmetics, manifest, keyRate, basis, snapshotTakenAt }: CatalogueBrowserProps) {
  const [controls, change] = useRememberedControls();
  const [inventory, inventoryActions] = useInventory(cosmetics, snapshotTakenAt);
  // Read once per render rather than per card: Next inlines it at build time, so
  // it cannot change while the page is open.
  const configured = inventoryApiUrl() !== null;

  // Eighteen hundred Cosmetics are filtered and sorted afresh on every keystroke
  // of the search, so the result is kept until one of its inputs moves.
  const visible = useMemo(
    () => visibleCosmetics(cosmetics, controls, inventory.ownedSlugs),
    [cosmetics, controls, inventory.ownedSlugs],
  );

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
    <>
      <InventoryControls
        state={inventory}
        actions={inventoryActions}
        configured={configured}
        keyRate={keyRate}
        basis={basis}
        shownOwned={controls.onlyOwned ? shownOwned : null}
      />
      <BrowsingControlsBar
        controls={controls}
        onChange={change}
        shown={visible.length}
        total={cosmetics.length}
        // The toggle has nothing to narrow until a backpack has been read, so it
        // is disabled rather than left to tick and change nothing — the same
        // rule the All-Class toggle follows outside a Class View.
        ownedOffered={configured && inventory.ownedSlugs !== null}
      />
      {/* The Class View reaches the grid as well as the filter: it is what
          decides which Class each picture shows, so an All-Class Cosmetic in a
          Heavy's view is a Heavy wearing it. The Inventory reaches it for the
          other reason — a card of a Cosmetic the viewer owns shows what their
          copy is worth, not what the Cosmetic costs. */}
      <CosmeticGrid
        cosmetics={visible}
        manifest={manifest}
        classView={controls.classView}
        keyRate={keyRate}
        basis={basis}
        owned={ownedBySlug}
      />
    </>
  );
}
