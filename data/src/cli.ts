/**
 * `pnpm build-catalogue` — the one command that builds the catalogue.
 *
 * Fetches the source payloads, hands them to the pure builder, validates the
 * result against the catalogue schema, holds it against the committed file and
 * writes it. Every decision worth testing lives under `src/`; this file is the
 * fetching, the printing and the writing.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalogue } from "./catalogue/build.ts";
import {
  CATALOGUE_SCHEMA_VERSION,
  catalogueJsonSchema,
  type DollarBases,
  type DollarRate,
} from "./catalogue/schema.ts";
import {
  type CommittedCatalogue,
  DEFAULT_WRITE_GUARD_LIMITS,
  writeRefusal,
} from "./catalogue/write-guard.ts";
import { VARIANT_PRICES_SCHEMA_VERSION, variantPricesJsonSchema } from "./catalogue/variant-prices.ts";
import { loadDotEnv, requireEnv } from "./env.ts";
import type { MarketKeyPrice } from "./prices/dollar-basis.ts";
import type { PriceList } from "./prices/price-source.ts";
import { backpackTfPriceSource } from "./sources/backpack-tf.ts";
import {
  type ItemDefinitionSource,
  loadFromGameInstall,
  loadFromMirror,
  MIRROR_URL,
} from "./sources/item-definitions.ts";
import { fetchMarketKeyPrice } from "./sources/steam-market.ts";
import { fetchSchemaItems, STEAM_WEB_API_SOURCE, type WebApiSchemaItem } from "./sources/steam-web-api.ts";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * What the render job's resolve step counted on 2026-09-20 from the same game
 * files (`python -m render.resolve --dry-run`). Both apply the same Cosmetic rule
 * and merge aliases the same way, so a delta is either a schema update or a bug
 * in one of them.
 */
const RENDER_RESOLVE_COSMETICS = 1833;

interface Options {
  readonly tfPath: string | undefined;
  readonly mirror: boolean;
  readonly skipWebApi: boolean;
  readonly skipPrices: boolean;
  readonly skipMarket: boolean;
  readonly maxDrop: number;
  readonly out: string;
  readonly dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options = {
    tfPath: process.env["TF2_INSTALL_PATH"],
    mirror: false,
    skipWebApi: false,
    skipPrices: false,
    skipMarket: false,
    maxDrop: DEFAULT_WRITE_GUARD_LIMITS.maxCosmeticDropFraction,
    out: join(REPO_ROOT, "catalogue/catalogue.json"),
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case "--tf":
        options.tfPath = argv[++index];
        break;
      case "--mirror":
        options.mirror = true;
        break;
      case "--skip-web-api":
        options.skipWebApi = true;
        break;
      case "--skip-prices":
        options.skipPrices = true;
        break;
      case "--skip-market":
        options.skipMarket = true;
        break;
      case "--max-drop": {
        const fraction = Number(argv[++index]);
        if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) {
          throw new Error(`--max-drop takes a fraction between 0 and 1, got ${argv[index]}`);
        }
        options.maxDrop = fraction;
        break;
      }
      case "--out":
        options.out = resolve(argv[++index] ?? "");
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
        console.log(
          [
            "build-catalogue [options]",
            "  --tf <path>      read item definitions from this TF2 'tf' directory",
            "  --mirror         read item definitions from the daily mirror instead",
            "  --skip-web-api   skip Valve's Web API and report the Cosmetic list from the",
            "                   local install alone, writing nothing (no key needed)",
            "  --skip-prices    build the Cosmetic list with no prices in it at all",
            "  --skip-market    skip the Steam Market key price; that Dollar Basis is",
            "                   then recorded as missing",
            "  --max-drop <f>   the fraction of the committed Cosmetic count a run may",
            `                   lose before it refuses to write (default ${DEFAULT_WRITE_GUARD_LIMITS.maxCosmeticDropFraction})`,
            "  --out <path>     where to write the catalogue",
            "  --dry-run        build and report, write nothing",
          ].join("\n"),
        );
        process.exit(0);
      // falls through: process.exit above ends --help
      default:
        throw new Error(`unknown argument ${arg}`);
    }
  }
  return options;
}

async function loadItemDefinitions(options: Options): Promise<ItemDefinitionSource> {
  if (!options.mirror && options.tfPath !== undefined) return loadFromGameInstall(options.tfPath);
  return loadFromMirror(MIRROR_URL);
}

async function loadWebApiItems(options: Options): Promise<{ items: WebApiSchemaItem[]; description: string }> {
  if (options.skipWebApi) {
    return { items: [], description: "skipped (--skip-web-api): names from the local install, no Backpack Icons" };
  }
  const items = await fetchSchemaItems(requireEnv("STEAM_WEB_API_KEY"));
  return { items, description: STEAM_WEB_API_SOURCE };
}

