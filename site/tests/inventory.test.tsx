/**
 * The Inventory view as a viewer meets it: pasting a profile, what the page says
 * back, and what the grid does about it.
 *
 * The rules are covered in `owned.test.ts`, driven directly. What is asserted
 * here is the surface — that the control is labelled and reachable, that every
 * failure reads as a sentence, and that a card of a Cosmetic the viewer owns
 * shows their copy's figure rather than the Cosmetic's.
 *
 * The proxy is answered here rather than reached. Its own suite covers turning
 * Steam's payload into Owned Copies; what this needs is the shape it answers in,
 * and `worker/tests/fixtures/inventory.json` is that shape as the Worker itself
 * is driven against it.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fixtureBasis, fixtureCosmetics, fixtureKeyRate, fixtureSnapshotTakenAt } from "./fixtures.ts";
import goldenPrices from "../../data/tests/golden/variant-prices.json" with { type: "json" };

import { CatalogueBrowser } from "@/components/catalogue-browser";
import { forgetVariantPrices, VARIANT_PRICES_URL } from "@/inventory/load";
import { PROFILE_STORAGE_KEY } from "@/inventory/use-inventory";
import { EMPTY_MANIFEST } from "@/renders/manifest";

const PROXY = "https://inventory.example.test";

const cosmetics = fixtureCosmetics();

function defindexOf(slug: string): number {
  const cosmetic = cosmetics.find((one) => one.slug === slug);
  if (cosmetic === undefined) throw new Error(`no fixture Cosmetic ${slug}`);
  return cosmetic.defindex;
}

/** What the proxy answers with, in its own shape. */
function inventory(copies: { defindex: number; quality?: string; craftable?: boolean; count?: number; effect?: string }[]) {
  return {
    steamId: "76561197960435530",
    takenAt: "2026-09-21T02:51:51.168Z",
    copies: copies.map((one) => ({
      defindex: one.defindex,
      quality: one.quality ?? "unique",
      craftable: one.craftable ?? true,
      tradable: true,
      count: one.count ?? 1,
      ...(one.effect === undefined ? {} : { effect: one.effect }),
    })),
    counts: { items: copies.length, copies: copies.length, unreadable: 0 },
  };
}

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * Every request the page makes, answered. Anything it asks for that is not one
 * of the two it is meant to ask for fails the test rather than falling through
 * to the real network.
 */
function serve(inventoryAnswer: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === VARIANT_PRICES_URL) return Promise.resolve(answer(goldenPrices));
      if (url.startsWith(`${PROXY}/inventory?q=`)) return Promise.resolve(inventoryAnswer());
      return Promise.reject(new Error(`unexpected request to ${url}`));
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_INVENTORY_API_URL", PROXY);
  forgetVariantPrices();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  history.replaceState(null, "", "/");
});

function renderBrowser() {
  render(
    <CatalogueBrowser
      cosmetics={cosmetics}
      manifest={EMPTY_MANIFEST}
      keyRate={fixtureKeyRate()}
      basis={fixtureBasis()}
      snapshotTakenAt={fixtureSnapshotTakenAt()}
    />,
  );
  return userEvent.setup();
}

async function look(user: ReturnType<typeof userEvent.setup>, asked: string) {
  await user.type(screen.getByLabelText("Your Steam profile"), asked);
  await user.click(screen.getByRole("button", { name: "Show what I own" }));
}

function cardFor(slug: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
}

