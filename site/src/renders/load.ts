/**
 * The committed Worn Render manifest, read once at build time and checked
 * before anything is rendered from it — the same bargain `@/catalogue/load`
 * makes with the catalogue, out of the same folder, and for the same reason. A
 * manifest that does not match its contract throws, which fails `next build`: a
 * broken render run cannot deploy a page full of holes.
 *
 * The images themselves are never committed (ADR-0001); only this file is. A
 * manifest with nothing in it is a perfectly valid one — it is what the render
 * job writes before it has rendered anything — and the site then shows every
 * Cosmetic's Backpack Icon.
 */
import { loadDocument } from "@/catalogue/source";
import { assertValidRenderManifest, type RenderManifest } from "@/renders/manifest";

/** What the manifest is called inside the data folder. */
export const RENDER_MANIFEST_FILE = "renders.json";

export function loadRenderManifest(): RenderManifest {
  return loadDocument(RENDER_MANIFEST_FILE, assertValidRenderManifest);
}
