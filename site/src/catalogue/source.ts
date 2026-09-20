/**
 * Where the two documents the site is built from are read from, and what
 * happens when one of them is wrong.
 *
 * The catalogue and the Worn Render manifest are committed together under
 * `catalogue/`, and that folder is the default. It is a default rather than a
 * constant for one reason: the end-to-end suite builds the whole site against
 * the fixture pair, and a build driven by the committed catalogue could only
 * ever prove the page works for today's snapshot. So the folder is
 * configuration — `CATALOGUE_DIR` — on the same terms as
 * `NEXT_PUBLIC_RENDER_BASE_URL` is for the pictures.
 *
 * Both documents are read from disk while the page is being built rather than
 * imported as modules. The result is the same either way — a static export has
 * no server, so whatever is read here is baked into the exported page and
 * nothing is fetched afterwards (ADR-0002) — but a path that is read can be a
 * path that was chosen, and a module specifier cannot.
 *
 * Nothing here is forgiving. A document that is missing, is not JSON, or does
 * not match its schema throws, and a throw while a page is being generated
 * fails `next build`: a broken data run cannot deploy a page of wrong numbers
 * or missing pictures.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The committed pair: `catalogue/` at the repository root, one level above this
 * package.
 *
 * Off the working directory rather than off this module's own path, because
 * this module is bundled and a bundle's idea of where it came from is the
 * bundler's business. Both things that run it — `next build` and `vitest` — run
 * with this package as the working directory, and Next requires that anyway.
 */
export const DEFAULT_CATALOGUE_DIR = resolve(process.cwd(), "..", "catalogue");

/** Which folder this build reads its two documents from. */
export function catalogueDir(): string {
  const configured = process.env.CATALOGUE_DIR?.trim();
  return configured === undefined || configured === "" ? DEFAULT_CATALOGUE_DIR : resolve(configured);
}

/**
 * What a reader of the build log needs to see first, before Next's own stack:
 * which file, and that the build stopped because of that file rather than in
 * spite of it. The end-to-end suite matches on this phrasing, because "the
 * build fails with a clear message" is only worth asserting if the message is
 * fixed enough to assert.
 */
function refusal(path: string, why: string, detail: string): Error {
  return new Error(`the site will not build from ${path}: ${why}\n${detail}`);
}

/**
 * Zod names the offending field and says what is wrong with it; all that is
 * missing is somewhere to put it. Ten is enough to work from — a document a
 * version out of step can fail on every Cosmetic it has, and a thousand lines of
 * that tell a reader nothing the first ten did not.
 */
const LISTED_ISSUES = 10;

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

function detailOf(error: unknown): string {
  if (!(error instanceof Error)) return `  ${String(error)}`;
  const { issues } = error as { issues?: readonly Issue[] };
  if (issues === undefined) return `  ${error.message}`;
  const lines = issues.slice(0, LISTED_ISSUES).map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  const more = issues.length > LISTED_ISSUES ? [`  ...and ${issues.length - LISTED_ISSUES} more`] : [];
  return [...lines, ...more].join("\n");
}

/**
 * One of the two documents, read and checked — or a thrown error naming the file
 * and what is wrong with it.
 */
export function loadDocument<T>(name: string, validate: (document: unknown) => T): T {
  const path = join(catalogueDir(), name);

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw refusal(path, "there is no such file.", detailOf(error));
  }

  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch (error) {
    throw refusal(path, "it is not valid JSON.", detailOf(error));
  }

  try {
    return validate(document);
  } catch (error) {
    throw refusal(path, "it does not match its schema.", detailOf(error));
  }
}
