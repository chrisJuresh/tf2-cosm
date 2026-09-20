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

/** items_game writes booleans as "1"/"0". */
export function isSet(item: ItemDefinition | undefined, key: string): boolean {
  return scalar(item, key) === "1";
}

function mergeInto(target: Mutable, source: ItemDefinition): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const existing = target[key];
    if (typeof value === "object" && typeof existing === "object") {
      const merged: Mutable = { ...(existing as Record<string, ItemDefinitionValue>) };
      mergeInto(merged, value);
      target[key] = merged;
    } else {
      target[key] = typeof value === "object" ? { ...value } : value;
    }
  }
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
  const resolved: Mutable = {};
  for (const name of (scalar(item, "prefab") ?? "").split(/\s+/).filter(Boolean)) {
    const prefab = prefabs[name];
    // A prefab cycle would only come from a corrupt payload, but it must not hang the job.
    if (prefab && !seen.has(name)) {
      mergeInto(resolved, resolvePrefabs(prefab, prefabs, new Set(seen).add(name)));
    }
  }
  mergeInto(resolved, item);
  return resolved;
}
