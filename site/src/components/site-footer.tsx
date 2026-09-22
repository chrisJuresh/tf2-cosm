/**
 * Where everything on the page came from: whose work it is, and how old the
 * figures are.
 *
 * Nothing on the page is the site's own, and every
 * one of these sources is used on terms that ask to be named, so the credit is
 * part of the page rather than a courtesy.
 *
 * The price source is named here even though ADR-0002 keeps it swappable, and
 * `format.ts` takes pains not to name it. A credit needs somewhere to send the
 * reader and the header carries no link, so swapping the source means editing
 * this list — which is the one place in the site where naming the vendor is the
 * whole point.
 *
 * The snapshot's dates are handed in rather than read here, because which rate's
 * date it is depends on the Dollar Basis in force, and that is the view's to
 * know. They belong down here because they are provenance like the rest of it: a
 * viewer wants to know how old the page is once, and a line of the header is a
 * row of Cosmetics the grid does not get.
 */
import type { ReactNode } from "react";

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

export interface SiteFooterProps {
  /** When the snapshot was taken, and when the active basis's rate was quoted. */
  readonly provenance?: ReactNode;
}

export function SiteFooter({ provenance }: SiteFooterProps = {}) {
  return (
    <footer className="w-full shrink-0 border-t border-line bg-panel px-3 py-2 text-xs text-ink-muted sm:px-4">
      {provenance === undefined ? null : <p className="pb-1">{provenance}</p>}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {CREDITS.map((credit) => (
          <li key={credit.name}>
            <a
              href={credit.href}
              target="_blank"
              // The page carries nothing about the viewer, and an outbound click
              // should not start carrying something either.
              rel="noreferrer noopener"
              className="font-semibold text-ink underline decoration-line-strong decoration-dotted underline-offset-2 hover:text-accent hover:decoration-accent focus-visible:outline-2 focus-visible:outline-accent"
            >
              {credit.name}
            </a>
            {/* What each source gave takes the credits from one line to five on
                a phone, which is two rows of Cosmetics. The names and the links
                — the part that is the credit — stay at every width. */}
            <span className="hidden sm:inline"> — {credit.gave}</span>
          </li>
        ))}
      </ul>
    </footer>
  );
}
