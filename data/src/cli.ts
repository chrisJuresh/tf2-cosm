/**
 * `pnpm build-catalogue` — the one command that builds the catalogue.
 *
 * Fetches the source payloads, hands them to the pure builder, validates the
 * result against the catalogue schema and writes it. Prices (#10) and the Dollar
 * Basis header (#11) hang off the same command later.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalogue } from "./catalogue/build.ts";
import { CATALOGUE_SCHEMA_VERSION, catalogueJsonSchema } from "./catalogue/schema.ts";
import { loadDotEnv, requireEnv } from "./env.ts";
import {
  type ItemDefinitionSource,
  loadFromGameInstall,
  loadFromMirror,
  MIRROR_URL,
} from "./sources/item-definitions.ts";
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
  readonly out: string;
  readonly dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options = {
    tfPath: process.env["TF2_INSTALL_PATH"],
    mirror: false,
    skipWebApi: false,
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

  const { catalogue, exclusions, warnings } = buildCatalogue({
    itemsGame: definitions.itemsGame,
    webApiItems: webApi.items,
    englishTokens: definitions.englishTokens,
    snapshotTakenAt: new Date().toISOString(),
    sources: { itemDefinitions: definitions.description, englishNames: webApi.description },
  });

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
  console.log(`  without an icon    ${counts.withoutBackpackIcon}`);
  for (const [reason, count] of [...excludedByReason].sort()) console.log(`  excluded ${reason.padEnd(14)} ${count}`);

  const delta = counts.cosmetics - RENDER_RESOLVE_COSMETICS;
  console.log(
    `  render resolve     ${RENDER_RESOLVE_COSMETICS} Cosmetics` +
      (delta === 0 ? " (agrees)" : ` (delta ${delta > 0 ? "+" : ""}${delta} — explain before committing)`),
  );
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

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, `${JSON.stringify(catalogue, null, 2)}\n`, "utf8");
  const schemaPath = join(dirname(options.out), `catalogue.v${CATALOGUE_SCHEMA_VERSION}.schema.json`);
  await writeFile(schemaPath, `${JSON.stringify(catalogueJsonSchema(), null, 2)}\n`, "utf8");
  console.log(`wrote ${options.out}`);
  console.log(`wrote ${schemaPath}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
