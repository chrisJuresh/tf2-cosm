/**
 * What the browser remembers between visits, and what it does with anything it
 * finds there that it does not recognise.
 */
import { afterEach, describe, expect, it } from "vitest";

import { CONTROLS_STORAGE_KEY, readControls, writeControls } from "@/browser/remembered-controls";
import { DEFAULT_CONTROLS } from "@/browsing/controls";

afterEach(() => {
  localStorage.clear();
});

/** Whatever is sitting under the key, as it was written. */
function stored(): unknown {
  const raw = localStorage.getItem(CONTROLS_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe("reading the remembered controls", () => {
  it("gives the defaults when the browser has never been here", () => {
    expect(readControls(localStorage)).toEqual(DEFAULT_CONTROLS);
  });

  it("gives back the Class, sort, filters and toggles that were written", () => {
    const controls = {
      ...DEFAULT_CONTROLS,
      classView: "demoman",
      hideAllClass: true,
      slot: "misc",
      hideUnpriced: true,
      hideEventOnly: false,
      sort: "name",
    } as const;
    writeControls(localStorage, controls);
    expect(readControls(localStorage)).toEqual(controls);
  });

  it("returns to the defaults once the storage is cleared", () => {
    writeControls(localStorage, { ...DEFAULT_CONTROLS, classView: "medic", hideUnpriced: true });
    localStorage.clear();
    expect(readControls(localStorage)).toEqual(DEFAULT_CONTROLS);
  });

  it("keeps the Event-Only toggle on for a browser that was here before it existed", () => {
    // The document from an older build carries no such field. Read field by
    // field, an absent one costs its own default and not the rest — and the
    // default is the one a viewer who has never seen the toggle should get.
    localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify({ classView: "medic", sort: "name" }));
    expect(readControls(localStorage)).toEqual({
      ...DEFAULT_CONTROLS,
      classView: "medic",
      sort: "name",
      hideEventOnly: true,
    });
  });

  it("does not remember the search: a visit starts on the whole list, not mid-word", () => {
    writeControls(localStorage, { ...DEFAULT_CONTROLS, search: "gibus" });
    expect(readControls(localStorage).search).toBe("");
    expect(JSON.stringify(stored())).not.toContain("gibus");
  });
});

describe("storage holding something it should not", () => {
  it("falls back to the defaults on text that is not JSON at all", () => {
    localStorage.setItem(CONTROLS_STORAGE_KEY, "{not json");
    expect(readControls(localStorage)).toEqual(DEFAULT_CONTROLS);
  });

  it("falls back to the defaults on JSON that is not an object", () => {
    localStorage.setItem(CONTROLS_STORAGE_KEY, "[1,2,3]");
    expect(readControls(localStorage)).toEqual(DEFAULT_CONTROLS);
  });

  it("keeps the fields it recognises and defaults the ones it does not", () => {
    // A Class that no longer exists, a sort order from an older build, and a
    // toggle that was written as a string: one bad field is not a reason to
    // throw away a good one.
    localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({ classView: "civilian", sort: "price", hideUnpriced: "yes", slot: "head" }),
    );
    expect(readControls(localStorage)).toEqual({ ...DEFAULT_CONTROLS, slot: "head" });
  });

  it("treats a missing storage as an empty one rather than failing", () => {
    // Private windows and blocked site data both turn up as no storage at all.
    expect(readControls(null)).toEqual(DEFAULT_CONTROLS);
    expect(() => writeControls(null, DEFAULT_CONTROLS)).not.toThrow();
  });
});
