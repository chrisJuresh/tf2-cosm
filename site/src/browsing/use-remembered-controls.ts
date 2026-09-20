"use client";

/**
 * The controls the page is being browsed with, remembered in this browser.
 *
 * The site is exported as static HTML, so the first paint is the same document
 * for everyone and cannot know what this browser remembers: the controls start
 * at their defaults and the remembered ones are read once the page is running.
 * Nothing is written back until that read has happened, or the first render
 * would overwrite what it was about to load.
 */
import { useCallback, useEffect, useState } from "react";

import { DEFAULT_CONTROLS, type BrowsingControls } from "./controls.ts";
import { readControls, writeControls } from "./storage.ts";

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

  useEffect(() => {
    if (!state.restored) return;
    writeControls(browserStorage(), state.controls);
  }, [state]);

  const change = useCallback((patch: Partial<BrowsingControls>) => {
    setState((previous) => ({ ...previous, controls: { ...previous.controls, ...patch } }));
  }, []);

  return [state.controls, change] as const;
}
