/**
 * The Cosmetic rule, applied to a prefab-resolved item definition.
 *
 * This is the same rule the render job's resolve step applies (`render/cosmetics.py`):
 * wearable item class, head or misc slot, not a tournament or community medal,
 * no baked never-tradable attribute, and at least one Class resolves to a worn
 * model at item level or in a Style. `docs/fixtures/cosmetic-oracle.md` is the
 * shared oracle both implementations are tested against.
 */
import { block, type ItemDefinition, scalar } from "./item-definition.ts";

export const CLASSES = [
  "scout",
  "soldier",
  "pyro",
  "demoman",
  "heavy",
  "engineer",
  "medic",
  "sniper",
  "spy",
] as const;

export type ClassName = (typeof CLASSES)[number];

export const COSMETIC_SLOTS = ["head", "misc"] as const;

export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

const MEDAL_TYPES = new Set(["#TF_Wearable_TournamentMedal", "#TF_Wearable_CommunityMedal"]);

/** Why an item that is nearly a Cosmetic was left out. */
export type ExclusionReason = "not-wearable" | "medal" | "never-tradable" | "no-model";

/** One Style as items_game defines it, before its name is localised. */
export interface StyleDefinition {
  readonly index: number;
  /** The name as items_game carries it — a localisation token for most Styles. */
  readonly nameToken: string | undefined;
  readonly definition: ItemDefinition;
}

/** The engine substitutes the class name into model basenames, except Demoman -> "demo". */
export function modelClassToken(className: ClassName): string {
  return className === "demoman" ? "demo" : className;
}

export function cosmeticSlotOf(item: ItemDefinition): CosmeticSlot | undefined {
  const slot = scalar(item, "item_slot");
  return COSMETIC_SLOTS.find((candidate) => candidate === slot);
}

/** The Classes that can wear the item. An item that names none is wearable by all nine. */
export function classesFor(item: ItemDefinition): ClassName[] {
  const usedBy = block(item, "used_by_classes");
  if (!usedBy) return [...CLASSES];
  const named = new Set(Object.keys(usedBy).map((key) => key.toLowerCase()));
  return CLASSES.filter((className) => named.has(className));
}

/** Every copy is untradable: the "cannot trade" attribute is baked into the definition. */
export function isNeverTradable(item: ItemDefinition): boolean {
  for (const blockName of ["attributes", "static_attrs"] as const) {
    const attributes = block(item, blockName);
    if (!attributes) continue;
    for (const [name, value] of Object.entries(attributes)) {
      if (name.toLowerCase() !== "cannot trade") continue;
      const raw = typeof value === "object" ? scalar(value, "value") : value;
      if (raw === "1") return true;
    }
  }
  return false;
}

export function stylesOf(item: ItemDefinition): StyleDefinition[] {
  const styles = block(item, "visuals")?.["styles"];
  if (typeof styles !== "object") return [];
  return Object.entries(styles)
    .flatMap(([key, definition]) => {
      const index = Number.parseInt(key, 10);
      if (!Number.isInteger(index) || typeof definition !== "object") return [];
      return [{ index, nameToken: scalar(definition, "name"), definition }];
    })
    .sort((left, right) => left.index - right.index);
}

/**
 * The worn model for one Class from a block carrying model_player /
 * model_player_per_class. An empty path is no model: a few definitions blank the
 * key out to cancel one they inherited from a prefab.
 */
export function modelFor(source: ItemDefinition, className: ClassName): string | undefined {
  const perClass = block(source, "model_player_per_class");
  if (perClass) {
    const lowered = new Map(Object.entries(perClass).map(([key, value]) => [key.toLowerCase(), value]));
    const explicit = lowered.get(className);
    if (typeof explicit === "string") return explicit || undefined;
    const basename = lowered.get("basename");
    if (typeof basename === "string" && basename !== "") {
      return basename.replaceAll("%s", modelClassToken(className));
    }
  }
  return scalar(source, "model_player") || undefined;
}

/**
 * Craft components and tokens share the wearable item class but have nothing to
 * wear; a Cosmetic has a model for at least one of its Classes, at item level or
 * in one of its Styles.
 */
function hasWornModel(item: ItemDefinition, classes: readonly ClassName[]): boolean {
  return wornModels(item, classes).length > 0;
}

/** Every worn model the item resolves to, at item level and in its Styles, sorted. */
export function wornModels(item: ItemDefinition, classes: readonly ClassName[]): string[] {
  const sources = [item, ...stylesOf(item).map((style) => style.definition)];
  const paths = new Set<string>();
  for (const source of sources) {
    for (const className of classes) {
      const path = modelFor(source, className);
      if (path !== undefined) paths.add(path.toLowerCase());
    }
  }
  return [...paths].sort();
}

/** The reason this item is not a Cosmetic, or undefined when it is one. */
export function exclusionReason(item: ItemDefinition): ExclusionReason | undefined {
  if (scalar(item, "item_class") !== "tf_wearable" || cosmeticSlotOf(item) === undefined) return "not-wearable";
  if (MEDAL_TYPES.has(scalar(item, "item_type_name") ?? "")) return "medal";
  if (isNeverTradable(item)) return "never-tradable";
  if (!hasWornModel(item, classesFor(item))) return "no-model";
  return undefined;
}
