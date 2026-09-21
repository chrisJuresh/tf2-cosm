# The shared Cosmetic oracle

Two jobs decide independently whether an item is a **Cosmetic**: the render job's resolve step
(`render/resolve.py`) and the catalogue data job. They must agree, or the site ends up with a
render for something that is not in the catalogue, or a Cosmetic with no picture.

The agreement is pinned by one fixture, used by both:

- `tests/fixtures/items_game_excerpt.txt` — a hand-written excerpt of the game's item
  definitions, with prefab inheritance, Styles and the awkward cases.
- `tests/fixtures/tf_english_excerpt.txt` — the English names for those items.
- `tests/fixtures/slugs.json` — the slug each English name resolves to. See
  [The slug is the second agreement](#the-slug-is-the-second-agreement).

Both implementations resolve this fixture and must produce the verdicts in the table below.
A change to the Cosmetic rule changes this file and both test suites together:

```bash
./.venv/Scripts/python.exe -m pytest      # tests/test_resolve.py, tests/test_cosmetic_identity.py
pnpm test                                 # data/tests/build-catalogue.test.ts, data/tests/identity.test.ts
```

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
| 111 | The Scotsman's Stove Pipe | Cosmetic (Class-Exclusive) | Demoman; `drop_type` of `drop`, so Issued in Play |
| 112 | Crocodile Smile | Cosmetic (Class-Exclusive) | Sniper; no drop of its own, but a loot list hands it out; Event-Only |
| 113 | The Baronial Badge | Cosmetic (Class-Exclusive) | Engineer, misc slot; issued by neither route |

Display names drop a leading "The" (ADR-0003), so the catalogue names are `Bolt Boy`,
`Team Captain`, `Ghastly Gibus`, `Tin Pot`, `Dead of Night`, `Scotsman's Stove Pipe`,
`Crocodile Smile` and `Baronial Badge`, with slugs `bolt-boy`, `team-captain`,
`ghastly-gibus`, `tin-pot`, `dead-of-night`, `scotsmans-stove-pipe`, `crocodile-smile`
and `baronial-badge`.

## The slug is the second agreement

Agreeing on *which* items are Cosmetics is only half of it. The site reads the catalogue and
the render manifest as two separate documents and joins them on the slug
(`site/src/renders/select.ts`), so the two jobs also have to derive the same slug from the
same name — and until #66 they did not.

`data/src/catalogue/identity.ts` folded diacritics and spelt out `&` but treated the
apostrophe as a separator; `render/cosmetics.py` dropped the apostrophe but had no rule for
either of the others. Buckaroo's Hat was `buckaroo-s-hat` in the catalogue and
`buckaroos-hat` in the manifest; Brütal Bouffant was `brutal-bouffant` and
`br-tal-bouffant`. The join missed, and 282 of 1833 Cosmetics — every name with an
apostrophe or an accent — quietly fell back to their Backpack Icon on every Class (#66).

Nothing caught it, because each suite asserted its own spelling and the site's fixtures were
written to match the catalogue's. So the rule now lives in a fixture both suites read,
`tests/fixtures/slugs.json`, and both assert it: `tests/test_cosmetic_identity.py` and
`data/tests/identity.test.ts`. The two implementations still stand apart — one is Python and
one is TypeScript — but they can no longer drift silently.

The rule, in order: fold diacritics to ASCII, spell `&` as "and", **drop** apostrophes
(`'`, `‘`, `’`) rather than separate on them, replace every other run of non-alphanumerics
with a single hyphen, trim the hyphens off the ends. A name left with nothing is an error on
both sides, not an empty slug.

Dropping the apostrophe is the arbitrary half of that, and it went the way it did because
the render manifest and the bucket already held every image under `buckaroos-hat`. Going the
other way meant re-rendering and re-publishing 277 Cosmetics to change nothing anyone sees.

The last three are in the fixture for the price rules alone; the Cosmetic rule has nothing
to say about them beyond that they are Cosmetics. The file's `client_loot_lists` block is
there for the same reason, and the render job never reads it.

## What the catalogue additionally asserts

Identity and the fields the site reads are the catalogue's business:

- 103 is one Cosmetic with alias `[104]`; the catalogue's row carries defindex 103.
- 105 carries its Styles by English name, "Closed" and "Open"; 102, which has no Styles
  of its own, carries none.
- 109 is `paintable`, 101 is not.
- 112 is an Event-Only Cosmetic, bound to `halloween_or_fullmoon`; every other one in the
  fixture is bound to no event. The restriction is a field, not an exclusion: 112 is a
  Cosmetic, and both jobs still render and price it.
- Two items sharing an English name but not their models fail the run loudly (ADR-0003).

Prices are the catalogue's alone — the render job never sees them — and hang off the same
eight Cosmetics, from `data/tests/fixtures/backpack-tf-prices.json`:

| Cosmetic | Native Quality | Reference Variant | Why |
| --- | --- | --- | --- |
| Team Captain | Unique | Unique craftable, in Keys | The ordinary case, quoted in Keys |
| Bolt Boy | Unique | Unique craftable, in Metal | The ordinary case, quoted in Metal |
| Ghastly Gibus | Unique | Unique non-craftable | No craftable Unique is priced |
| Tin Pot | Genuine | Genuine craftable | A promo with no Unique at all; its Unusuals are never a Reference Variant |
| Dead of Night | Unique | none — Unpriced | The price list has no entry for it |
| Scotsman's Stove Pipe | Unique | Unique craftable, a Blanket Price | Issued in Play by dropping, so one craft hat is its real price although a Genuine copy is priced too |
| Crocodile Smile | Unique | Unique craftable, a Blanket Price | The same, reached by the loot list rather than by a drop |
| Baronial Badge | Unique, as the schema has it | Genuine craftable | Promo-Only: its blanket Unique price is an artefact and is passed over (ADR-0004) |

The fixture also pins how a price entry finds its Cosmetic. The entry for Bolt Boy is
named `Bolt-Boy`, which is not the catalogue's name for it, and is joined by its defindex;
the entry for the Team Captain claims no defindex at all and is joined by its name; the
Ghastly Gibus entry claims both 103 and 104, so either half of the alias pair finds it.

## What the render job additionally asserts

Identity and models are the render job's business, not the catalogue's, but they come from
the same fixture:

- 102 resolves to `models/player/items/soldier/soldier_officer.mdl` and
  `models/player/items/demo/demo_officer.mdl`.
- 103 renders under defindex 103 with aliases `[103, 104]`.
- 105 emits two jobs: Style 0 "Closed" and Style 1 "Open", the second hiding an extra
  class bodygroup and using skin families 2 and 3.
- A model the game archive lacks is an exclusion, never a job.
