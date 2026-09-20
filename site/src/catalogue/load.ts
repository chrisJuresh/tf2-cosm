/**
 * The committed catalogue, read once at build time and checked before anything
 * is rendered from it.
 *
 * It is a plain module import rather than a file read so that the whole document
 * is baked into the static output: there is no server to read a file at request
 * time, and ADR-0002 says the site never calls an API. A catalogue that does not
 * match the schema throws here, which fails `next build` — a broken data run
 * cannot deploy.
 */
import { assertValidCatalogue, type Catalogue } from "@tf2-cosm/data/catalogue";

import document from "../../../catalogue/catalogue.json";

export function loadCatalogue(): Catalogue {
  return assertValidCatalogue(document);
}
