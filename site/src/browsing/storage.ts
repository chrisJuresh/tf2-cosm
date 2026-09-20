/**
 * The controls, remembered in this browser.
 *
 * This is a per-viewer convenience and nothing more: it never leaves the
 * machine, it is never read back by anything but this page, and the page has to
 * work perfectly without it. A private window, blocked site data or a viewer who
 * cleared their storage all arrive here as "nothing stored", which is the same
 * thing as a first visit — so every read that could throw is caught and answered
 * with the defaults rather than with an error.
 *
 * What is stored is validated field by field on the way back in. The stored
 * document outlives the build that wrote it: a Class that was renamed or a sort
 * order that was dropped would otherwise come back as a control nothing on the
 * page can represent, and one stale field is not a reason to throw away the
 * rest.
 */
import { CLASSES, COSMETIC_SLOTS, type ClassName, type CosmeticSlot } from "@tf2-cosm/data/catalogue";

import { DEFAULT_CONTROLS, SORT_ORDERS, type BrowsingControls, type SortOrder } from "./controls.ts";

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

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function rememberedFrom(document: Record<string, unknown>): RememberedControls {
  return {
    classView: oneOf<ClassName>(CLASSES, document["classView"], DEFAULT_CONTROLS.classView),
    hideAllClass: boolean(document["hideAllClass"], DEFAULT_CONTROLS.hideAllClass),
    slot: oneOf<CosmeticSlot>(COSMETIC_SLOTS, document["slot"], DEFAULT_CONTROLS.slot),
    hideUnpriced: boolean(document["hideUnpriced"], DEFAULT_CONTROLS.hideUnpriced),
    sort: oneOf<SortOrder>(SORT_ORDERS, document["sort"], DEFAULT_CONTROLS.sort) ?? DEFAULT_CONTROLS.sort,
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

  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch {
    return DEFAULT_CONTROLS;
  }
  if (typeof document !== "object" || document === null || Array.isArray(document)) return DEFAULT_CONTROLS;

  return { ...DEFAULT_CONTROLS, ...rememberedFrom(document as Record<string, unknown>) };
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
