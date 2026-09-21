# Catalogue site

The static site: one page, one grid, every Cosmetic a card with its picture —
worn on a class wherever a render exists, its Backpack Icon where one does not —
its Reference Price in Trader Notation and as a Metal Value, and what that comes
to in dollars.

The page is a grid rather than a list because of what the picture costs. A Worn
Render only says which hat this is at something like the size a hand holds it,
and at that size a row is a picture with two hundred pixels of figures beside it
and the rest of a desktop screen empty. The same card in a grid is thirty
Cosmetics on a screenful instead of five, with nothing smaller and nothing
dropped. Everything around the grid is laid out to leave it the space: the
header on one line, the browsing controls on one line, and the snapshot's dates
down in the credits with the rest of the provenance.

## Running it

```bash
pnpm dev          # from the repo root: the site at http://localhost:3000
pnpm build-site   # from the repo root: static output in site/out
```

`pnpm build-site` writes a fully static export and runs no server at any point.
It reads the two files the other two jobs commit — `catalogue/catalogue.json` and
`catalogue/renders.json` — and validates each against its schema before rendering
a card of it. Either one violating its contract fails the build rather than
deploying a page of wrong numbers or missing pictures.

Which folder those two come out of is configuration, and `catalogue/` is only
its default:

```bash
CATALOGUE_DIR=/somewhere/else    # the folder holding catalogue.json and renders.json
```

That exists for the end-to-end suite, which builds the whole site from the
fixture pair — a build driven by the committed snapshot could only ever prove
the page works for today's prices.

The site's other setting is where the images live (below). Every rate it quotes — the Key Rate,
and each of the three Dollar Bases a dollar figure can be computed from — comes
out of the catalogue header, so there is nowhere for a number on the page to have
come from but the snapshot. A rate's own date is shown alongside the snapshot's,
because they are not the same date: a price source's estimate can be weeks old by
the time a run picks it up.

## Where the pictures come from

A card shows the Cosmetic's **Worn Render** where the manifest has one and its
**Backpack Icon** where it does not (ADR-0001). The render is identified by five
things — the Cosmetic, the Class wearing it, the Team, the Style, and whether the
Class is in the picture at all — and the manifest holds only what has actually
been rendered, so every lookup walks a fallback chain: the render asked for, then
that Class's default Style, then the same on RED, then RED's default Style, then
the icon. Style before Team, because the wrong Style is a different hat and the
wrong Team is the same hat in the other colour. A render that fails to *load*
falls back to the icon as well: the manifest says an image was written, not that
it is being served.

The fifth thing does not fall back. An open Cosmetic has a **View** toggle
between its Worn Render and its **Item Render** — the same Cosmetic with no Class
in the picture — and where a viewer asks for the one on its own, the Worn Render
is not a near miss to show them instead: it is the Class they just took out. So
that walk ends at the icon, and the toggle is offered only where this Class has
an Item Render to switch to. Cards always show the Worn Render; the toggle is
this Cosmetic being looked at right now, and closing it is done looking.

The images themselves are never committed. Only the manifest is, and every path
in it is relative to an image base that is configuration on both sides:

```bash
NEXT_PUBLIC_RENDER_BASE_URL=https://images.example.com/renders   # a bucket
```

That bucket is filled by `python -m render.publish`, and the two settings have to
agree: the base is the bucket's public URL, and the manifest's paths hang off it
unchanged. A deployment with the base unset serves no images at all — every row
falls back to its Backpack Icon — which is why setting it is the last step of
`docs/render/publishing.md`. Next inlines `NEXT_PUBLIC_*` at build time, so a
deployment already built does not pick up a new value; redeploy.

Unset, the base is `/renders`, which the site serves itself. `pnpm dev` and
`pnpm build-site` both first run `scripts/link-renders.mjs`, which links the
repository's own `renders/` folder (or `RENDER_OUTPUT_ROOT`, if that is set) to
`site/public/renders` — so a local render run shows up on the page with nothing
to copy and nothing to keep in step. No renders yet just means every row shows
its icon, which is what production does for an unrendered Cosmetic too.

## Shape

- `src/app/page.tsx` — the page. A server component: it reads the catalogue and
  the render manifest at build time and hands both to the view.
