import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only registers its own cleanup when vitest runs with globals,
// which this suite does not; without this every test would read the DOM the test
// before it left behind.
afterEach(cleanup);

/**
 * jsdom lays nothing out: every element measures zero, so a virtualised list
 * asked how tall its viewport is would answer "nothing" and render no rows at
 * all. These stubs give the test DOM one fixed viewport — a wide screen, 1024 by
 * 800 — which is the only thing the list needs to know to decide what a viewer
 * can see.
 */
const VIEWPORT = { width: 1024, height: 800 };

Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: VIEWPORT.width });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: VIEWPORT.height });

Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
  return {
    ...VIEWPORT,
    top: 0,
    left: 0,
    right: VIEWPORT.width,
    bottom: VIEWPORT.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
};

globalThis.ResizeObserver ??= class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

/**
 * jsdom implements no scrolling at all, so an element has no `scrollTo` for the
 * list to call when a link asks it to bring a row into view. A browser has one;
 * without this stub the call is silently skipped and a test could not tell a
 * list that scrolls from one that does not.
 */
Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, writable: true, value: () => {} });
