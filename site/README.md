# Catalogue site

The static site: one page, one list, every Cosmetic with its Backpack Icon, its
Reference Price in Trader Notation and as a Metal Value, and what that comes to
in dollars.

## Running it

```bash
pnpm dev          # from the repo root: the site at http://localhost:3000
pnpm build-site   # from the repo root: static output in site/out
```

`pnpm build-site` writes a fully static export and runs no server at any point.
It reads `catalogue/catalogue.json`, the file the data job commits, and validates
it against the catalogue schema before rendering a row of it — a catalogue that
violates the schema fails the build rather than deploying.

The site has no configuration of its own. Every rate it quotes — the Key Rate,
and the Steam Community Market's key price the dollar figures are computed from —
comes out of the catalogue header, so there is nowhere for a number on the page
to have come from but the snapshot.

## Shape

- `src/app/page.tsx` — the page. A server component: it reads the catalogue at
  build time, picks the Dollar Basis out of its header, and hands both to the
  list.
- `src/catalogue/load.ts` — the catalogue, imported as a module so the whole
  document is baked into the static output, and validated before use.
- `src/prices/format.ts` — the pure price module: Trader Notation, the Metal
  Value, the Dollar Basis and the dollar figure. Components do no arithmetic of
  their own, and the tests drive this module directly. The Metal arithmetic
  underneath is the data job's `@tf2-cosm/data/prices/metal`, so a notation
  written here and one recorded in the catalogue come out of the same function.
  The Dollar Basis is picked out of the header rather than computed: the data job
  anchored all three rates to the snapshot's own Key Rate, and recomputing one
  here would be a second opinion on a settled number.
- `src/components/cosmetic-list.tsx` — the list, a client component fed the whole
  catalogue. Its rows are virtualised, so eighteen hundred of them with a picture
  each scroll without the browser holding eighteen hundred rows. A phone has room
  for four columns across rather than five, so it carries the Metal Value on a
  second line under the Cosmetic's name instead of dropping it. A row opens in
  place, one at a time; because an open row is taller by an amount that depends
  on how its panel wraps, rows are measured rather than assumed and the fixed
  height is only the estimate the list starts from.
- `src/components/cosmetic-detail.tsx` — what an open row shows: the Price
  Spread, the Reference Variant the figure is for, when the source last repriced
  it, who can wear it, and the defindexes ADR-0003 folded into it.
- `src/catalogue/describe.ts` — the pure module that writes the catalogue's own
  tokens out in English: a Class, a Quality, an Unpriced reason, a date.

The open Cosmetic's slug is the URL hash, so a row can be linked to, and every
row carries its slug in `data-slug` — the hook the later wishlist and per-item
pages hang off (ADR-0003).

Styling is Tailwind utilities. Light and dark both follow the system colour
scheme; there is no switch and nothing is stored.

## Tests

```bash
pnpm test        # from the repo root: this package and the data job
pnpm typecheck
```

Component tests are driven from `data/tests/golden/catalogue.json` — the document
the data job builds from the shared Cosmetic oracle, read where it lives rather
than copied here, so a change to the catalogue's shape reaches these tests the
moment it lands. Its five Cosmetics cover a price in Metal, a price in Keys, the
cheapest price there is, Styles and an Unpriced item. The tests assert what a
viewer sees: the rows, their order, and the figures as they are written on
screen. `tests/setup.ts` gives jsdom a fixed 1024×800 viewport, because a
virtualised list in a DOM that lays nothing out would decide nothing is visible
and render no rows, and an element a `scrollTo` to call, because jsdom implements
no scrolling at all.

jsdom applies no stylesheet, so nothing here can assert the responsive layout;
phone width is checked in a real browser.

## Two TypeScript versions in one repository

The data job is on TypeScript 7, the native compiler. Next.js drives the
TypeScript 5 compiler API for its own config loading and type checking and does
not run against 7, so this package pins `typescript@5`. Both are checked by
`pnpm typecheck` at the root.

## Not here yet

The Class View, filters, sort, search and remembered controls are #13; the Dollar
Basis switch, the header rates and the credits footer are #14; Worn Renders in
place of Backpack Icons, and the Style switcher and Team toggle inside the open
row, are #16.
The whole catalogue is handed to the client as one payload, which is what makes
the exported HTML large; trimming it to the fields a row needs is worth doing
once those tickets have settled what a row needs.
