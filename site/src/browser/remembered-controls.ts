"use client";

/**
 * The browsing controls, remembered in this browser — `remembered.ts` next door,
 * but for a whole document rather than one string.
 *
 * The terms are that file's: a per-viewer convenience that never leaves the
 * machine, guarded at every access because a private window, blocked site data
 * or cleared storage makes the accessor throw rather than answer nothing, and
 * read after mount because the static markup React hydrates was built with
 * nobody's preference in it.
 *
 * What a whole document adds is that it has to be checked on the way back in. A
 * stored control outlives the build that wrote it: a Class that was renamed or a
 * sort order that was dropped would come back as a control nothing on the page
 * can represent. Each field is read on its own, so one stale field costs its own
 * default and not the rest.
 */
import { COSMETIC_SLOTS, type CosmeticSlot } from "@tf2-cosm/data/catalogue";
import { useCallback, useEffect, useState } from "react";

import {
  CLASS_FILTERS,
  DEFAULT_CONTROLS,
  SORT_ORDERS,
  type BrowsingControls,
  type ClassFilter,
  type SortOrder,
} from "@/browsing/controls";

/**
 * Versioned in the key rather than in the document: when the shape changes past
 * what the field-by-field reading below can rescue, a new key starts everyone
 * from the defaults instead of leaving a half-understood document behind.
 */
export const CONTROLS_STORAGE_KEY = "tf2-cosm.controls.v1";

/**
 * Everything but the search. A Class, a sort and a set of toggles are where a
 * viewer left the catalogue; a half-typed name is not, and reopening the page
 * into a list narrowed to one item by a search nobody remembers typing reads as
 * a broken page.
 */
type RememberedControls = Omit<BrowsingControls, "search">;

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T | null): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function rememberedFrom(stored: Record<string, unknown>): RememberedControls {
  return {
    classFilter: oneOf<ClassFilter>(CLASS_FILTERS, stored["classFilter"], DEFAULT_CONTROLS.classFilter),
    hideAllClass: asBoolean(stored["hideAllClass"], DEFAULT_CONTROLS.hideAllClass),
    slot: oneOf<CosmeticSlot>(COSMETIC_SLOTS, stored["slot"], DEFAULT_CONTROLS.slot),
    hideUnpriced: asBoolean(stored["hideUnpriced"], DEFAULT_CONTROLS.hideUnpriced),
    onlyOwned: asBoolean(stored["onlyOwned"], DEFAULT_CONTROLS.onlyOwned),
    hideEventOnly: asBoolean(stored["hideEventOnly"], DEFAULT_CONTROLS.hideEventOnly),
    sort: oneOf<SortOrder>(SORT_ORDERS, stored["sort"], DEFAULT_CONTROLS.sort) ?? DEFAULT_CONTROLS.sort,
  };
}

/** What this browser remembers, or the defaults — never an error and never a throw. */
export function readControls(storage: Storage | null): BrowsingControls {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(CONTROLS_STORAGE_KEY) ?? null;
  } catch {
    return DEFAULT_CONTROLS;
  }
  if (raw === null) return DEFAULT_CONTROLS;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_CONTROLS;
  }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return DEFAULT_CONTROLS;

  return { ...DEFAULT_CONTROLS, ...rememberedFrom(stored as Record<string, unknown>) };
}

/** Remembers the controls, or quietly does not when the browser will not have it. */
export function writeControls(storage: Storage | null, controls: BrowsingControls): void {
  const { search: _search, ...remembered } = controls;
  try {
    storage?.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(remembered));
  } catch {
    // A full or blocked storage costs the viewer their settings next visit and
    // nothing else. There is nothing here worth interrupting them over.
  }
}

/** This browser's storage, or nothing at all — which is a state, not a failure. */
function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useRememberedControls(): readonly [BrowsingControls, (change: Partial<BrowsingControls>) => void] {
  const [state, setState] = useState<{ controls: BrowsingControls; restored: boolean }>({
    controls: DEFAULT_CONTROLS,
    restored: false,
  });

  useEffect(() => {
    setState({ controls: readControls(browserStorage()), restored: true });
  }, []);

  // Only the remembered fields are watched. The search is not one of them, and
  // waking this up on every keystroke to write the same bytes back is work for
  // nothing.
  const { classFilter, hideAllClass, slot, hideUnpriced, onlyOwned, hideEventOnly, sort } = state.controls;
  useEffect(() => {
    if (!state.restored) return;
    writeControls(browserStorage(), {
      ...DEFAULT_CONTROLS,
      classFilter,
      hideAllClass,
      slot,
      hideUnpriced,
      onlyOwned,
      hideEventOnly,
      sort,
    });
  }, [state.restored, classFilter, hideAllClass, slot, hideUnpriced, onlyOwned, hideEventOnly, sort]);

  const change = useCallback((patch: Partial<BrowsingControls>) => {
    setState((previous) => ({ ...previous, controls: { ...previous.controls, ...patch } }));
  }, []);

  return [state.controls, change] as const;
}
