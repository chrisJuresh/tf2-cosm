# Catalogue site

The static site: one page, one list, every Cosmetic with its picture — worn on a
class wherever a render exists, its Backpack Icon where one does not — its
Reference Price in Trader Notation and as a Metal Value, and what that comes to
in dollars.

## Running it

```bash
pnpm dev          # from the repo root: the site at http://localhost:3000
pnpm build-site   # from the repo root: static output in site/out
```

`pnpm build-site` writes a fully static export and runs no server at any point.
It reads the two files the other two jobs commit — `catalogue/catalogue.json` and
`catalogue/renders.json` — and validates each against its schema before rendering
a row of it. Either one violating its contract fails the build rather than
deploying a page of wrong numbers or missing pictures.

The site's only setting is where the images live (below). Every rate it quotes — the Key Rate,
and each of the three Dollar Bases a dollar figure can be computed from — comes
out of the catalogue header, so there is nowhere for a number on the page to have
come from but the snapshot. A rate's own date is shown alongside the snapshot's,
because they are not the same date: a price source's estimate can be weeks old by
the time a run picks it up.

## Where the pictures come from

A row shows the Cosmetic's **Worn Render** where the manifest has one and its
**Backpack Icon** where it does not (ADR-0001). The render is identified by four
things — the Cosmetic, the Class wearing it, the Team and the Style — and the
manifest holds only what has actually been rendered, so every lookup walks a
fallback chain: the render asked for, then that Class's default Style, then the
same on RED, then RED's default Style, then the icon. Style before Team, because
the wrong Style is a different hat and the wrong Team is the same hat in the
other colour. A render that fails to *load* falls back to the icon as well: the
manifest says an image was written, not that it is being served.

The images themselves are never committed. Only the manifest is, and every path
in it is relative to an image base that is configuration on both sides:

```bash
NEXT_PUBLIC_RENDER_BASE_URL=https://images.example.com/renders   # a bucket
```

Unset, the base is `/renders`, which the site serves itself. `pnpm dev` and
`pnpm build-site` both first run `scripts/link-renders.mjs`, which links the
repository's own `renders/` folder (or `RENDER_OUTPUT_ROOT`, if that is set) to
`site/public/renders` — so a local render run shows up on the page with nothing
to copy and nothing to keep in step. No renders yet just means every row shows
its icon, which is what production does for an unrendered Cosmetic too.

## Shape

- `src/app/page.tsx` — the page. A server component: it reads the catalogue and
  the render manifest at build time and hands both to the view.
- `src/components/catalogue-view.tsx` — the header, the Dollar Basis switch and
  the list. The active basis lives here because it is the one thing the header
  and every row have to agree on.
- `src/catalogue/load.ts`, `src/renders/load.ts` — the catalogue and the render
  manifest, imported as modules so both documents are baked into the static
  output, and validated before use.
- `src/renders/manifest.ts` — the manifest's contract in TypeScript. The render
  job is in Python, so this contract exists twice;
  `tests/test_site_render_manifest.py` at the repo root runs the site's fixture
  manifest back through that job's own validator, which is what holds the two
  together.
- `src/renders/select.ts` — the fallback chain, and which Class a row's picture
  shows. Pure, and driven directly by `tests/renders.test.ts`.
- `src/renders/base-url.ts` — the image base, and joining a manifest path onto
  it.
- `src/components/worn-render.tsx` — the picture itself: the chain, plus the
  runtime fall back to the icon when an image will not load.
- `src/components/render-controls.tsx` — the Style switcher and the Team toggle
  an open row gains. Each appears only where it has something to offer: a
  Cosmetic with one look has no Style to switch, and one rendered on RED alone
  has no BLU to toggle to.
- `src/prices/format.ts` — the pure price module: Trader Notation, the Metal
  Value, the Dollar Basis and the dollar figure. Components do no arithmetic of
  their own, and the tests drive this module directly. The Metal arithmetic
  underneath is the data job's `@tf2-cosm/data/prices/metal`, so a notation
  written here and one recorded in the catalogue come out of the same function.
  A Dollar Basis is picked out of the header rather than computed: the data job
  anchored all three rates to the snapshot's own Key Rate, and recomputing one
  here would be a second opinion on a settled number. A basis whose rate never
  arrived is not offered at all, rather than guessed at. The price source names
  itself in the header and nowhere in this code, so ADR-0002's swappable source
  stays swappable without an edit here.
