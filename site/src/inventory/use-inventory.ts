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
 *
 * The profile is also written into the address bar (`@/inventory/profile-url`),
 * which is what makes a backpack something a viewer can send to somebody. The
 * two places a profile can come from are not the same thing and are not treated
 * as one: what the browser remembers is *this viewer's* profile, so it fills the
 * box and waits to be asked; what a link carries is somebody's profile the
 * viewer was sent, so it is looked up on arrival — that is what the link was for
 * — and is never remembered as theirs.
 */
import type { Cosmetic } from "@tf2-cosm/data/catalogue";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Inventory } from "@/inventory/copies";
import { fetchInventory, InventoryError, loadVariantPrices } from "@/inventory/load";
import { profileFromSearch, searchWithProfile } from "@/inventory/profile-url";
import {
  inventoryTotal,
  type InventoryTotal,
  ownedCosmetics,
  type OwnedCosmetic,
  ownedSlugs,
  withoutUntradable,
} from "@/inventory/owned";
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

/**
 * Puts the profile in the address bar, replacing rather than pushing: looking up
 * a backpack is what this page does, not somewhere else the viewer went, and a
 * back button that walked through every profile they tried would not take them
 * off the page they wanted to leave.
 */
function showInUrl(profile: string | null): void {
  try {
    const { location, history } = globalThis as unknown as { location?: Location; history?: History };
    if (location === undefined || history === undefined) return;
    history.replaceState(null, "", `${location.pathname}${searchWithProfile(location.search, profile)}${location.hash}`);
  } catch {
    // A browser that will not let the URL be rewritten costs the viewer a
    // shareable link and nothing else the page needs.
  }
}

/** The profile the link the viewer followed names, if it names one. */
function shared(): string | null {
  try {
    return profileFromSearch(globalThis.location?.search ?? "");
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
   * How many copies the untradable toggle is keeping out of everything above.
   * Zero when it is off. The page says the number rather than quietly showing a
   * smaller backpack than the one it read.
   */
  readonly hiddenUntradable: number;
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
  /**
   * Whether the viewer has asked for their untradable copies to be left out.
   * It is applied here rather than where the grid is narrowed, because what it
   * drops is copies: a Cosmetic the viewer owns no tradable copy of is one this
   * Inventory no longer holds, and every other control follows from that.
   */
  hideUntradable = false,
): readonly [InventoryState, InventoryActions] {
  const [profile, setProfile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [prices, setPrices] = useState<VariantPrices | null>(null);
  const request = useRef<AbortController | null>(null);

  const look = useCallback(
    /**
     * `mine` is whether this profile is the viewer's own — which is what the
     * box submits — or one they were sent in a link. Only their own is
     * remembered in this browser; a link is about somebody else, and coming
     * back to the page tomorrow should show the viewer their own backpack.
     */
    (asked: string, mine = true) => {
      const trimmed = asked.trim();
      if (trimmed === "") return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;

      setProfile(trimmed);
      if (mine) remember(trimmed);
      showInUrl(trimmed);
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

  // After mount, for the reason every stored preference is read after mount: the
  // static markup React hydrates was built with nobody's profile in it. A link
  // that names a profile is read in the same breath and wins, because following
  // one is a viewer asking for that backpack now, and it is looked up rather
  // than only filled in — otherwise the link is a box somebody else typed in.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    const sent = shared();
    if (sent === null) setProfile(recall());
    else look(sent, false);
  }, [look]);

  const clear = useCallback(() => {
    request.current?.abort();
    setProfile(null);
    remember(null);
    showInUrl(null);
    setInventory(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => () => request.current?.abort(), []);

  const held = useMemo(
    () => (inventory === null ? [] : ownedCosmetics(cosmetics, inventory.copies, prices)),
    [cosmetics, inventory, prices],
  );

  const owned = useMemo(() => (hideUntradable ? withoutUntradable(held) : held), [held, hideUntradable]);

  // Counted off everything they hold, not off what is left, so the number is
  // how many copies the toggle is hiding rather than how many survived it.
  const hiddenUntradable = useMemo(
    () => (hideUntradable ? inventoryTotal(held).untradable : 0),
    [held, hideUntradable],
  );

  const state: InventoryState = {
    profile,
    loading,
    error,
    inventory,
    owned,
    ownedSlugs: inventory === null ? null : ownedSlugs(owned),
    total: inventory === null ? null : inventoryTotal(owned),
    hiddenUntradable,
    priced: prices !== null,
  };
  return [state, { look, clear }] as const;
}
