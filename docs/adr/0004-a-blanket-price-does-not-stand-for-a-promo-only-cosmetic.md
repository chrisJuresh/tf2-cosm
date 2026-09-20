# A Blanket Price does not stand as the Reference Price of a Promo-Only Cosmetic

backpack.tf marks the Random Craft Hat as a blanket currency (`"blanket": 1` in `IGetCurrencies`): the figure it quotes there is one it lays over every cheap hat rather than one it observed for any single item. 131 Cosmetics come back priced at one Craft Hat as a Unique craftable copy, and for most of them that is the plainest true thing anyone can say. For a promotional Cosmetic that the game never handed out, there is no Unique copy for the blanket to price at all, and the catalogue was quoting about 1.33 ref for items whose only copies trade for ten or twenty times that.

A Blanket Price is therefore passed over by the Reference Variant rule for a **Promo-Only Cosmetic**, and taken as usual for every other Cosmetic. A Cosmetic is Promo-Only when both of these hold:

- **the source prices a Genuine copy of it.** Genuine is the Quality Valve stamps on a promotional copy and on nothing else, so this is the only evidence within reach that the Cosmetic was ever issued in a Quality other than Unique. Valve's own schema does not say: `GetSchemaItems` reports quality 6 for every cosmetic and never once reports Genuine, and `items_game.txt` never sets `item_quality` to Genuine either.
- **the game does not issue it in play** — it carries no `drop_type` of `drop` and appears in no loot list or collection in `items_game.txt`. Many promos were later made to drop or put in a case, and for those a craft hat is what a Unique copy really costs.

Every Reference Price the catalogue records now says whether it is a Blanket Price, and the site writes one with a `≈` in front of it rather than as a quote. A blanket figure that lost to a Genuine price is not recorded at all: the catalogue carries the Reference Price and nothing else.

## How this was measured

Every figure below comes from a full run against the live price list and the local game install, and the run's own output is in the repository: `catalogue/catalogue.json` is that snapshot, its header says `blanketPriced: 118`, and the 13 Cosmetics that changed are the ones whose Reference Variant moves off `unique-craftable` in this commit's diff of that file. `pnpm build-catalogue --dry-run` reprints the counts against whatever the price list says today; the number that matters is `Blanket Prices`, which should move only when the price list does.

## Why not something broader

Demoting every Blanket Price that has any other price beside it was tried against the live list first and is wrong: 52 of the 131 are ordinary case or crate Cosmetics with real Unique copies, and `items_game.txt` does not carry the loot lists of the older crates, so "not in a loot list" on its own does not mean "never issued". Under the broad rule 27 of them fell through to a Strange price and 28 to a non-craftable Unique one — a Strange copy's price quoted as the Cosmetic's, which is a worse error than the one being fixed. Requiring a Genuine price as well keeps the rule to the case it was built for.

## Consequences

- Of the 131, 118 keep their Blanket Price and 13 no longer take one, measured against the live list on 2026-09-20. Nine land on their Genuine price — the Baronial Badge at 6.11 ref rather than 1.33, the Bolgan Family Crest at 21.66 — and four on a real non-craftable Unique price, because the rule still prefers a Unique copy that exists: the Dread Knot, the Geisha Boy, the Wingstick and the Hitt Mann Badge, the last of them at 192 ref, which is what a non-craftable Unique copy of it actually trades for.
- The seven that carry a Genuine price and are issued in play keep the craft-hat figure: the Scotsman's Stove Pipe, the Backbiter's Billycock, the Company Man, the Dead Cone, the Hetman's Headpiece, the Killer Exclusive and the Marxman. #23 named the Backbiter's Billycock among the mispriced; it is not one. It is a 2009 hat that drops and is in a loot list, and one craft hat is what a Unique copy of it is worth.
- No Cosmetic goes Unpriced for want of a Blanket Price. Where a blanket figure is all anyone quotes, it still stands: an order of magnitude beats nothing. There is one edge, inherited rather than introduced: a Promo-Only Cosmetic whose Genuine price is quoted in a currency the snapshot cannot convert is Unpriced, where before it would have shown the blanket figure. That is the rule the job already follows — it never drops to a lesser Quality to avoid saying nothing — and it applies to no Cosmetic in the list today.
- The data job now reads `client_loot_lists` and `item_collections` out of `items_game.txt`, which nothing read before. The render job's Cosmetic rule does not, and the shared oracle is unaffected by it.
- The catalogue is schema v4: `price.blanket` on every priced Cosmetic and `header.prices.counts.blanketPriced` on the snapshot.
- The signal is only as good as what the game files carry. A promo that Valve later puts in a case whose loot list stays server-side would be demoted wrongly, and would show its Genuine price. That is visible in the run's `Blanket Prices` count, which should move only when the price list does.