/** The price snapshot, from the one source seam ADR-0002 puts every price behind. */
async function loadPrices(options: Options): Promise<PriceList | undefined> {
  if (options.skipPrices) return undefined;
  return backpackTfPriceSource(requireEnv("BPTF_API_KEY")).load();
}

/**
 * The Steam Market's key price, one Dollar Basis of three. The Market rate-limits
 * an unauthenticated caller, and one missing basis is not worth failing a whole
 * run over, so a failure becomes a warning and that basis is recorded as missing.
 */
async function loadMarketKeyPrice(options: Options, warnings: string[]): Promise<MarketKeyPrice | undefined> {
  if (options.skipMarket) return undefined;
  try {
    return await fetchMarketKeyPrice(new Date().toISOString());
  } catch (error) {
    warnings.push(
      "the Steam Community Market key price did not arrive, so that Dollar Basis is missing: " +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * The committed catalogue the guard holds this run against. Null only when there
 * is no file yet, which is the first run; a file that is there but unreadable
 * stops the run rather than disabling the guard, since a damaged catalogue is
 * exactly the state the guard exists for.
 */
async function loadCommittedCatalogue(path: string): Promise<CommittedCatalogue | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return null; // the first run has nothing to compare against
  }
  const previous = JSON.parse(text) as { header?: { counts?: { cosmetics?: unknown } } };
  const cosmetics = previous.header?.counts?.cosmetics;
  if (typeof cosmetics !== "number") {
    throw new Error(`${path} carries no Cosmetic count, so this run cannot be held against it; nothing was written.`);
  }
  return { path, cosmetics };
}

/** A Dollar Basis as the summary prints it: what a Key and a Refined cost. */
function dollarLine(rate: DollarRate): string {
  return `$${rate.usdPerKey.toFixed(2)} a Key, $${rate.usdPerRefined.toFixed(4)} a Refined`;
}

/** The Market basis prints two rates, either of which the overview may have withheld. */
function marketLine(market: DollarBases["steamCommunityMarket"]): string {
  if (market === null) return "missing";
  const lowest = market.lowest ? `lowest ${dollarLine(market.lowest)}` : "no lowest";
  const median = market.median ? `median ${dollarLine(market.median)}` : "no median";
  return `${lowest}; ${median}`;
}

async function main(): Promise<number> {
  loadDotEnv(join(REPO_ROOT, ".env"));
  const options = parseArgs(process.argv.slice(2));

  const definitions = await loadItemDefinitions(options);
  if (options.skipWebApi && definitions.englishTokens === undefined) {
    // Without either source of English names the job would fall back to items_game's
    // internal names, which differ between the defindexes ADR-0003 merges.
    throw new Error("--skip-web-api needs a local game install for its names; pass --tf or drop --mirror");
  }
  const webApi = await loadWebApiItems(options);
  const prices = await loadPrices(options);
  const runWarnings: string[] = [];
  // A Dollar Basis is anchored to the Key Rate, so with no prices there is none to fetch.
  const marketKeyPrice = prices === undefined ? undefined : await loadMarketKeyPrice(options, runWarnings);

  const { catalogue, variantPrices, exclusions, warnings: buildWarnings } = buildCatalogue({
    itemsGame: definitions.itemsGame,
    webApiItems: webApi.items,
    englishTokens: definitions.englishTokens,
    prices,
    marketKeyPrice,
    snapshotTakenAt: new Date().toISOString(),
    sources: { itemDefinitions: definitions.description, englishNames: webApi.description },
  });

  const warnings = [...runWarnings, ...buildWarnings];
  const counts = catalogue.header.counts;
  const excludedByReason = new Map<string, number>();
  for (const exclusion of exclusions) {
    excludedByReason.set(exclusion.reason, (excludedByReason.get(exclusion.reason) ?? 0) + 1);
  }

  console.log(`catalogue schema v${CATALOGUE_SCHEMA_VERSION}`);
  console.log(`  item definitions   ${definitions.description}`);
  console.log(`  English names      ${webApi.description}`);
  console.log(`  Cosmetics          ${counts.cosmetics}`);
  console.log(`    Class-Exclusive  ${counts.classExclusive}`);
  console.log(`    Multi-Class      ${counts.multiClass}`);
  console.log(`    All-Class        ${counts.allClass}`);
  console.log(`  aliases merged     ${counts.aliasesMerged}`);
  console.log(`  Event-Only         ${counts.eventOnly}`);
  console.log(`  without an icon    ${counts.withoutBackpackIcon}`);
  for (const [reason, count] of [...excludedByReason].sort()) console.log(`  excluded ${reason.padEnd(14)} ${count}`);

  const delta = counts.cosmetics - RENDER_RESOLVE_COSMETICS;
  console.log(
    `  render resolve     ${RENDER_RESOLVE_COSMETICS} Cosmetics` +
      (delta === 0 ? " (agrees)" : ` (delta ${delta > 0 ? "+" : ""}${delta} — explain before committing)`),
  );
  const priceHeader = catalogue.header.prices;
  if (priceHeader === null) {
    console.log("  prices             skipped (--skip-prices)");
  } else {
    console.log(`  prices             ${priceHeader.source}`);
    console.log(`    Key Rate         ${priceHeader.keyRate.notation} (${priceHeader.keyRate.lastUpdatedAt})`);
    console.log(`    priced           ${priceHeader.counts.priced}`);
    for (const [variant, count] of Object.entries(priceHeader.counts.byReferenceVariant)) {
      console.log(`      ${variant.padEnd(22)} ${count}`);
    }
    // Anything but a Unique craftable copy is the Reference Variant rule falling
    // through, which is worth a figure of its own rather than a line to add up.
    const fallbacks = Object.entries(priceHeader.counts.byReferenceVariant)
      .filter(([variant]) => variant !== "unique-craftable")
      .reduce((total, [, count]) => total + count, 0);
    console.log(`    fallbacks used   ${fallbacks}`);
    // A Blanket Price is the source's craft-hat default rather than a figure it
    // observed, so it is worth a count of its own however many take it (ADR-0004).
    console.log(`    Blanket Prices   ${priceHeader.counts.blanketPriced}`);
    console.log(`    Unpriced         ${priceHeader.counts.unpriced}`);
    for (const [reason, count] of Object.entries(priceHeader.counts.unpricedByReason)) {
      console.log(`      ${reason.padEnd(22)} ${count}`);
    }
  }

  if (variantPrices !== null) {
    // What a viewer's own copy can be priced in, which is more than the
    // Reference Variants because that rule only ever picks one. Unusual is
    // absent by design: it is priced by effect and carries no single figure.
    const { counts } = variantPrices.header;
    console.log(`  Variant Prices     ${counts.variants} over ${counts.cosmetics} Cosmetics`);
    for (const [variant, count] of Object.entries(counts.byVariant)) {
      console.log(`    ${variant.padEnd(24)} ${count}`);
    }
  }

  const bases = catalogue.header.dollarBases;
  if (bases === null) {
    console.log("  Dollar Bases       none (no Key Rate to anchor them to)");
  } else {
    console.log("  Dollar Bases");
    console.log(`    Steam Market     ${marketLine(bases.steamCommunityMarket)}`);
    console.log(`    price source     ${bases.priceSource ? dollarLine(bases.priceSource.rate) : "missing"}`);
    console.log(`    Mann Co. Store   ${dollarLine(bases.mannCoStore.rate)}`);
  }

  if (warnings.length > 0) {
    console.log(`  warnings           ${warnings.length}`);
    for (const warning of warnings.slice(0, 10)) console.log(`    ${warning}`);
    if (warnings.length > 10) console.log(`    ... and ${warnings.length - 10} more`);
  }

  if (options.dryRun || options.skipWebApi) {
    // A catalogue built without the Web API would carry internal names and no
    // Backpack Icons, so --skip-web-api reports and never writes.
    console.log(options.dryRun ? "dry run: nothing written" : "--skip-web-api: reported only, nothing written");
    return 0;
  }

  // The committed file is what the site serves, so a run that lost Cosmetics or
  // prices reports why and leaves the good snapshot in place.
  const refusal = writeRefusal(catalogue, await loadCommittedCatalogue(options.out), {
    ...DEFAULT_WRITE_GUARD_LIMITS,
    maxCosmeticDropFraction: options.maxDrop,
  });
  if (refusal !== undefined) throw new Error(refusal);

  const folder = dirname(options.out);
  await mkdir(folder, { recursive: true });
  await writeFile(options.out, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");
  const schemaPath = join(folder, `catalogue.v${CATALOGUE_SCHEMA_VERSION}.schema.json`);
  await writeFile(schemaPath, `${JSON.stringify(catalogueJsonSchema(), null, 2)}\n`, "utf8");
  console.log(`wrote ${options.out}`);
  console.log(`wrote ${schemaPath}`);

  // The second document of the run. It is written after the catalogue and under
  // the same guard: a run refused for losing Cosmetics never reaches here, so
  // the committed pair can never be half of one snapshot and half of another.
  // A run with no price source writes neither the prices nor this, and leaves
  // whatever is committed alone rather than replacing it with an empty file.
  if (variantPrices !== null) {
    const variantsPath = join(folder, "variant-prices.json");
    const variantsSchemaPath = join(folder, `variant-prices.v${VARIANT_PRICES_SCHEMA_VERSION}.schema.json`);
    await writeFile(variantsPath, `${JSON.stringify(variantPrices, null, 2)}\n`, "utf8");
    await writeFile(variantsSchemaPath, `${JSON.stringify(variantPricesJsonSchema(), null, 2)}\n`, "utf8");
    console.log(`wrote ${variantsPath}`);
    console.log(`wrote ${variantsSchemaPath}`);
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
