/**
 * The catalogue, as one page. Everything it shows is read from the committed
 * catalogue while the page is being built; nothing is fetched afterwards, and no
 * rate on it comes from anywhere but the snapshot's own header.
 *
 * The Class View and the browsing controls are #13, and the Dollar Basis switch
 * and the credits footer are #14.
 */
import { loadCatalogue } from "@/catalogue/load";
import { CosmeticList } from "@/components/cosmetic-list";
import { formatDollars, formatMetalValue, steamMarketBasis } from "@/prices/format";

export default function CataloguePage() {
  const catalogue = loadCatalogue();
  const keyRate = catalogue.header.prices?.keyRate ?? null;
  const basis = steamMarketBasis(catalogue.header.dollarBases);

  return (
    <main className="mx-auto flex h-full max-w-5xl flex-col px-4 py-4 sm:px-6">
      <header className="pb-3">
        <h1 className="text-lg font-semibold sm:text-xl">TF2 Cosmetics Catalogue</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {catalogue.header.counts.cosmetics.toLocaleString("en-US")} Cosmetics
          {keyRate === null ? null : <> · a Key is {formatMetalValue(keyRate)}</>}
          {basis === null ? null : (
            <>
              {" "}
              and {formatDollars(basis.usdPerKey)} at the {basis.label}
            </>
          )}
        </p>
      </header>
      <CosmeticList cosmetics={catalogue.cosmetics} keyRate={keyRate} basis={basis} />
    </main>
  );
}
