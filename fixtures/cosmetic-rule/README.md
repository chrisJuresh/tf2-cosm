# The shared Cosmetic-rule oracle

Two implementations decide which items are Cosmetics: the catalogue data job
(`data/`, TypeScript) and the render job's resolve step (`render/resolve.py`,
Python). They must agree. This directory is the fixture both are tested against.

- `items_game.txt` — a trimmed excerpt of the game's own item definitions, in the
  game's own format, so either language can read it. Prefabs are included as far
  as the kept items' chains reach.
- `expected-cosmetics.json` — the Cosmetics the rule keeps, and the near-misses it
  drops with the reason for each.

## What each item is here to prove

| defindex | item | proves |
| --- | --- | --- |
| 94 | Texas Ten Gallon | a Class-Exclusive paintable hat |
| 116 | Ghastlierest Gibus | an All-Class hat whose model comes from a per-class basename |
| 125 | Cheater's Lament | a never-tradable item is not a Cosmetic |
| 378 | Team Captain | a Multi-Class hat |
| 496 | GWJ Winners medal | a tournament Medal is not a Cosmetic |
| 814 + 835 | Triad Trinket | a promo pair: two defindexes, one Cosmetic (ADR-0003) |
| 844 | Tin Pot | an item whose only model lives inside its Styles |
| 5606 | Barely-Melted Capacitor | a craft component wearing the wearable item class, with no model |

`expected-cosmetics.json` records names in English. The data job takes them from
Valve's Web API; the resolve step takes them from the install's `tf_english.txt`.
Both strip a leading "The" per ADR-0003.

## The rule

Wearable item class, head or misc slot, not a tournament or community Medal, no
`cannot trade` attribute baked into the definition, and at least one Class
resolving to a worn model — at item level or in any Style. Prefab inheritance is
applied first, the way the engine does it: the space-separated prefab list left
to right, then the item's own keys on top.

## Counts against the real game files

The resolve step counts Cosmetic **defindexes** (1,841 on 2026-09-20). The
catalogue counts **Cosmetics**, which merges the eight names that carry two
defindexes each, so it reports 1,833. `pnpm build-catalogue` prints both and
compares them.
