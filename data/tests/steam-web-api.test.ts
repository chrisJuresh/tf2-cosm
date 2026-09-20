import { describe, expect, it } from "vitest";

import { fetchSchemaItems } from "../src/sources/steam-web-api.ts";

/** Two saved pages, trimmed: the first carries the cursor to the second. */
const PAGES = [
  { result: { status: 1, items: [{ defindex: 94, name: "Texas Ten Gallon" }], next: 95 } },
  { result: { status: 1, items: [{ defindex: 378, name: "The Team Captain" }] } },
];

function stubFetch(pages: readonly unknown[], seen: URL[] = []): { fetch: typeof fetch; seen: URL[] } {
  let page = 0;
  const fetchImpl = ((url: URL) => {
    seen.push(url);
    return Promise.resolve(new Response(JSON.stringify(pages[page++]), { status: 200 }));
  }) as unknown as typeof fetch;
  return { fetch: fetchImpl, seen };
}

describe("GetSchemaItems", () => {
  it("follows the next cursor until a page has none, and concatenates the items", async () => {
    const { fetch, seen } = stubFetch(PAGES);
    const items = await fetchSchemaItems("a-key", fetch);
    expect(items.map((item) => item.defindex)).toEqual([94, 378]);
    expect(seen.map((url) => url.searchParams.get("start"))).toEqual(["0", "95"]);
    expect(seen[0]?.searchParams.get("language")).toBe("en_US");
  });

  it("fails on a bad response without putting the key in the message", async () => {
    const fetchImpl = (() => Promise.resolve(new Response("nope", { status: 403, statusText: "Forbidden" }))) as unknown as typeof fetch;
    await expect(fetchSchemaItems("a-secret-key", fetchImpl)).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("a-secret-key") }) as Error,
    );
  });
});
