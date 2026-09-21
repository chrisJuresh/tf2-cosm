# TF2 Cosmetics Catalogue

A personal reference site listing every Team Fortress 2 cosmetic, shown worn on a class, with its trade price in dollars and in TF2 currency.

## Language

### Items

**Cosmetic**:
A Team Fortress 2 item that occupies a head or misc equip slot, has a model worn on the Class, and can in at least some copies be traded. Taunts, action items, tools, weapons, Medals and never-tradable items are not Cosmetics.
_Avoid_: hat (when meaning any cosmetic), wearable, item

**Medal**:
A tournament or community award that sits in a misc slot but is never tradable. Medals are not Cosmetics and are not in the catalogue.

**Team**:
One of the two sides a Class can play on, RED or BLU. Most Cosmetics have a different look per Team.

**Class**:
One of the nine playable Team Fortress 2 characters: Scout, Soldier, Pyro, Demoman, Heavy, Engineer, Medic, Sniper, Spy.

**All-Class Cosmetic**:
A Cosmetic wearable by all nine Classes.
_Avoid_: universal, multi-class (which means something narrower)

**Multi-Class Cosmetic**:
A Cosmetic wearable by more than one Class but not all nine.

**Class-Exclusive Cosmetic**:
A Cosmetic wearable by exactly one Class.

**Style**:
A named alternate appearance of a Cosmetic, chosen in-game, that changes its model or texture but not its price. Every Cosmetic has a default Style; some have more.
_Avoid_: variant (which we use for Quality)

**Quality**:
The grade stamped on a specific copy of an item: Unique, Strange, Genuine, Vintage, Haunted, Unusual, and a few others. The same Cosmetic exists in several Qualities and each is priced separately.

**Native Quality**:
The Quality a Cosmetic is issued in when it first enters the game. Unique for most, Genuine for many promotional items, Haunted for some Halloween items.

**Issued in Play**:
A Cosmetic the game itself hands out: it drops, or a crate or case can contain it. One that is not was only ever given away, so no Unique copy of it exists.

**Promo-Only Cosmetic**:
A Cosmetic that is not Issued in Play and that a price source prices in Genuine — the Quality Valve stamps on a promotional copy and on nothing else. Its only copies are the ones Valve gave away.
_Avoid_: promo item (which also covers promos that later dropped)

**Event-Only Cosmetic**:
A Cosmetic the game only lets a player wear while a particular event is running: Halloween or a full moon, Christmas, or the game's birthday. It is a Cosmetic like any other and is priced and catalogued like one; the catalogue records which event it is bound to, and the site hides the lot by default.
_Avoid_: Halloween item (most of those are wearable year round), seasonal

**Reference Variant**:
The single Quality and craftability combination whose price stands for the Cosmetic in the catalogue. Unique craftable if it exists, else Unique non-craftable, else the Native Quality. A Blanket Price is not offered to this rule for a Promo-Only Cosmetic (ADR-0004).

**Reference Price**:
The price of a Cosmetic's Reference Variant.

**Price Spread**:
The low and high figures a price source reports for a variant. The catalogue shows the Reference Variant's spread and its midpoint.

**Variant Price**:
The Price Spread of one Quality-and-craftability pair, as against the Reference Price, which is the Price Spread of the Reference Variant alone. A Cosmetic has a Variant Price for every Quality the price source listed it in, and they live in a document of their own (ADR-0005) because what a viewer's own copy is worth is a different question from what the Cosmetic costs. Never Unusual: a price source prices an Unusual by effect, so there is no one figure for the Cosmetic.
_Avoid_: quality price (Quality alone does not identify one; craftability is half of it)

**Unpriced**:
A Cosmetic whose Reference Variant has no listed price at the price source. Unpriced Cosmetics stay in the catalogue.

### Currency

**Key**:
A Mann Co. Supply Crate Key, the high-denomination unit of TF2 trade currency.

**Metal**:
The low-denomination trade currency, in three coins: Refined, Reclaimed and Scrap. One Refined is three Reclaimed; one Reclaimed is three Scrap.
_Avoid_: ref/rec/scrap as separate currencies (they are one currency in three coins)

**Key Rate**:
How much Metal one Key trades for, expressed in Refined. It floats over time.

**Blanket Currency**:
A currency a price source quotes a whole class of items in by default, rather than pricing each of them. backpack.tf marks one: the Random Craft Hat, worth about one Refined and a third, which stands for every cheap hat in the game.

**Blanket Price**:
A price quoted in a Blanket Currency. It is an order of magnitude rather than a quote, and the catalogue records which prices are one.

**Trader Notation**:
The community way of writing a price as Keys plus fractional Refined, for example "2 keys, 1.33 ref". Fractions of Refined are always ninths.

**Metal Value**:
A price expressed wholly in Refined by converting Keys at the Key Rate. The catalogue's sort order.

**Dollar Basis**:
The key-to-dollar rate a dollar price is computed from. One is active at a time. The catalogue carries three: the Steam Community Market's key price (which publishes two figures, its lowest asking price and its median sale), the price source's own refined-to-dollar estimate, and the Mann Co. Store constant. Each is recorded both per Key and per Refined, converted at the snapshot's Key Rate.

### Catalogue

**Class View**:
The catalogue filtered to one Class: its Class-Exclusive Cosmetics, the Multi-Class Cosmetics it can wear, and, unless hidden, every All-Class Cosmetic.

**Slug**:
The URL-safe identifier derived from a Cosmetic's name, and its stable public name: it addresses a row in the page and names it in the URL, and a later wishlist references it (ADR-0003).

**Alias**:
One of the other defindexes Valve's schema carries under a Cosmetic's name, folded into the single Cosmetic that name identifies (ADR-0003). The catalogue records them; the site shows them so the merge is visible rather than silent.

### Inventory

**Inventory**:
A viewer's own Team Fortress 2 backpack, as Steam reports it: app 440, context 2. It is the one thing the site cannot read from a committed file, because it is live, personal and different for every viewer, so it is read through the inventory proxy (ADR-0006). Only a backpack its owner has made public can be read at all.
_Avoid_: backpack (in code; it is what players say and what Steam's own URLs do not)

**Owned Copy**:
One kind of item in an Inventory, and how many of it the viewer has: a defindex, a Quality, a craftability and whether it can be traded. A viewer may own several Owned Copies of one Cosmetic, each in a different Quality and each worth a different Variant Price. An Owned Copy that matches no Cosmetic in the catalogue is not a Cosmetic — which is how weapons, taunts, tools, crates and Medals are left out, without a second rule deciding it.

### Images

**Worn Render**:
A static image of one Class on one Team wearing one Cosmetic in one Style, framed on the Cosmetic's own extent on that Class — as tight as the item is, within reason, with a little of the wearer around it. An All-Class Cosmetic has up to nine per Style per Team.
_Avoid_: icon, thumbnail, preview

**Item Render**:
A static image of one Cosmetic on its own, with no Class wearing it, framed on the item's own bounds. It is the same scene as the Worn Render beside it with the Class hidden, so it is still made per Class: the model a Class wears is its own. The site shows one or the other, and a viewer switches between them.
_Avoid_: backpack render, isolated render

**Backpack Icon**:
The flat inventory picture of an item on its own, published by Valve. Neither a Worn Render nor an Item Render — it is Valve's flat artwork, not ours — and shown only when we have no render at all.