- `src/components/catalogue-view.tsx` — the header, the Dollar Basis switch, the
  grid and the footer. The active basis lives here because it is the one thing
  the header, the footer and every card have to agree on: the header says which
  basis is in force, the footer when its rate was quoted, and every card's
  dollar figure is that rate applied.
- `src/catalogue/source.ts` — the one seam both documents are read through: which
  folder they come from, and the message a build gets when one of them is
  missing, is not JSON, or does not match its schema.
- `src/catalogue/load.ts`, `src/renders/load.ts` — the catalogue and the render
  manifest themselves, read while the page is being built, so both documents are
  baked into the static output, and validated before use.
- `src/renders/manifest.ts` — the manifest's contract in TypeScript. The render
  job is in Python, so this contract exists twice;
  `tests/test_site_render_manifest.py` at the repo root runs the site's fixture
  manifest back through that job's own validator, which is what holds the two
  together.
- `src/renders/select.ts` — the fallback chain, and which Class a card's picture
  shows. Pure, and driven directly by `tests/renders.test.ts`.
- `src/renders/base-url.ts` — the image base, and joining a manifest path onto
  it.
- `src/components/worn-render.tsx` — the picture itself: the chain, plus the
  runtime fall back to the icon when an image will not load.
- `src/components/render-controls.tsx` — the Style switcher and the Team toggle
  the open Cosmetic gains. Each appears only where it has something to offer: a
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
- `src/components/cosmetic-grid.tsx` — the grid, a client component fed the
  Cosmetics it is to draw and nothing about why those are the ones. How many
  cards it puts across is a measurement rather than a breakpoint: it fits as
  many cards of at least its minimum width into the width it is given as will
  go, which is two on a phone and eight or more on a wide monitor, without a
  media query. The rows of cards are virtualised, so eighteen hundred cards with
  a picture each scroll without the browser holding eighteen hundred of them.
  Each card carries the name of every figure on it for a screen reader, because
  a grid has nowhere to put the column heading a list could label all eighteen
  hundred with at once. A card opens as a modal over the page, one at a time,
  and the grid behind it does not move at all. The whole card is the control
  that opens it, by way of a pseudo-element stretched over it: a viewer aims at
  the picture, and a screen reader still hears the control called by the
  Cosmetic's name alone.
- `src/components/cosmetic-modal.tsx` — the open Cosmetic, over the page: a
  portal into `<body>` with the backdrop, the focus, the Tab trap and the ways
  out. `<dialog>` would give the first three for free in a browser, but jsdom
  implements neither `showModal` nor the top layer, so what a viewer does could
  not be driven by the suite. The space around the card is a control rather than
  a margin — clicking it closes the Cosmetic, as do Escape and the Close button,
  and each of the three puts the focus back on the card that opened it.
- `src/components/cosmetic-detail.tsx` — what the modal shows: the larger Worn
  Render with its two controls, the Price Spread, the Reference Variant the
  figure is for, when the source last repriced it, who can wear it, and the
  defindexes ADR-0003 folded into it. The modal is what gives the picture its
  room, so the picture takes the width it can get and the fields sit beside it.
  The chosen Style and Team live here, not in the grid: closing a Cosmetic is
  done looking, and the next one opens on its own default.
- `src/components/dollar-basis-switch.tsx` — the switch, as native radios so a
  keyboard walks it and a screen reader announces it without being told to. Each
  option carries its own rate, because that is the whole point of the choice.
- `src/components/site-footer.tsx` — the credits, and the snapshot's own dates
  beside them. Nothing on the page is the site's own, and how old the page is is
  provenance like the rest of it. Which rate's date is shown depends on the
  Dollar Basis in force, so the view hands it in.
- `src/catalogue/describe.ts` — the pure module that writes the catalogue's own
  tokens out in English: a Class, a Quality, an Unpriced reason, an event, a date.
- `src/browser/remembered.ts` — a choice remembered in this browser and nowhere
  else. Every access is guarded, the page is right without it, and it is read
  after mount so the static markup React hydrates carries nobody's preference.
- `src/browsing/controls.ts` — the browsing rules, pure: the Class View's three
  inclusion rules, the toggles, the slot filter, the sorts and the name search,
  and the one function that turns the whole catalogue into the cards to draw. The
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
  holds what the viewer picked and hands the grid what is left.

