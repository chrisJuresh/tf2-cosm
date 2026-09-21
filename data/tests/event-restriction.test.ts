import { describe, expect, it } from "vitest";

import { eventRestrictionOf } from "../src/catalogue/event-restriction.ts";
import { resolvePrefabs } from "../src/catalogue/item-definition.ts";

describe("the event a Cosmetic is bound to", () => {
  it("is null for an item the game lets a player wear any day", () => {
    expect(eventRestrictionOf({ name: "Team Captain" })).toBeNull();
  });

  it("is the game's own token, so a new event needs no change here", () => {
    expect(eventRestrictionOf({ holiday_restriction: "halloween_or_fullmoon" })).toBe("halloween_or_fullmoon");
    expect(eventRestrictionOf({ holiday_restriction: "christmas" })).toBe("christmas");
    expect(eventRestrictionOf({ holiday_restriction: "a_holiday_valve_has_not_invented_yet" })).toBe(
      "a_holiday_valve_has_not_invented_yet",
    );
  });

  it("comes in by prefab, which is how nearly every restricted item carries it", () => {
    const prefabs = { halloween_hat: { holiday_restriction: "halloween_or_fullmoon" } };
    const item = resolvePrefabs({ name: "Spooky Hat", prefab: "halloween_hat" }, prefabs);
    expect(eventRestrictionOf(item)).toBe("halloween_or_fullmoon");
  });

  it("reads an empty value as no restriction rather than as an unnamed event", () => {
    expect(eventRestrictionOf({ holiday_restriction: "" })).toBeNull();
  });
});
