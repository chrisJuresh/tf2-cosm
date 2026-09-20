/**
 * The shape of one item definition in items_game, and the prefab inheritance the
 * engine applies before anything reads it.
 *
 * Values arrive from the VDF parser as strings; nested blocks are plain objects.
 */

export type ItemDefinitionValue = string | ItemDefinition;

export interface ItemDefinition {
  readonly [key: string]: ItemDefinitionValue | undefined;
}

export interface ItemsGameDocument {
  readonly prefabs: Readonly<Record<string, ItemDefinition>>;
  readonly items: Readonly<Record<string, ItemDefinition>>;
}

type Mutable = Record<string, ItemDefinitionValue>;

/** A nested block, or undefined when the key is absent or holds a scalar. */
export function block(item: ItemDefinition | undefined, key: string): ItemDefinition | undefined {
  const value = item?.[key];
  return typeof value === "object" ? value : undefined;
}

/** A scalar, or undefined when the key is absent or holds a block. */
export function scalar(item: ItemDefinition | undefined, key: string): string | undefined {
  const value = item?.[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * The later block laid over the earlier one: blocks merge key by key, scalars
 * replace. Prefab inheritance and duplicate keys in the file both need this.
 */
export function mergeBlocks(earlier: ItemDefinition, later: ItemDefinition): ItemDefinition {
  const merged: Mutable = { ...(earlier as Record<string, ItemDefinitionValue>) };
  for (const [key, value] of Object.entries(later)) {
    if (value === undefined) continue;
    const existing = merged[key];
    merged[key] =
      typeof value === "object" && typeof existing === "object" ? mergeBlocks(existing, value) : value;
  }
  return merged;
}

/**
 * Apply the item's prefab chain the way the engine does: the space-separated
 * prefab list left to right, each prefab's own prefabs first, then the item's
 * own keys on top. Blocks merge key by key; scalars are replaced.
 */
export function resolvePrefabs(
  item: ItemDefinition,
  prefabs: Readonly<Record<string, ItemDefinition>>,
  seen: ReadonlySet<string> = new Set(),
): ItemDefinition {
  let resolved: ItemDefinition = {};
  for (const name of (scalar(item, "prefab") ?? "").split(/\s+/).filter(Boolean)) {
    const prefab = prefabs[name];
    // A prefab cycle would only come from a corrupt payload, but it must not hang the job.
    if (prefab && !seen.has(name)) {
      resolved = mergeBlocks(resolved, resolvePrefabs(prefab, prefabs, new Set(seen).add(name)));
    }
  }
  return mergeBlocks(resolved, item);
}
