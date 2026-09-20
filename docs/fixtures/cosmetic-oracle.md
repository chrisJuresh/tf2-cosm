# The shared Cosmetic oracle

Two jobs decide independently whether an item is a **Cosmetic**: the render job's resolve step
(`render/resolve.py`) and the catalogue data job. They must agree, or the site ends up with a
render for something that is not in the catalogue, or a Cosmetic with no picture.

The agreement is pinned by one fixture, used by both:

- `tests/fixtures/items_game_excerpt.txt` — a hand-written excerpt of the game's item
  definitions, with prefab inheritance, Styles and the awkward cases.
- `tests/fixtures/tf_english_excerpt.txt` — the English names for those items.

Both implementations resolve this fixture and must produce the verdicts in the table below.
A change to the Cosmetic rule changes this file and both test suites together.

## Verdicts

| defindex | English name | Verdict | Why |
| --- | --- | --- | --- |
| 101 | The Bolt Boy | Cosmetic (Class-Exclusive) | Wearable, head slot, one Class, one model |
| 102 | The Team Captain | Cosmetic (Multi-Class) | Soldier and Demoman; per-class basename, Demoman substitutes as `demo` |
| 103 | Ghastly Gibus | Cosmetic (All-Class) | No `used_by_classes`, so every Class wears it |
| 104 | Ghastly Gibus | Alias of 103 | Same English name and same models (ADR-0003) |
| 105 | Tin Pot | Cosmetic | No model at item level; each Style carries one |
| 106 | ESL Season 1 Gold Medal | Not a Cosmetic | Tournament Medal type |
| 107 | Ye Olde Baker Boy | Not a Cosmetic | `cannot trade` baked into the definition |
| 108 | Scrap Metal Hat Part | Not a Cosmetic | A wearable with no model to wear |
| 109 | The Dead of Night | Cosmetic | Misc slot, worn below the head, paintable |
| 110 | Scattergun | Not a Cosmetic | Not a wearable at all |

Display names drop a leading "The" (ADR-0003), so the catalogue names are `Bolt Boy`,
`Team Captain`, `Ghastly Gibus`, `Tin Pot` and `Dead of Night`, with slugs `bolt-boy`,
`team-captain`, `ghastly-gibus`, `tin-pot`, `dead-of-night`.

## What the render job additionally asserts

Identity and models are the render job's business, not the catalogue's, but they come from
the same fixture:

- 102 resolves to `models/player/items/soldier/soldier_officer.mdl` and
  `models/player/items/demo/demo_officer.mdl`.
- 103 renders under defindex 103 with aliases `[103, 104]`.
- 105 emits two jobs: Style 0 "Closed" and Style 1 "Open", the second hiding an extra
  class bodygroup and using skin families 2 and 3.
- A model the game archive lacks is an exclusion, never a job.