describe("asking for a backpack", () => {
  it("offers a labelled box a viewer can reach from the keyboard", async () => {
    serve(() => answer(inventory([])));
    const user = renderBrowser();
    await user.tab();
    // The profile box is the first control on the page, because it is the one
    // the whole feature hangs off.
    expect(document.activeElement).toBe(screen.getByLabelText("Your Steam profile"));
  });

  it("shows what the viewer owns, marked on the card", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain"), count: 2 }])));
    const user = renderBrowser();
    await look(user, "robinwalker");

    await waitFor(() => expect(within(cardFor("team-captain") as HTMLElement).getByText("Owned ×2")).toBeInTheDocument());

    // A Cosmetic they do not own carries no mark — which needs the rest of the
    // catalogue back, since a backpack narrows to itself on arrival.
    await user.click(screen.getByLabelText("Only what I own"));
    const other = cosmetics.find((one) => one.slug !== "team-captain");
    await waitFor(() =>
      expect(within(cardFor(other?.slug ?? "") as HTMLElement).queryByText(/Owned/)).toBeNull(),
    );
  });

  it("prices the copy they hold, not the copy the catalogue prices", async () => {
    // The fixture Stove Pipe's Reference Price is its blanket Unique figure —
    // the price of any craft hat — and a Genuine copy of it is worth something
    // else entirely. The card has to follow the copy in their hands.
    serve(() => answer(inventory([{ defindex: defindexOf("scotsmans-stove-pipe"), quality: "genuine" }])));
    const user = renderBrowser();
    const before = within(cardFor("scotsmans-stove-pipe") as HTMLElement).getAllByRole("definition")[0]?.textContent;
    await look(user, "robinwalker");

    await waitFor(() => {
      const card = cardFor("scotsmans-stove-pipe") as HTMLElement;
      expect(within(card).getByText("Genuine")).toBeInTheDocument();
      expect(within(card).getAllByRole("definition")[0]?.textContent).not.toBe(before);
    });
  });

  it("says an Unusual is priced by its effect rather than showing the Unique figure", async () => {
    serve(() =>
      answer(inventory([{ defindex: defindexOf("team-captain"), quality: "unusual", effect: "Burning Flames" }])),
    );
    const user = renderBrowser();
    await look(user, "robinwalker");

    await waitFor(() => {
      const card = cardFor("team-captain") as HTMLElement;
      expect(within(card).getByText("Priced by its effect")).toBeInTheDocument();
      expect(within(card).getByText(/Burning Flames/)).toBeInTheDocument();
    });
  });

  it("totals what the backpack comes to, and says what it left out", async () => {
    serve(() =>
      answer(
        inventory([
          { defindex: defindexOf("team-captain") },
          { defindex: defindexOf("team-captain"), quality: "unusual" },
        ]),
      ),
    );
    const user = renderBrowser();
    await look(user, "robinwalker");

    // A total that quietly dropped the Unusual would read as the backpack's
    // worth and be wrong by more than the rest of it put together.
    await waitFor(() => expect(screen.getByText(/leaving out 1 Unusual priced by its effect/)).toBeInTheDocument());
  });
});

describe("narrowing the catalogue to what a viewer owns", () => {
  it("leaves the toggle disabled until there is a backpack to narrow to", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    const toggle = screen.getByLabelText("Only what I own");
    expect(toggle).toBeDisabled();

    await look(user, "robinwalker");
    await waitFor(() => expect(toggle).toBeEnabled());
  });

  it("shows only what they own as soon as the backpack lands, without being asked", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    await look(user, "robinwalker");
    await waitFor(() => expect(screen.getByLabelText("Only what I own")).toBeChecked());

    await waitFor(() => {
      expect(cardFor("team-captain")).not.toBeNull();
      expect(cardFor("crocodile-smile")).toBeNull();
    });
  });

  it("puts the rest of the catalogue back when the toggle is cleared", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    await look(user, "robinwalker");
    await waitFor(() => expect(cardFor("scotsmans-stove-pipe")).toBeNull());

    await user.click(screen.getByLabelText("Only what I own"));
    await waitFor(() => expect(cardFor("scotsmans-stove-pipe")).not.toBeNull());
  });

  it("leaves out everything that is not a Cosmetic, with no rule of its own to do it", async () => {
    // A Rocket Launcher and a crate. The catalogue is the Cosmetic rule.
    serve(() => answer(inventory([{ defindex: 18 }, { defindex: 5022 }, { defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    await look(user, "robinwalker");
    await waitFor(() => expect(screen.getByLabelText("Only what I own")).toBeEnabled());

    await waitFor(() => expect(screen.getByText(/1 Cosmetics · 1 copies priced at/)).toBeInTheDocument());
  });
});

describe("when a backpack cannot be read", () => {
  it("passes the proxy's own sentence on, because it is the side that knows why", async () => {
    serve(() =>
      answer(
        {
          error: "private-inventory",
          message: "That backpack is private. Steam only shows an inventory the owner has made public.",
        },
        403,
      ),
    );
    const user = renderBrowser();
    await look(user, "robinwalker");

    await waitFor(() => expect(screen.getByText(/That backpack is private/)).toBeInTheDocument());
    // It is announced, not only drawn: a viewer working the page from the
    // keyboard hears it rather than watching the grid stay as it was. Scoped to
    // the Inventory's own region, because the control bar has a live count of
    // its own and both are legitimately statuses.
    const region = screen.getByRole("region", { name: "Your Steam inventory" });
    expect(within(region).getByRole("status")).toHaveTextContent(/That backpack is private/);
  });

  it("says something a person can act on when the proxy cannot be reached at all", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const user = renderBrowser();
    await look(user, "robinwalker");

    await waitFor(() => expect(screen.getByText(/Could not reach the inventory service/)).toBeInTheDocument());
  });

  it("still narrows the catalogue when the prices for each Quality will not load", async () => {
    // The Inventory is the filter the viewer asked for; the figures are extra.
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === VARIANT_PRICES_URL) return Promise.resolve(new Response("nope", { status: 500 }));
        return Promise.resolve(answer(inventory([{ defindex: defindexOf("team-captain") }])));
      }),
    );
    const user = renderBrowser();
    await look(user, "robinwalker");

    await waitFor(() => expect(screen.getByText(/prices for each Quality did not load/)).toBeInTheDocument());
    expect(screen.getByLabelText("Only what I own")).toBeEnabled();
  });

  it("says so plainly when the backpack holds no Cosmetics at all", async () => {
    serve(() => answer(inventory([{ defindex: 18 }])));
    const user = renderBrowser();
    await look(user, "robinwalker");

    await waitFor(() => expect(screen.getByText(/none of them is a Cosmetic/)).toBeInTheDocument());
  });
});