- `src/components/cosmetic-list.tsx` — the list, a client component fed the
  Cosmetics it is to draw and nothing about why those are the ones. Its rows are
  virtualised, so eighteen hundred of them with a picture each scroll without the
  browser holding eighteen hundred rows. A phone has room for four columns across
  rather than five, so it carries the Metal Value on a second line under the
  Cosmetic's name instead of dropping it. A row opens in place, one at a time;
  because an open row is taller by an amount that depends on how its panel wraps,
  rows are measured rather than assumed and the fixed height is only the estimate
  the list starts from.
- `src/components/cosmetic-detail.tsx` — what an open row shows: the larger Worn
  Render with its two controls, the Price Spread, the Reference Variant the
  figure is for, when the source last repriced it, who can wear it, and the
  defindexes ADR-0003 folded into it. The chosen Style and Team live here, not in
  the list: closing a row is done looking, and the next one opens on its own
  default.
- `src/components/dollar-basis-switch.tsx` — the switch, as native radios so a
  keyboard walks it and a screen reader announces it without being told to. Each
  option carries its own rate, because that is the whole point of the choice.
- `src/components/site-footer.tsx` — the credits. Nothing on the page is the
  site's own.
- `src/catalogue/describe.ts` — the pure module that writes the catalogue's own
  tokens out in English: a Class, a Quality, an Unpriced reason, a date.
- `src/browser/remembered.ts` — a choice remembered in this browser and nowhere
  else. Every access is guarded, the page is right without it, and it is read
  after mount so the static markup React hydrates carries nobody's preference.
- `src/browsing/controls.ts` — the browsing rules, pure: the Class View's three
  inclusion rules, the toggles, the slot filter, the sorts and the name search,
  and the one function that turns the whole catalogue into the rows to draw. The
  controls are a surface over this file, not the place the rules live.
- `src/browser/remembered-controls.ts` — those controls as this browser remembers
  them, on the same terms as `remembered.ts` but for a whole document rather than
  one string, so every field is checked on the way back in. Everything but the
  search is kept: a Class, a sort and a set of toggles are where a viewer left the
  catalogue, and a half-typed name is not.
- `src/components/browsing-controls.tsx` — the control bar. Plain form controls
  with real labels, which is what makes them keyboard operable and properly
  announced without a line of code for either.
- `src/components/catalogue-browser.tsx` — where the rules and the bar meet: it
  holds what the viewer picked and hands the list what is left.

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
moment it lands. Its Cosmetics cover a price in Metal, a price in Keys, the
cheapest price there is, Styles, an Unpriced item and all three of
Class-Exclusive, Multi-Class and All-Class — which is what makes them an oracle
for the Class View rules as well as for the figures. The tests assert what a
viewer sees: the rows, their order, and the figures as they are written on
screen.

The pictures are driven from `tests/fixtures/renders.json`, a manifest the render
job itself wrote, covering every rung of the fallback chain — a Cosmetic on two
Classes, an All-Class Cosmetic rendered for three of its nine, a Style on one
Team and not the other, a BLU entry that is really the RED image, a master with
no web derivative yet, a Cosmetic whose render failed and one never attempted.
`tests/test_site_render_manifest.py` at the repo root reads that same file back
through the render job's own validator, so the fixture cannot drift into a
manifest that job would never write.

`tests/setup.ts` gives jsdom a fixed 1024×800 viewport, because a
virtualised list in a DOM that lays nothing out would decide nothing is visible
and render no rows, and an element a `scrollTo` to call, because jsdom implements
no scrolling at all.

`tests/page.test.tsx` is the exception: it renders the page against the committed
catalogue rather than the fixture, because the component suites drive the view
and the footer apart from each other and neither can see whether the page puts
them on the same screen.

jsdom applies no stylesheet, so nothing here can assert the responsive layout;
phone width is checked in a real browser.

## Two TypeScript versions in one repository

The data job is on TypeScript 7, the native compiler. Next.js drives the
TypeScript 5 compiler API for its own config loading and type checking and does
not run against 7, so this package pins `typescript@5`. Both are checked by
`pnpm typecheck` at the root.

## Not here yet

The end-to-end smoke test, the accessibility pass and the check that the build
refuses invalid input are #17.

The whole catalogue and the whole manifest are handed to the client as one
payload each, which is what makes the exported HTML large; trimming both to the
fields a row and its picture need is worth doing now that the tickets have
settled what those are.
