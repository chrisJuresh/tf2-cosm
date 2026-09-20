/**
 * Valve's Web API: English display names and Backpack Icon URLs.
 *
 * GetSchemaItems is paginated; each page carries the `next` cursor for the one
 * after it. The icon URLs contain a content hash and are not derivable from
 * items_game, which is why this leg exists at all.
 */

export interface WebApiSchemaItem {
  readonly defindex: number;
  /** The internal name, e.g. "The Team Captain". */
  readonly name: string;
  /** The English display name, e.g. "Team Captain". */
  readonly item_name?: string;
  readonly proper_name?: boolean;
  readonly item_slot?: string;
  readonly item_class?: string;
  readonly item_type_name?: string;
  readonly image_url?: string | null;
  readonly image_url_large?: string | null;
  readonly styles?: readonly { readonly name: string }[];
}

/** The Backpack Icon pair, or null when Valve published neither or only one. */
export function backpackIconOf(
  item: WebApiSchemaItem | undefined,
): { small: string; large: string } | null {
  const small = item?.image_url;
  const large = item?.image_url_large;
  return small && large ? { small, large } : null;
}

interface GetSchemaItemsResponse {
  readonly result?: {
    readonly status?: number;
    readonly items?: readonly WebApiSchemaItem[];
    readonly next?: number;
  };
}

const ENDPOINT = "https://api.steampowered.com/IEconItems_440/GetSchemaItems/v0001/";
const MAX_PAGES = 100;

export const STEAM_WEB_API_SOURCE = `${ENDPOINT} (IEconItems_440/GetSchemaItems v0001)`;

/** Every page of the item schema, in the order Valve returns them. */
export async function fetchSchemaItems(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WebApiSchemaItem[]> {
  const items: WebApiSchemaItem[] = [];
  let start: number | undefined = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("language", "en_US");
    if (start !== undefined) url.searchParams.set("start", String(start));

    const response = await fetchImpl(url);
    if (!response.ok) {
      // The key is in the query string; never put the URL in the message.
      throw new Error(`GetSchemaItems page ${page} failed: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as GetSchemaItemsResponse;
    const result = body.result;
    if (!result?.items) throw new Error(`GetSchemaItems page ${page} returned no items`);
    items.push(...result.items);
    if (result.next === undefined) return items;
    start = result.next;
  }
  throw new Error(`GetSchemaItems did not finish within ${MAX_PAGES} pages`);
}
