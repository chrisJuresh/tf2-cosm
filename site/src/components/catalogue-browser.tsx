"use client";

/**
 * The catalogue, browsed: the controls and the list they narrow, and the one
 * place the two meet.
 *
 * The whole catalogue arrives once as a prop and never changes. What a viewer
 * picks lives here — and only here — so the list below stays a component that
 * draws the Cosmetics it is handed and knows nothing about why those are the
 * ones it got.
 */
import type { Cosmetic, Metal } from "@tf2-cosm/data/catalogue";
import { useMemo } from "react";

import { visibleCosmetics } from "@/browsing/controls";
import { useRememberedControls } from "@/browser/remembered-controls";
import { BrowsingControlsBar } from "@/components/browsing-controls";
import { CosmeticList } from "@/components/cosmetic-list";
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
}

export function CatalogueBrowser({ cosmetics, manifest, keyRate, basis }: CatalogueBrowserProps) {
  const [controls, change] = useRememberedControls();
  // Eighteen hundred Cosmetics are filtered and sorted afresh on every keystroke
  // of the search, so the result is kept until one of its two inputs moves.
  const visible = useMemo(() => visibleCosmetics(cosmetics, controls), [cosmetics, controls]);

  return (
    <>
      <BrowsingControlsBar
        controls={controls}
        onChange={change}
        shown={visible.length}
        total={cosmetics.length}
      />
      {/* The Class View reaches the list as well as the filter: it is what
          decides which Class each picture shows, so an All-Class Cosmetic in a
          Heavy's view is a Heavy wearing it. */}
      <CosmeticList
        cosmetics={visible}
        manifest={manifest}
        classView={controls.classView}
        keyRate={keyRate}
        basis={basis}
      />
    </>
  );
}