describe("what the browser remembers", () => {
  it("remembers the profile, so a viewer does not type their own twice", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    await look(user, "robinwalker");
    await waitFor(() => expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe("robinwalker"));
  });

  it("lets the viewer empty the box they last looked up in", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    await look(user, "robinwalker");
    await waitFor(() => expect(cardFor("team-captain")).not.toBeNull());

    const box = screen.getByLabelText("Your Steam profile") as HTMLInputElement;
    await user.clear(box);
    // Clearing it has to leave it cleared. The remembered profile is what the
    // box starts at, not what it falls back to on every keystroke.
    expect(box.value).toBe("");
    expect(screen.getByRole("button", { name: "Show what I own" })).toBeDisabled();
  });

  it("does not remember the backpack, which goes stale the moment they trade", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    await look(user, "robinwalker");
    await waitFor(() => expect(cardFor("team-captain")).not.toBeNull());

    const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? "");
    expect(stored.some((value) => value.includes("defindex"))).toBe(false);
  });

  it("forgets the profile when asked to", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    await look(user, "robinwalker");
    await waitFor(() => expect(screen.getByRole("button", { name: "Forget" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Forget" }));
    await waitFor(() => expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBeNull());
    expect(screen.getByLabelText("Only what I own")).toBeDisabled();
  });
});

describe("the profile in the address bar", () => {
  it("puts the profile a viewer looked up in the URL, so the page they are on is the page they can send", async () => {
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const before = history.length;
    const user = renderBrowser();
    await look(user, "robinwalker");

    await waitFor(() => expect(location.search).toBe("?profile=robinwalker"));
    // Replaced rather than pushed: a lookup is what this page does, not
    // somewhere else the viewer went.
    expect(history.length).toBe(before);
  });

  it("reads the backpack a link names, without being asked twice", async () => {
    history.replaceState(null, "", "/?profile=robinwalker");
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    renderBrowser();

    await waitFor(() => expect(within(cardFor("team-captain") as HTMLElement).getByText("Owned")).toBeInTheDocument());
    expect((screen.getByLabelText("Your Steam profile") as HTMLInputElement).value).toBe("robinwalker");
  });

  it("does not take somebody else's profile to be the viewer's own", async () => {
    // A link is about whoever sent it. Coming back to the page tomorrow should
    // show the viewer their own backpack, not the one they were once shown.
    history.replaceState(null, "", "/?profile=gaben");
    localStorage.setItem(PROFILE_STORAGE_KEY, "robinwalker");
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    renderBrowser();

    await waitFor(() => expect(cardFor("team-captain")).not.toBeNull());
    expect(localStorage.getItem(PROFILE_STORAGE_KEY)).toBe("robinwalker");
  });

  it("takes the profile back out of the URL when the viewer forgets it", async () => {
    history.replaceState(null, "", "/?profile=robinwalker");
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    const user = renderBrowser();
    await waitFor(() => expect(screen.getByRole("button", { name: "Forget" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Forget" }));
    await waitFor(() => expect(location.search).toBe(""));
  });

  it("leaves a remembered profile out of the URL until it is asked for", async () => {
    // What this browser remembers fills the box; it does not make the address
    // bar claim to be a link about somebody.
    localStorage.setItem(PROFILE_STORAGE_KEY, "robinwalker");
    serve(() => answer(inventory([{ defindex: defindexOf("team-captain") }])));
    renderBrowser();

    await waitFor(() =>
      expect((screen.getByLabelText("Your Steam profile") as HTMLInputElement).value).toBe("robinwalker"),
    );
    expect(location.search).toBe("");
  });
});

describe("a deployment with no inventory proxy", () => {
  it("does not offer the feature at all, rather than offering it broken", () => {
    vi.stubEnv("NEXT_PUBLIC_INVENTORY_API_URL", "");
    serve(() => answer(inventory([])));
    renderBrowser();
    expect(screen.queryByLabelText("Your Steam profile")).toBeNull();
    expect(screen.getByLabelText("Only what I own")).toBeDisabled();
  });
});
