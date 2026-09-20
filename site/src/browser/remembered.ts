"use client";

/**
 * A choice remembered in this browser, and nowhere else.
 *
 * The site has no server and no account, so a preference is a per-viewer
 * convenience: it lives in local storage, it never leaves the machine, and the
 * page has to be right without it. Every access is guarded — a private window,
 * cleared site data or a blocked origin makes the accessor throw rather than
 * answer nothing — and a browser that refuses simply forgets between visits.
 *
 * The stored value is read after mount rather than while rendering. The page is
 * static: its markup is built once, at build time, with nobody's preference in
 * it, so reading storage during the first render would hand React markup that
 * does not match what it is hydrating.
 */
import { useEffect, useState } from "react";

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // A browser that will not remember is not an error worth showing anyone.
  }
}

/**
 * The remembered choice, null until it has been read back, and the way to
 * change it. What an unrecognised value means is the caller's business: a
 * choice outlives the data that offered it.
 */
export function useRememberedChoice(key: string): [string | null, (value: string) => void] {
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    setChosen(read(key));
  }, [key]);

  return [
    chosen,
    (value: string) => {
      setChosen(value);
      write(key, value);
    },
  ];
}
