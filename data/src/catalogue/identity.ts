/**
 * Cosmetic identity: the English display name and the URL-safe slug derived from
 * it (ADR-0003). The leading "The" is stripped because traders and the price
 * sources leave it off, so names match across them and sort sensibly.
 */

/** The English name as the catalogue records it. */
export function displayName(englishName: string): string {
  const trimmed = englishName.trim();
  return /^the\s+/i.test(trimmed) ? trimmed.replace(/^the\s+/i, "") : trimmed;
}

const DIACRITICS = /\p{Diacritic}/gu;
const NOT_SLUG = /[^a-z0-9]+/g;

/** Lowercase, ASCII, hyphen-separated. Stable: it is the public identifier. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replaceAll(DIACRITICS, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(NOT_SLUG, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") throw new Error(`name "${name}" has no slug-able characters`);
  return slug;
}
