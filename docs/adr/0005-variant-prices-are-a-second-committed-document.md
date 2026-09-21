# Variant Prices are a second committed document, not a field on the Cosmetic

The catalogue records one price per Cosmetic, its Reference Price. Showing a viewer what
the copies in their own backpack are worth needs the other prices too — a Genuine copy is
worth the Genuine figure, not the Reference Price — and the price source already hands the
data job every Quality-and-craftability pair it prices, which the build has until now
discarded.

Keeping them is a field on the Cosmetic or a file of its own. It is a file of its own:
`catalogue/variant-prices.json`, keyed by the catalogue's slug, with its own JSON Schema,
written by the same run from the same price list at the same Key Rate.

There are a little over two Variant Prices for every Cosmetic — about four thousand small
records against the catalogue's eighteen hundred large ones. Written into `catalogue.json`
they add around forty percent to a document the site hands the browser whole, so every
viewer would pay on every visit for a feature most of them will never open. Kept apart, the
page's payload does not move and the document is fetched by the viewer who asks for it and
by nobody else. `renders.json` is already this pattern: a second committed document under
`catalogue/`, read through the same seam and validated against its own schema before use.

A Variant Price is written leaner than a Reference Price: three scrap counts rather than the
catalogue's `PricePoint`s. `refined` and `notation` are that scrap count put through
`scrapToRefined` and `traderNotation`, which every reader already has; the catalogue carries
them precomputed because every row on the page shows one, and a Variant Price is read one at
a time. That is the difference between a document of a megabyte and one of four.

## Consequences

- A reader holding both documents can tell whether they came from one run: the Variant
  Prices repeat the catalogue's `snapshotTakenAt` and its Key Rate. Nothing yet enforces
  that they agree — the site should refuse a mismatched pair the way it refuses a document
  that violates its schema.
- Both are written by one command, under one write guard. A run refused for losing Cosmetics
  writes neither, so the committed pair is never half of one snapshot and half of another. A
  run with no price source writes neither the prices nor this file, and leaves the committed
  one alone rather than replacing it with an empty document.
- This does not reopen ADR-0002. Where prices come from, and that they are a committed
  snapshot rather than a live call, is unchanged; this is the same snapshot written in two
  files instead of one.
- Unusual is absent from the document entirely. A price source prices an Unusual by effect,
  one figure per hat-and-effect pair, so there is no single Unusual figure for a Cosmetic and
  none is invented. A reader meeting an Unusual copy knows from its Quality alone that it is
  priced by its effect.
- A Cosmetic the source never listed, or listed only in Unusual, is absent from `bySlug`
  rather than present and empty. That is not the same as being Unpriced, which the catalogue
  is still the place to look for.
