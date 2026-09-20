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

| environment variable | what it does |
| --- | --- |
| `STEAM_MARKET_KEY_PRICE_USD` | what a Key sells for on the Steam Community Market, the Dollar Basis every dollar figure on the page is computed from. Defaults to `2.49`. The catalogue header carries a rate per Dollar Basis from #11, and #14 switches between them; until then it is set here |

## Shape

- `src/app/page.tsx` — the page. A server component: it reads the catalogue at
  build time, works out the Dollar Basis, and hands both to the list.
- `src/catalogue/load.ts` — the catalogue, imported as a module so the whole
  document is baked into the static output, and validated before use.
- `src/prices/format.ts` — the pure price module: Trader Notation, the Metal
  Value, the Dollar Basis and the dollar figure. Components do no arithmetic of
  their own, and the tests drive this module directly. The Metal arithmetic
  underneath is the data job's `@tf2-cosm/data/prices/metal`, so a notation
  written here and one recorded in the catalogue come out of the same function.
- `src/components/cosmetic-list.tsx` — the list, a client component fed the whole
  catalogue. Its rows are virtualised, so eighteen hundred of them with a picture
  each scroll without the browser holding eighteen hundred rows.

Styling is Tailwind utilities. Light and dark both follow the system colour
scheme; there is no switch and nothing is stored.

## Tests

```bash
pnpm test        # from the repo root: this package and the data job
pnpm typecheck
```

`tests/fixtures/catalogue.json` is the site's own copy of the document the data
job builds from the shared Cosmetic oracle — five Cosmetics covering a price in
Metal, a price in Keys, the cheapest price there is, Styles and an Unpriced item.
Component tests render the list from it and assert what a viewer sees: the rows,
their order, and the figures as they are written on screen. `tests/setup.ts`
gives jsdom a fixed 1024×800 viewport, because a virtualised list in a DOM that
lays nothing out would decide nothing is visible and render no rows.

## Two TypeScript versions in one repository

The data job is on TypeScript 7, the native compiler. Next.js drives the
TypeScript 5 compiler API for its own config loading and type checking and does
not run against 7, so this package pins `typescript@5`. Both are checked by
`pnpm typecheck` at the root.

## Not here yet

The Class View, filters, sort, search and remembered controls are #13; the Dollar
Basis switch, the header rates and the credits footer are #14; the expandable row
with the Price Spread is #15; Worn Renders in place of Backpack Icons are #16.
The whole catalogue is handed to the client as one payload, which is what makes
the exported HTML large; trimming it to the fields a row needs is worth doing
once those tickets have settled what a row needs.
