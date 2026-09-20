/**
 * Whose work this page is showing. Nothing on it is the site's own, and every
 * one of these sources is used on terms that ask to be named, so the credit is
 * part of the page rather than a courtesy.
 *
 * The price source is named here even though ADR-0002 keeps it swappable, and
 * `format.ts` takes pains not to name it. A credit needs somewhere to send the
 * reader and the header carries no link, so swapping the source means editing
 * this list — which is the one place in the site where naming the vendor is the
 * whole point.
 */
interface Credit {
  readonly name: string;
  readonly href: string;
  /** What this source actually gave the page. */
  readonly gave: string;
}

const CREDITS: readonly Credit[] = [
  { name: "Valve", href: "https://www.teamfortress.com/", gave: "item schema, icons and game assets" },
  { name: "backpack.tf", href: "https://backpack.tf/", gave: "prices" },
  { name: "Steam Community Market", href: "https://steamcommunity.com/market/", gave: "the Key's dollar price" },
  { name: "SourceIO", href: "https://github.com/REDxEYE/SourceIO", gave: "model import for the renders" },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 py-3 text-xs text-black/50 sm:px-6 dark:text-white/50">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {CREDITS.map((credit) => (
          <li key={credit.name}>
            <a
              href={credit.href}
              target="_blank"
              // The page carries nothing about the viewer, and an outbound click
              // should not start carrying something either.
              rel="noreferrer noopener"
              className="underline decoration-dotted underline-offset-2 hover:text-black dark:hover:text-white"
            >
              {credit.name}
            </a>{" "}
            — {credit.gave}
          </li>
        ))}
      </ul>
    </footer>
  );
}
