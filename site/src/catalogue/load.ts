/**
 * The committed catalogue, read once at build time and checked before anything
 * is rendered from it.
 *
 * A static export has no server to read a file at request time, and ADR-0002
 * says the site never calls an API, so whatever is read here is baked into the
 * exported page and nothing is fetched afterwards. Which folder it is read from
 * is `@/catalogue/source`; a catalogue that does not match the schema throws
 * there, which fails `next build` — a broken data run cannot deploy.
 */
import { assertValidCatalogue, type Catalogue } from "@tf2-cosm/data/catalogue";

import { loadDocument } from "@/catalogue/source";

/** What the catalogue is called inside the data folder. */
export const CATALOGUE_FILE = "catalogue.json";

export function loadCatalogue(): Catalogue {
  return loadDocument(CATALOGUE_FILE, assertValidCatalogue);
}
