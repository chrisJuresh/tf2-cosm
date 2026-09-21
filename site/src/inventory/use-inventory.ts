"use client";

/**
 * The Inventory the page is looking at: asking for one, what came back, and what
 * happened while it was being asked for.
 *
 * What is remembered and what is not is the whole design of this file. The
 * profile a viewer typed is remembered on the terms `@/browser/remembered.ts`
 * sets — a per-viewer convenience, guarded at every access, the page right
 * without it — so somebody coming back does not type their own profile again.
 * The Owned Copies are not remembered. They are a person's possessions, they go
 * stale the moment they trade, and a backpack read three weeks ago shown as
 * today's is worse than no backpack at all. They are fetched afresh, which is
 * cheap: the proxy caches, so a returning viewer costs Steam nothing.
 */
import type { Cosmetic } from "@tf2-cosm/data/catalogue";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Inventory } from "@/inventory/copies";
import { fetchInventory, InventoryError, loadVariantPrices } from "@/inventory/load";
import { inventoryTotal, type InventoryTotal, ownedCosmetics, type OwnedCosmetic, ownedSlugs } from "@/inventory/owned";
import type { VariantPrices } from "@/prices/variant-prices";

export const PROFILE_STORAGE_KEY = "tf2-cosm.steam-profile.v1";

function remember(value: string | null): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(PROFILE_STORAGE_KEY);
    else globalThis.localStorage?.setItem(PROFILE_STORAGE_KEY, value);
  } catch {
    // A browser that will not remember costs the viewer one retyping.
  }
}

function recall(): string | null {
  try {
    return globalThis.localStorage?.getItem(PROFILE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export interface InventoryState {
  /** The profile last looked up, remembered between visits. Null when none. */
  readonly profile: string | null;
  readonly loading: boolean;
  /** A sentence for the viewer, or null. Never a stack trace. */
  readonly error: string | null;
  readonly inventory: Inventory | null;
  /** The Cosmetics the viewer owns, priced as the copies they own. */
  readonly owned: readonly OwnedCosmetic[];
  /** Which slugs those are, which is what narrows the grid. Null before a read. */
  readonly ownedSlugs: ReadonlySet<string> | null;
  readonly total: InventoryTotal | null;
  /**
   * Whether the copies could be priced at all. False when the Variant Prices did
   * not load, which leaves the Inventory perfectly usable as a filter and
   * without figures — and says so rather than showing everything as worthless.
   */
  readonly priced: boolean;
}

export interface InventoryActions {
  readonly look: (asked: string) => void;
  readonly clear: () => void;
}

/**
 * Reads a viewer's backpack and prices it against the catalogue.
 *
 * Only one request is ever in flight: a viewer who types a second profile before
 * the first has answered gets the second, and the first is aborted rather than
 * left to land afterwards and overwrite it.
 */
export function useInventory(
  cosmetics: readonly Cosmetic[],
  snapshotTakenAt: string,
): readonly [InventoryState, InventoryActions] {
  const [profile, setProfile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [prices, setPrices] = useState<VariantPrices | null>(null);
  const request = useRef<AbortController | null>(null);

  // After mount, for the reason every stored preference is read after mount: the
  // static markup React hydrates was built with nobody's profile in it.
  useEffect(() => setProfile(recall()), []);

  const look = useCallback(
    (asked: string) => {
      const trimmed = asked.trim();
      if (trimmed === "") return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;

      setProfile(trimmed);
      remember(trimmed);
      setLoading(true);
      setError(null);

      // The Variant Prices are fetched alongside rather than first. A backpack
      // that reads but cannot be priced is still worth showing — it is the
      // filter the viewer asked for — so the two failures are kept apart.
      void loadVariantPrices(snapshotTakenAt).then(setPrices, () => setPrices(null));

      void fetchInventory(trimmed, controller.signal).then(
        (read) => {
          if (controller.signal.aborted) return;
          setInventory(read);
          setLoading(false);
        },
        (failure: unknown) => {
          if (controller.signal.aborted) return;
          setInventory(null);
          setError(failure instanceof InventoryError ? failure.message : "Could not read that backpack.");
          setLoading(false);
        },
      );
    },
    [snapshotTakenAt],
  );

  const clear = useCallback(() => {
    request.current?.abort();
    setProfile(null);
    remember(null);
    setInventory(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => () => request.current?.abort(), []);

  const owned = useMemo(
    () => (inventory === null ? [] : ownedCosmetics(cosmetics, inventory.copies, prices)),
    [cosmetics, inventory, prices],
  );

  const state: InventoryState = {
    profile,
    loading,
    error,
    inventory,
    owned,
    ownedSlugs: inventory === null ? null : ownedSlugs(owned),
    total: inventory === null ? null : inventoryTotal(owned),
    priced: prices !== null,
  };
  return [state, { look, clear }] as const;
}
