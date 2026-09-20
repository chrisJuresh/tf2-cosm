# A Cosmetic is identified by its English item name; defindexes are aliases

Valve's schema occasionally carries several defindexes for what is visibly one item, and backpack.tf prices one item name that lists every defindex it covers. Keying the catalogue by defindex would produce duplicate rows with identical prices, so a Cosmetic is identified by its English name, every defindex sharing that name is recorded as an alias, and the render uses the first alias whose model resolves in the game files.

## Consequences

- A URL-safe slug derived from the name is the stable public identifier; a later wishlist references that slug.
- If Valve renames an item the Cosmetic's identity changes. This is rare and is handled by a manual alias entry when it happens.
- Two genuinely different items with the same display name would collide; none are known today and the data job fails loudly if it finds one.
