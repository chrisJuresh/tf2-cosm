/**
 * The catalogue, as one page. Everything it shows is read from the two committed
 * files while the page is being built — the catalogue and the Worn Render
 * manifest — and nothing is fetched afterwards; no rate on it comes from
 * anywhere but the snapshot's own header, and no picture from anywhere but the
 * manifest or Valve's icon CDN.
 */
import { loadCatalogue } from "@/catalogue/load";
import { CatalogueView } from "@/components/catalogue-view";
import { loadRenderManifest } from "@/renders/load";

export default function CataloguePage() {
  return <CatalogueView catalogue={loadCatalogue()} manifest={loadRenderManifest()} />;
}
