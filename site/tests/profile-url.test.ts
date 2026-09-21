/**
 * The profile in the query string, driven directly: what a link names, and what
 * a link becomes when the viewer looks somebody up.
 */
import { describe, expect, it } from "vitest";

import { profileFromSearch, searchWithProfile } from "@/inventory/profile-url";

describe("what a link names", () => {
  it("reads the profile out of a query string", () => {
    expect(profileFromSearch("?profile=robinwalker")).toBe("robinwalker");
    expect(profileFromSearch("profile=robinwalker")).toBe("robinwalker");
  });

  it("names nobody when there is nothing there to name", () => {
    expect(profileFromSearch("")).toBeNull();
    expect(profileFromSearch("?basis=usd")).toBeNull();
    // A value trimmed out of the link is nobody, not a lookup of nobody.
    expect(profileFromSearch("?profile=")).toBeNull();
    expect(profileFromSearch("?profile=%20%20")).toBeNull();
  });

  it("gives back a pasted profile URL as it was pasted", () => {
    const pasted = "https://steamcommunity.com/id/robinwalker/";
    expect(profileFromSearch(`?profile=${encodeURIComponent(pasted)}`)).toBe(pasted);
  });
});

describe("what a link becomes", () => {
  it("puts the profile in an empty query string", () => {
    expect(searchWithProfile("", "robinwalker")).toBe("?profile=robinwalker");
  });

  it("replaces the profile already there rather than adding a second", () => {
    expect(searchWithProfile("?profile=robinwalker", "gaben")).toBe("?profile=gaben");
  });

  it("leaves every other parameter alone, because the profile is not the only thing a link may carry", () => {
    expect(searchWithProfile("?basis=usd", "robinwalker")).toBe("?basis=usd&profile=robinwalker");
    expect(searchWithProfile("?basis=usd&profile=robinwalker", null)).toBe("?basis=usd");
  });

  it("takes the profile back out, leaving no empty question mark behind", () => {
    expect(searchWithProfile("?profile=robinwalker", null)).toBe("");
    expect(searchWithProfile("?profile=robinwalker", "  ")).toBe("");
  });

  it("round-trips a pasted profile URL", () => {
    const pasted = "https://steamcommunity.com/id/robinwalker/";
    expect(profileFromSearch(searchWithProfile("", pasted))).toBe(pasted);
  });
});
