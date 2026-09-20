/**
 * The catalogue, as one page. Everything it shows is read from the committed
 * catalogue while the page is being built; nothing is fetched afterwards, and no
 * rate on it comes from anywhere but the snapshot's own header.
 *
 * The Class View and the browsing controls are #13, and the expandable row is
 * #15.
 */
import { loadCatalogue } from "@/catalogue/load";
import { CatalogueView } from "@/components/catalogue-view";
import { SiteFooter } from "@/components/site-footer";

export default function CataloguePage() {
  return (
    <>
      <CatalogueView catalogue={loadCatalogue()} />
      <SiteFooter />
    </>
  );
}