The open Cosmetic's slug is the URL hash, so a card can be linked to, and every
card carries its slug in `data-slug` — the hook the later wishlist and per-item
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
cheapest price there is, Styles, an Unpriced item, an Event-Only Cosmetic and all
three of Class-Exclusive, Multi-Class and All-Class — which is what makes them an oracle
for the Class View rules as well as for the figures. The tests assert what a
viewer sees: the cards, their order, and the figures as they are written on
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
virtualised grid in a DOM that lays nothing out would decide nothing is visible
and render no cards, and an element a `scrollTo` to call, because jsdom
implements no scrolling at all. jsdom measures every element as zero wide, so
the grid falls back to the column count it starts from rather than collapsing to
one; how many columns a real width buys is the end-to-end suite's to check.

`tests/page.test.tsx` is the exception: it renders the page against the committed
catalogue rather than the fixture, because the component suites drive the view
and the footer apart from each other and neither can see whether the page puts
them on the same screen.

jsdom applies no stylesheet and lays nothing out, so nothing here can assert the
responsive layout, how many cards go across, or the click target stretched over
a whole card — all three are checked in a real browser, below.

## End to end, in a real browser

```bash
pnpm test-e2e                    # from the repo root
pnpm --filter @tf2-cosm/site exec playwright install chromium   # once, per machine
```

`e2e/` is the suite that builds the site and drives it. It is slow and it is
small on purpose: every rule the page follows is already covered above, against
the same fixtures, and what a component test cannot see is whether the exported
HTML, the hydrated JavaScript, the stylesheet and the images add up to one
working page.

- `e2e/fixture-site.mjs` builds it. The subject is not the committed snapshot —
  eighteen hundred Cosmetics whose prices move every run, beside a manifest that
  is empty until somebody has rendered something locally — but the fixture pair
  the rest of the suite uses, put in a folder of its own and pointed at with
  `CATALOGUE_DIR`. The images the manifest names are 1×1 placeholders written
  there too: the manifest records that an image was produced and how big it is,
  and what is in the file is the render job's business.
- `e2e/serve.mjs` serves it: the export as plain files, with the placeholder
  renders mounted at `/renders`. Fifty lines rather than a dependency, and
  anything neither folder has is a 404, which the suite treats as a failure.
- `e2e/catalogue-page.ts` intercepts every request that would leave the machine.
  Valve's icon CDN is answered with a placeholder, because the fixture
  catalogue's icon URLs are made-up hashes and a suite that needs the internet
  fails for reasons that are nobody's fault. Anything else leaving the page is a
  fault in its own right — the site is meant to have no server, no analytics and
  no third party but that CDN — and this is the one place that can check it.
- `e2e/smoke.spec.ts` does what a viewer does: loads the page, filters to a
  Class, types a search, opens a Cosmetic and works its Style switcher and Team
  toggle. It also checks the three things only a laid-out page has: that the
  cards sit side by side rather than one to a line, that a click on the middle
  of a card — the picture, not the name — opens it, and that a click on the
  space around the modal closes it again. Every test also asserts the browser logged nothing and that
  every picture actually decoded.
- `e2e/accessibility.spec.ts` runs axe over the grid, over an open Cosmetic, and
  over both again in dark mode, and then asks the question axe cannot: whether
  the bar can be *worked* from the keyboard — every control named, reached by
  Tab, and visibly focused, and a Cosmetic that opens, closes and hands the
  focus back.
- `e2e/build-validation.spec.ts` runs `next build` against a broken catalogue and
  a broken manifest and reads what it printed. `tests/source.test.ts` says the
  loader throws; this says the build does.

Everything runs on a desktop and on an emulated phone, one worker at a time —
the builds are the expensive part, and the build-validation tests run one of
their own.

## Two TypeScript versions in one repository

The data job is on TypeScript 7, the native compiler. Next.js drives the
TypeScript 5 compiler API for its own config loading and type checking and does
not run against 7, so this package pins `typescript@5`. Both are checked by
`pnpm typecheck` at the root.

## Not here yet

The whole catalogue and the whole manifest are handed to the client as one
payload each, which is what makes the exported HTML large; trimming both to the
fields a card and its picture need is worth doing now that the tickets have
settled what those are.
