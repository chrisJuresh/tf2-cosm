/**
 * The inventory proxy's contract, on the reading side (ADR-0006).
 *
 * The Worker in `worker/` turns Steam's inventory payload into Owned Copies and
 * answers with CORS. This is that answer declared again here, for the reason
 * `renders/manifest.ts` declares the render manifest again and
 * `prices/variant-prices.ts` declares its document again: a payload that arrives
 * over the network at runtime is not one the build could have checked, and a
 * page that trusted it would fail somewhere further in and less clearly.
 *
 * `tests/inventory.test.ts` reads the Worker's own fixture through this schema,
 * which is what holds the two sides together.
 */
import { z } from "zod";

const ownedCopySchema = z.object({
  defindex: z.number().int().positive(),
  /** The catalogue's Quality vocabulary; the Worker translates Steam's names. */
  quality: z.string().min(1),
  craftable: z.boolean(),
  tradable: z.boolean(),
  /** The Unusual effect's name, where there is one. A few Unusuals have none. */
  effect: z.string().min(1).optional(),
  count: z.number().int().positive(),
});

export const inventorySchema = z.object({
  steamId: z.string().min(1),
  takenAt: z.string().min(1),
  copies: z.array(ownedCopySchema),
  counts: z.object({
    items: z.number().int().nonnegative(),
    copies: z.number().int().nonnegative(),
    unreadable: z.number().int().nonnegative(),
  }),
});

/** What the Worker says when it could not read a backpack, and why. */
export const inventoryFailureSchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1),
});

export type OwnedCopy = z.infer<typeof ownedCopySchema>;
export type Inventory = z.infer<typeof inventorySchema>;
